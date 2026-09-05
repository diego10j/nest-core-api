import { BadRequestException, Injectable } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';

import { GetAnticiposProveedorDto } from './dto/anticipo-proveedor-query.dto';

/**
 * Consultas de Anticipo a Proveedores: pago anticipado a un proveedor sin factura todavía,
 * contabilizado contra una cuenta de activo dedicada (ver AsientosAutomaticosService.
 * generarAsientoAnticipoProveedor). El guardado (registrar/liquidar/anular) vive en
 * AnticipoProveedorSaveService.
 */
@Injectable()
export class AnticipoProveedorService {
    constructor(private readonly dataSource: DataSourceService) { }

    /** Anticipos activos (no anulados) de un proveedor, con su saldo disponible para liquidar.
     * Sin ide_geper, lista todos (tabla de control general). */
    async getAnticiposProveedor(dtoIn: GetAnticiposProveedorDto & HeaderParamsDto) {
        const condicionProveedor = dtoIn.ide_geper ? `AND c.ide_geper = ${Number(dtoIn.ide_geper)}` : '';
        const query = new SelectQuery(`
            SELECT
                c.ide_teanp,
                c.ide_geper,
                p.nom_geper AS proveedor,
                p.identificac_geper,
                c.valor_teanp,
                c.valor_liquidado_teanp,
                (c.valor_teanp - c.valor_liquidado_teanp) AS saldo_teanp,
                c.fecha_teanp,
                c.observacion_teanp,
                c.ide_teeap,
                e.nombre_teeap AS estado,
                e.color_teeap AS color_estado,
                c.hora_ingre
            FROM tes_cab_anticipo_prov c
            INNER JOIN gen_persona p              ON c.ide_geper = p.ide_geper
            INNER JOIN tes_estado_anticipo_prov e ON c.ide_teeap = e.ide_teeap
            WHERE c.ide_empr = $1
              AND c.ide_sucu = $2
              AND c.activo_teanp = true
              ${condicionProveedor}
            ORDER BY c.fecha_teanp DESC, c.ide_teanp DESC
        `);
        query.addIntParam(1, dtoIn.ideEmpr);
        query.addIntParam(2, dtoIn.ideSucu);
        return this.dataSource.createQuery(query);
    }

    /** Detalle de un anticipo, con las facturas a las que ya se aplicó (liquidaciones activas). */
    async getAnticipoProveedorById(ideTeanp: number, dtoIn: HeaderParamsDto) {
        const qCab = new SelectQuery(`
            SELECT
                c.ide_teanp,
                c.ide_geper,
                p.nom_geper AS proveedor,
                p.identificac_geper,
                c.ide_teclb,
                c.ide_cnccc,
                c.valor_teanp,
                c.valor_liquidado_teanp,
                (c.valor_teanp - c.valor_liquidado_teanp) AS saldo_teanp,
                c.fecha_teanp,
                c.observacion_teanp,
                c.ide_teeap,
                e.nombre_teeap AS estado,
                e.color_teeap AS color_estado
            FROM tes_cab_anticipo_prov c
            INNER JOIN gen_persona p              ON c.ide_geper = p.ide_geper
            INNER JOIN tes_estado_anticipo_prov e ON c.ide_teeap = e.ide_teeap
            WHERE c.ide_teanp = $1
              AND c.ide_empr = $2
              AND c.ide_sucu = $3
        `);
        qCab.addIntParam(1, ideTeanp);
        qCab.addIntParam(2, dtoIn.ideEmpr);
        qCab.addIntParam(3, dtoIn.ideSucu);
        const cabecera = await this.dataSource.createSingleQuery(qCab);
        if (!cabecera) {
            throw new BadRequestException(`Anticipo a proveedor ide_teanp=${ideTeanp} no encontrado.`);
        }

        const qDet = new SelectQuery(`
            SELECT
                d.ide_tedap,
                d.ide_cpcfa,
                f.numero_cpcfa,
                d.valor_aplicado_tedap,
                d.ide_cnccc,
                d.fecha_tedap
            FROM tes_det_anticipo_prov d
            INNER JOIN cxp_cabece_factur f ON d.ide_cpcfa = f.ide_cpcfa
            WHERE d.ide_teanp = $1
              AND d.activo_tedap = true
            ORDER BY d.ide_tedap
        `);
        qDet.addIntParam(1, ideTeanp);
        const liquidaciones = await this.dataSource.createSelectQuery(qDet);

        return { ...cabecera, liquidaciones };
    }
}
