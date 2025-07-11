import { Injectable } from '@nestjs/common';
import { DataSourceService } from '../../connection/datasource.service';
import { SelectQuery } from '../../connection/helpers/select-query';
import { BaseService } from '../../../common/base-service';
import { CoreService } from 'src/core/core.service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { PrecioVentaProductoDto } from './dto/precio-venta-producto.dto';
import { GeneraConfigPreciosVentaDto } from './dto/genera-config-precio.dto';
import { IdeDto } from 'src/common/dto/ide.dto';
import { ObjectQueryDto } from 'src/core/connection/dto';
import { DeleteQuery } from 'src/core/connection/helpers';
import { ArrayIdeDto } from 'src/common/dto/array-ide.dto';
import { GetConfigPrecioProductoDto } from './dto/get-config-precios.dto';
import { SaveConfigPrecioDto } from './dto/save-config-precios.dto';
import { validateInsertConfigPrecio, validateUpdateConfigPrecio } from './helpers/validations';
import { CopiarConfigPreciosVentaDto } from './dto/copiar-config-precios.dto';

@Injectable()
export class ConfigPreciosProductosService extends BaseService {

    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService
    ) {
        super();
        // obtiene las variables del sistema para el servicio
        this.dataSource.getVariables([
            'p_inv_estado_normal',  // 1
            'p_cxp_estado_factura_normal', // 0
            'p_cxc_estado_factura_normal'  // 0
        ]).then(result => {
            this.variables = result;
        });
    }

    async getPrecioVentaProducto(dtoIn: PrecioVentaProductoDto & HeaderParamsDto) {
        const query = new SelectQuery(`
        SELECT
            a.*,
            nombre_cncfp,
            nombre_cndfp,
            dias_cndfp
        FROM
            f_calcula_precio_venta ($1, $2, $3) a
            LEFT JOIN con_deta_forma_pago fp ON a.forma_pago_config = fp.ide_cndfp
            LEFT JOIN con_cabece_forma_pago cp ON fp.ide_cncfp = cp.ide_cncfp
        `);
        query.addParam(1, dtoIn.ide_inarti);
        query.addParam(2, dtoIn.cantidad);
        query.addParam(3, dtoIn.ide_cndfp);
        return await this.dataSource.createSelectQuery(query);
    }


    async generarConfigPreciosVenta(dtoIn: GeneraConfigPreciosVentaDto & HeaderParamsDto) {
        const query = new SelectQuery(`
        SELECT f_generar_config_precios($1, $2, $3, $4)`);
        query.addParam(1, dtoIn.ideEmpr);
        query.addParam(2, dtoIn.ide_inarti);
        query.addParam(3, dtoIn.fechaInicio);
        query.addParam(4, dtoIn.fechaFin);
        await this.dataSource.createSelectQuery(query);
        return { message: 'ok' };
    }


    async getConfigPreciosProducto(dtoIn: GetConfigPrecioProductoDto & HeaderParamsDto) {

        const condition = dtoIn.activos === 'true' ? ` and activo_incpa = true` : "";

        const query = new SelectQuery(`
        SELECT
            ide_incpa,
            a.ide_inarti,
            rangos_incpa,
            rango1_cant_incpa,
            rango2_cant_incpa,
            siglas_inuni,
            precio_fijo_incpa,
            porcentaje_util_incpa,
            incluye_iva_incpa,
            observacion_incpa,
            activo_incpa,
            rango_infinito_incpa,
            autorizado_incpa,
            nombre_inarti,
            a.ide_cncfp,
            cp.nombre_cncfp,
            fp.ide_cndfp,
            fp.nombre_cndfp,
            uuid,
            a.usuario_ingre,
            a.hora_ingre,
            a.usuario_actua,
            a.usuario_actua
        FROM
            inv_conf_precios_articulo a
            INNER JOIN inv_articulo b ON a.ide_inarti = b.ide_inarti
            LEFT JOIN inv_unidad c ON b.ide_inuni = c.ide_inuni
            LEFT JOIN con_deta_forma_pago fp ON a.ide_cndfp = fp.ide_cndfp
            LEFT JOIN con_cabece_forma_pago cp ON a.ide_cncfp = cp.ide_cncfp
        WHERE
            a.ide_inarti = $1
            ${condition}
        ORDER BY  nombre_cncfp,nombre_cndfp,rangos_incpa, rango1_cant_incpa
        `, dtoIn);
        query.addParam(1, dtoIn.ide_inarti);
        return await this.dataSource.createQuery(query);
    }



    async saveConfigPrecios(dtoIn: SaveConfigPrecioDto & HeaderParamsDto) {
        const module = "inv";
        const tableName= "conf_precios_articulo";
        const primaryKey= "ide_incpa";

        if (dtoIn.isUpdate === true) {
            // Actualiza
            const isValid = validateUpdateConfigPrecio(dtoIn);
            if (isValid) {
                const ide_incpa = dtoIn.data.ide_incpa;
                const objQuery = {
                    operation: "update",
                    module,
                    tableName,
                    primaryKey,
                    object: dtoIn.data,
                    condition: `${primaryKey} = ${ide_incpa}`
                } as ObjectQueryDto;
                return await this.core.save({
                    ...dtoIn, listQuery: [objQuery], audit: true
                });
            }
        }
        else {
            // Crear
            const isValid = validateInsertConfigPrecio(dtoIn);
            if (isValid === true) {
                dtoIn.data.ide_incpa = await this.dataSource.getSeqTable(`${module}_${tableName}`, primaryKey, 1, dtoIn.login);
                const objQuery = {
                    operation: "insert",
                    module,
                    tableName,
                    primaryKey,
                    object: dtoIn.data,
                } as ObjectQueryDto;
                return await this.core.save({
                    ...dtoIn, listQuery: [objQuery], audit: true
                });
            }
        }

    }

    async findConfigPreciosById(dtoIn: IdeDto & HeaderParamsDto) {
        const dto = {
            module: 'inv',
            tableName: 'conf_precios_articulo',
            primaryKey: 'ide_incpa',
            value: dtoIn.ide
        }
        return await this.core.findById({ ...dto, ...dtoIn });
    }


    async deleteConfigPrecios(dtoIn: ArrayIdeDto) {
        const deleteQuery = new DeleteQuery("inv_conf_precios_articulo");
        deleteQuery.where = 'ide_incpa = ANY ($1)';
        deleteQuery.addParam(1, dtoIn.ide);
        return await this.dataSource.createQuery(deleteQuery);
    }


    async copiarConfigPrecios(dtoIn: CopiarConfigPreciosVentaDto & HeaderParamsDto) {
        const query = new SelectQuery(`
        SELECT f_copiar_config_precios($1, ARRAY[${dtoIn.values}]::integer[], $2)
        `);
        query.addParam(1, dtoIn.ide_inarti);
        query.addParam(2, dtoIn.login);
        await this.dataSource.createSelectQuery(query);
        return { message: 'ok' };
    }




}
