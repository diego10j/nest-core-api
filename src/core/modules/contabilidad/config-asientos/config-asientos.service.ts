import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { DeleteQuery, SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';

import {
    DeleteCabConfAsieDto,
    esIdentificadorProtegido,
    SaveCabConfAsieDto,
} from './dto/config-asientos.dto';

const MODULE = 'con';
const TABLE_CAB = 'cab_conf_asie';
const PK_CAB = 'ide_cncca';

export type GetVigConfAsieDto = QueryOptionsDto & { ide_cncca: number };
export type GetDetConfAsieDto = QueryOptionsDto & { ide_cnvca: number };

/**
 * Configuración de asientos automáticos (con_cab_conf_asie / con_vig_conf_asie /
 * con_det_conf_asie / con_porcen_impues). Este es el catálogo que
 * `AsientosAutomaticosService` (y algunos servicios de compras/retenciones) resuelven en
 * tiempo de ejecución buscando `con_cab_conf_asie.nombre_cncca` por texto exacto — ver
 * `esIdentificadorProtegido` en el DTO. Por eso SOLO la cabecera (con_cab_conf_asie) tiene
 * un service propio con la validación de "nombre protegido"; las tablas hijas
 * (vigencias/detalle) y con_porcen_impues se administran desde el frontend con los
 * endpoints genéricos `/api/core/getTableQuery` y `/api/core/save`, igual que
 * `sucursales.tsx` — no necesitan reglas de negocio adicionales.
 */
@Injectable()
export class ConfigAsientosService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) { }

    async getCabConfAsie(dto: QueryOptionsDto & HeaderParamsDto) {
        const condition = `ide_empr = ${dto.ideEmpr}`;
        return this.core.getTableQuery({ ...dto, module: MODULE, tableName: TABLE_CAB, primaryKey: PK_CAB, condition });
    }

    async getVigConfAsie(dto: GetVigConfAsieDto & HeaderParamsDto) {
        if (!dto.ide_cncca) throw new BadRequestException('ide_cncca es requerido');
        const condition = `ide_empr = ${dto.ideEmpr} AND ide_cncca = ${Number(dto.ide_cncca)}`;
        return this.core.getTableQuery({ ...dto, module: MODULE, tableName: 'vig_conf_asie', primaryKey: 'ide_cnvca', condition });
    }

    async getDetConfAsie(dto: GetDetConfAsieDto & HeaderParamsDto) {
        if (!dto.ide_cnvca) throw new BadRequestException('ide_cnvca es requerido');
        const condition = `ide_empr = ${dto.ideEmpr} AND ide_cnvca = ${Number(dto.ide_cnvca)}`;
        return this.core.getTableQuery({ ...dto, module: MODULE, tableName: 'det_conf_asie', primaryKey: 'ide_cndca', condition });
    }

    async getPorcenImpues(dto: QueryOptionsDto & HeaderParamsDto) {
        const condition = `ide_empr = ${dto.ideEmpr}`;
        return this.core.getTableQuery({ ...dto, module: MODULE, tableName: 'porcen_impues', primaryKey: 'ide_cnpim', condition });
    }

    /**
     * Crea o actualiza una cabecera de configuración de asiento (con_cab_conf_asie).
     * Si el nombre (nuevo o el que ya tenía el registro) está en la lista de identificadores
     * protegidos, exige `confirmar_protegido: true` explícito.
     */
    async saveCabConfAsie(dtoIn: SaveCabConfAsieDto & HeaderParamsDto) {
        const { data, isUpdate, confirmar_protegido: confirmarProtegido } = dtoIn;
        if (!data?.nombre_cncca?.trim()) {
            throw new BadRequestException('El nombre (nombre_cncca) es requerido');
        }

        if (isUpdate) {
            if (!data.ide_cncca) throw new BadRequestException('ide_cncca es requerido para actualizar');
            const actual = await this.core.findById({
                ...dtoIn, module: MODULE, tableName: TABLE_CAB, primaryKey: PK_CAB, value: data.ide_cncca,
            });
            const nombreProtegidoActual = esIdentificadorProtegido(actual?.nombre_cncca);
            const nombreProtegidoNuevo = esIdentificadorProtegido(data.nombre_cncca);
            if ((nombreProtegidoActual || nombreProtegidoNuevo) && !confirmarProtegido) {
                throw new BadRequestException(
                    `"${actual?.nombre_cncca}" es un identificador usado internamente por el motor de asientos `
                    + 'automáticos (compras, ventas, retenciones o tesorería). Renombrarlo puede dejar de generar '
                    + 'asientos contables sin avisar. Confirme explícitamente para continuar.',
                );
            }
        }

        try {
            if (isUpdate) {
                return await this.core.save({
                    ...dtoIn,
                    listQuery: [{
                        operation: 'update',
                        module: MODULE,
                        tableName: TABLE_CAB,
                        primaryKey: PK_CAB,
                        object: data,
                        condition: `${PK_CAB} = ${data.ide_cncca}`,
                    }],
                    audit: true,
                });
            }

            const ideCncca = await this.dataSource.getSeqTable(`${MODULE}_${TABLE_CAB}`, PK_CAB, 1, dtoIn.login);
            return await this.core.save({
                ...dtoIn,
                listQuery: [{
                    operation: 'insert',
                    module: MODULE,
                    tableName: TABLE_CAB,
                    primaryKey: PK_CAB,
                    object: { ...data, [PK_CAB]: ideCncca, ide_empr: dtoIn.ideEmpr, ide_sucu: dtoIn.ideSucu },
                }],
                audit: true,
            });
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al guardar la configuración de asiento: ${msg}`);
        }
    }

    async deleteCabConfAsie(dtoIn: DeleteCabConfAsieDto & HeaderParamsDto) {
        if (!dtoIn.ide?.length) throw new BadRequestException('Debe indicar al menos un ide_cncca a eliminar');

        const qNombres = new SelectQuery(`
            SELECT ide_cncca, nombre_cncca FROM con_cab_conf_asie WHERE ide_cncca = ANY($1)
        `);
        qNombres.addParam(1, dtoIn.ide);
        const rows = await this.dataSource.createSelectQuery(qNombres);
        const protegidos = rows.filter((r: any) => esIdentificadorProtegido(r.nombre_cncca));
        if (protegidos.length && !dtoIn.confirmar_protegido) {
            const nombres = protegidos.map((r: any) => r.nombre_cncca).join(', ');
            throw new BadRequestException(
                `Los siguientes registros están protegidos porque el motor de asientos automáticos los usa `
                + `por nombre: ${nombres}. Confirme explícitamente para eliminarlos de todos modos.`,
            );
        }

        try {
            const deleteQuery = new DeleteQuery(`${MODULE}_${TABLE_CAB}`);
            deleteQuery.where = `${PK_CAB} = ANY($1)`;
            deleteQuery.addParam(1, dtoIn.ide);
            return await this.dataSource.createQuery(deleteQuery);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al eliminar la configuración de asiento: ${msg}`);
        }
    }
}
