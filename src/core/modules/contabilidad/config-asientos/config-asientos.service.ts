import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { DeleteQuery, SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';

import { DeleteCabConfAsieDto, SaveCabConfAsieDto } from './dto/config-asientos.dto';

const MODULE = 'con';
const TABLE_CAB = 'cab_conf_asie';
const PK_CAB = 'ide_cncca';

export type GetVigConfAsieDto = QueryOptionsDto & { ide_cncca: number };
export type GetDetConfAsieDto = QueryOptionsDto & { ide_cnvca: number };

/**
 * Configuración de asientos automáticos (con_cab_conf_asie / con_vig_conf_asie /
 * con_det_conf_asie / con_porcen_impues). Este es el catálogo que
 * `AsientosAutomaticosService` (y algunos servicios de compras/retenciones) resuelven en
 * tiempo de ejecución buscando `con_cab_conf_asie.nombre_cncca` por texto exacto - marcado con
 * la columna `con_cab_conf_asie.protegido_cncca`
 * (`scripts/contabilidad-config-asientos-protegido.sql`). `con_cab_conf_asie` NO tiene un
 * constraint UNIQUE en `nombre_cncca`, así que en teoría se podría crear una fila NUEVA con un
 * nombre protegido sin querer - `saveCabConfAsie` valida esto también en el alta (no solo en
 * edición), buscando si ya existe otra fila protegida con el mismo nombre. Por eso SOLO la
 * cabecera (con_cab_conf_asie) tiene un service propio con esta validación; las tablas hijas
 * (vigencias/detalle) y con_porcen_impues se administran desde el frontend con los endpoints
 * genéricos `/api/core/getTableQuery` y `/api/core/save`, igual que `sucursales.tsx` - no
 * necesitan reglas de negocio adicionales.
 */
@Injectable()
export class ConfigAsientosService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) { }

    /** true si YA EXISTE una fila de con_cab_conf_asie con este nombre marcada protegido_cncca = true. */
    private async existeNombreProtegido(nombreCncca: string | null | undefined, excluirIdeCncca?: number): Promise<{ protegido: boolean; nombre?: string }> {
        if (!nombreCncca?.trim()) return { protegido: false };
        const q = new SelectQuery(`
            SELECT nombre_cncca FROM con_cab_conf_asie
            WHERE UPPER(nombre_cncca) = UPPER($1) AND protegido_cncca = TRUE
            ${excluirIdeCncca ? 'AND ide_cncca <> $2' : ''}
            LIMIT 1
        `);
        q.addStringParam(1, nombreCncca.trim());
        if (excluirIdeCncca) q.addIntParam(2, excluirIdeCncca);
        const row = await this.dataSource.createSingleQuery(q);
        return { protegido: Boolean(row), nombre: row?.nombre_cncca };
    }

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
     * Si el nombre (nuevo o el que ya tenía el registro) coincide con una fila marcada
     * `protegido_cncca = true`, exige `confirmar_protegido: true` explícito. También valida
     * en el ALTA (no solo al editar): como `nombre_cncca` no es UNIQUE, alguien podría crear
     * sin querer una segunda fila con un nombre ya protegido.
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
            const nuevoNombreProtegido = await this.existeNombreProtegido(data.nombre_cncca, data.ide_cncca);
            const filaEraProtegida = Boolean(actual?.protegido_cncca);
            if ((filaEraProtegida || nuevoNombreProtegido.protegido) && !confirmarProtegido) {
                throw new BadRequestException(
                    `"${actual?.nombre_cncca}" es un identificador usado internamente por el motor de asientos `
                    + 'automáticos (compras, ventas, retenciones o tesorería). Renombrarlo puede dejar de generar '
                    + 'asientos contables sin avisar. Confirme explícitamente para continuar.',
                );
            }
        } else {
            const nombreYaProtegido = await this.existeNombreProtegido(data.nombre_cncca);
            if (nombreYaProtegido.protegido && !confirmarProtegido) {
                throw new BadRequestException(
                    `Ya existe una configuración protegida llamada "${nombreYaProtegido.nombre}" que el motor de `
                    + 'asientos automáticos usa internamente. Crear otra con el mismo nombre puede generar '
                    + 'ambigüedad en qué cuenta contable se resuelve. Confirme explícitamente para continuar.',
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
            SELECT ide_cncca, nombre_cncca, protegido_cncca FROM con_cab_conf_asie WHERE ide_cncca = ANY($1)
        `);
        qNombres.addParam(1, dtoIn.ide);
        const rows = await this.dataSource.createSelectQuery(qNombres);
        const protegidos = rows.filter((r: any) => r.protegido_cncca);
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
