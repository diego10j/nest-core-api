import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { ArrayIdeDto } from 'src/common/dto/array-ide.dto';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { ObjectQueryDto } from 'src/core/connection/dto';
import { DeleteQuery, SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';

import { BaseService } from '../../../../common/base-service';
import { DataSourceService } from '../../../connection/datasource.service';

import {
    GetCabeceImpuesDto,
    GetDetallImpuesDto,
    GetVigencImpuesDto,
    SaveCabeceImpuesDto,
    SaveConImpuestoDto,
    SaveDetallImpuesDto,
    SaveTipoContribuDto,
    SaveVigencImpuesDto,
} from './dto/config-impuestos.dto';

/**
 * CRUD de configuración de impuestos/retenciones: con_impuesto → con_cabece_impues →
 * con_vigenc_impues → con_detall_impues, más el catálogo con_tipo_contribu.
 *
 * Estas tablas ya existían en la base de datos (heredadas del sistema legacy sigafi) y ya
 * son consumidas en producción por RetencionesCxPService.getPorcentajeImpuesto (compras) para
 * resolver el % de retención vigente por tipo de documento + tipo de contribuyente - este CRUD
 * no cambia ese motor, solo le da una pantalla de mantenimiento en vez de SQL directo.
 */
@Injectable()
export class ConfigImpuestosService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) {
        super();
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // con_impuesto
    // ─────────────────────────────────────────────────────────────────────────────

    async getConImpuestos(dtoIn: HeaderParamsDto) {
        try {
            const query = new SelectQuery(`
                SELECT ide_cnimp, nombre_cnimp, codigo_fe_cnimp
                FROM con_impuesto
                WHERE ide_empr = $1 AND ide_sucu = $2
                ORDER BY nombre_cnimp
            `);
            query.addIntParam(1, dtoIn.ideEmpr);
            query.addIntParam(2, dtoIn.ideSucu);
            query.setLazy(false);
            return this.dataSource.createSelectQuery(query);
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al obtener los impuestos: ${msg}`);
        }
    }

    async saveConImpuesto(dtoIn: SaveConImpuestoDto & HeaderParamsDto) {
        return this.saveGenerico(dtoIn, 'impuesto', 'ide_cnimp');
    }

    async deleteConImpuesto(dtoIn: ArrayIdeDto & HeaderParamsDto) {
        return this.deleteGenerico(dtoIn, 'con_impuesto', 'ide_cnimp');
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // con_cabece_impues (casillero de retención)
    // ─────────────────────────────────────────────────────────────────────────────

    async getCabeceImpues(dtoIn: GetCabeceImpuesDto & HeaderParamsDto) {
        try {
            const condImpuesto = dtoIn.ide_cnimp ? 'AND c.ide_cnimp = $3' : '';
            const query = new SelectQuery(`
                SELECT c.ide_cncim, c.ide_cnimp, i.nombre_cnimp, c.nombre_cncim,
                       c.casillero_cncim, c.valor_defecto_cncim, c.codigo_fe_retencion_cncim
                FROM con_cabece_impues c
                INNER JOIN con_impuesto i ON i.ide_cnimp = c.ide_cnimp
                WHERE c.ide_empr = $1 AND c.ide_sucu = $2
                ${condImpuesto}
                ORDER BY i.nombre_cnimp, c.nombre_cncim
            `);
            query.addIntParam(1, dtoIn.ideEmpr);
            query.addIntParam(2, dtoIn.ideSucu);
            if (dtoIn.ide_cnimp) query.addIntParam(3, dtoIn.ide_cnimp);
            query.setLazy(false);
            return this.dataSource.createSelectQuery(query);
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al obtener los casilleros de retención: ${msg}`);
        }
    }

    /** Combo de casilleros de retención (con_cabece_impues) - reutiliza el mismo shape que
     * RetencionesCxPService.getListDataImpuestosRetencion para no duplicar la consulta que ya
     * consumen los diálogos de retención en compras/ventas. */
    async getListDataCabeceImpues(dtoIn: HeaderParamsDto) {
        try {
            const query = new SelectQuery(`
                SELECT ide_cncim AS value, nombre_cncim AS label, valor_defecto_cncim, ide_cnimp
                FROM con_cabece_impues
                WHERE ide_empr = $1 AND ide_sucu = $2
                ORDER BY nombre_cncim
            `);
            query.addIntParam(1, dtoIn.ideEmpr);
            query.addIntParam(2, dtoIn.ideSucu);
            query.setLazy(false);
            return this.dataSource.createSelectQuery(query);
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al obtener el combo de casilleros: ${msg}`);
        }
    }

    async saveCabeceImpues(dtoIn: SaveCabeceImpuesDto & HeaderParamsDto) {
        return this.saveGenerico(dtoIn, 'cabece_impues', 'ide_cncim');
    }

    async deleteCabeceImpues(dtoIn: ArrayIdeDto & HeaderParamsDto) {
        return this.deleteGenerico(dtoIn, 'con_cabece_impues', 'ide_cncim');
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // con_vigenc_impues (vigencia de un casillero)
    // ─────────────────────────────────────────────────────────────────────────────

    async getVigencImpues(dtoIn: GetVigencImpuesDto & HeaderParamsDto) {
        try {
            const query = new SelectQuery(`
                SELECT ide_cnvim, ide_cncim, nombre_cnvim, fecha_inici_cnvim, fecha_final_cnvim, estado_cnvim
                FROM con_vigenc_impues
                WHERE ide_empr = $1 AND ide_sucu = $2 AND ide_cncim = $3
                ORDER BY fecha_inici_cnvim DESC
            `);
            query.addIntParam(1, dtoIn.ideEmpr);
            query.addIntParam(2, dtoIn.ideSucu);
            query.addIntParam(3, dtoIn.ide_cncim);
            query.setLazy(false);
            return this.dataSource.createSelectQuery(query);
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al obtener las vigencias: ${msg}`);
        }
    }

    async saveVigencImpues(dtoIn: SaveVigencImpuesDto & HeaderParamsDto) {
        try {
            if (!dtoIn.data) throw new BadRequestException('El campo data es requerido');
            const { data } = dtoIn;

            if (new Date(data.fecha_inici_cnvim) > new Date(data.fecha_final_cnvim)) {
                throw new BadRequestException('La fecha de inicio no puede ser posterior a la fecha final');
            }

            // No permitir solapar fechas con otra vigencia ACTIVA del mismo casillero.
            if (data.estado_cnvim !== false) {
                const condSelf = dtoIn.isUpdate && data.ide_cnvim ? 'AND ide_cnvim <> $4' : '';
                const qOverlap = new SelectQuery(`
                    SELECT 1 AS existe FROM con_vigenc_impues
                    WHERE ide_cncim = $1 AND estado_cnvim IS TRUE
                      AND fecha_inici_cnvim <= $3 AND fecha_final_cnvim >= $2
                      ${condSelf}
                    LIMIT 1
                `);
                qOverlap.addIntParam(1, data.ide_cncim);
                qOverlap.addStringParam(2, data.fecha_inici_cnvim);
                qOverlap.addStringParam(3, data.fecha_final_cnvim);
                if (condSelf) qOverlap.addIntParam(4, data.ide_cnvim);
                const overlap = await this.dataSource.createSingleQuery(qOverlap);
                if (overlap) {
                    throw new BadRequestException(
                        'Ya existe otra vigencia activa de este casillero cuyas fechas se solapan con las ingresadas.',
                    );
                }
            }

            return this.saveGenerico(dtoIn, 'vigenc_impues', 'ide_cnvim');
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al guardar la vigencia: ${msg}`);
        }
    }

    async deleteVigencImpues(dtoIn: ArrayIdeDto & HeaderParamsDto) {
        return this.deleteGenerico(dtoIn, 'con_vigenc_impues', 'ide_cnvim');
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // con_detall_impues (% de retención por tipo documento + tipo contribuyente)
    // ─────────────────────────────────────────────────────────────────────────────

    async getDetallImpues(dtoIn: GetDetallImpuesDto & HeaderParamsDto) {
        try {
            const query = new SelectQuery(`
                SELECT d.ide_cndim, d.ide_cnvim, d.ide_cntdo, td.nombre_cntdo,
                       d.ide_cntco, tc.nombre_cntco, d.porcentaje_cndim
                FROM con_detall_impues d
                INNER JOIN con_tipo_document td ON td.ide_cntdo = d.ide_cntdo
                INNER JOIN con_tipo_contribu tc ON tc.ide_cntco = d.ide_cntco
                WHERE d.ide_empr = $1 AND d.ide_sucu = $2 AND d.ide_cnvim = $3
                ORDER BY td.nombre_cntdo, tc.nombre_cntco
            `);
            query.addIntParam(1, dtoIn.ideEmpr);
            query.addIntParam(2, dtoIn.ideSucu);
            query.addIntParam(3, dtoIn.ide_cnvim);
            query.setLazy(false);
            return this.dataSource.createSelectQuery(query);
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al obtener el detalle de porcentajes: ${msg}`);
        }
    }

    async saveDetallImpues(dtoIn: SaveDetallImpuesDto & HeaderParamsDto) {
        try {
            if (!dtoIn.data) throw new BadRequestException('El campo data es requerido');
            const { data } = dtoIn;

            const condSelf = dtoIn.isUpdate && data.ide_cndim ? 'AND ide_cndim <> $4' : '';
            const qDup = new SelectQuery(`
                SELECT 1 AS existe FROM con_detall_impues
                WHERE ide_cnvim = $1 AND ide_cntdo = $2 AND ide_cntco = $3
                ${condSelf}
                LIMIT 1
            `);
            qDup.addIntParam(1, data.ide_cnvim);
            qDup.addIntParam(2, data.ide_cntdo);
            qDup.addIntParam(3, data.ide_cntco);
            if (condSelf) qDup.addIntParam(4, data.ide_cndim);
            const dup = await this.dataSource.createSingleQuery(qDup);
            if (dup) {
                throw new BadRequestException(
                    'Ya existe un porcentaje configurado para esta combinación de tipo de documento y tipo de contribuyente en esta vigencia.',
                );
            }

            return this.saveGenerico(dtoIn, 'detall_impues', 'ide_cndim');
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al guardar el porcentaje: ${msg}`);
        }
    }

    async deleteDetallImpues(dtoIn: ArrayIdeDto & HeaderParamsDto) {
        return this.deleteGenerico(dtoIn, 'con_detall_impues', 'ide_cndim');
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // con_tipo_contribu (usado también por gen_persona.ide_cntco - proveedores/clientes)
    // ─────────────────────────────────────────────────────────────────────────────

    async getTipoContribu(dtoIn: HeaderParamsDto) {
        try {
            const query = new SelectQuery(`
                SELECT ide_cntco, nombre_cntco, alter_tribu_cntco, COALESCE(no_retener_cntco, FALSE) AS no_retener_cntco
                FROM con_tipo_contribu
                WHERE ide_empr = $1 AND ide_sucu = $2
                ORDER BY nombre_cntco
            `);
            query.addIntParam(1, dtoIn.ideEmpr);
            query.addIntParam(2, dtoIn.ideSucu);
            query.setLazy(false);
            return this.dataSource.createSelectQuery(query);
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al obtener los tipos de contribuyente: ${msg}`);
        }
    }

    async saveTipoContribu(dtoIn: SaveTipoContribuDto & HeaderParamsDto) {
        return this.saveGenerico(dtoIn, 'tipo_contribu', 'ide_cntco');
    }

    /** No permite eliminar un tipo de contribuyente en uso por proveedores/clientes (gen_persona.ide_cntco). */
    async deleteTipoContribu(dtoIn: ArrayIdeDto & HeaderParamsDto) {
        const qUso = new SelectQuery(`
            SELECT 1 AS existe FROM gen_persona WHERE ide_cntco = ANY($1) LIMIT 1
        `);
        qUso.addParam(1, dtoIn.ide);
        const enUso = await this.dataSource.createSingleQuery(qUso);
        if (enUso) {
            throw new BadRequestException(
                'No se puede eliminar: hay proveedores/clientes registrados con este tipo de contribuyente.',
            );
        }
        return this.deleteGenerico(dtoIn, 'con_tipo_contribu', 'ide_cntco');
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Combos de apoyo
    // ─────────────────────────────────────────────────────────────────────────────

    async getListDataConImpuesto(dtoIn: HeaderParamsDto) {
        try {
            const query = new SelectQuery(`
                SELECT ide_cnimp AS value, nombre_cnimp AS label
                FROM con_impuesto
                WHERE ide_empr = $1 AND ide_sucu = $2
                ORDER BY nombre_cnimp
            `);
            query.addIntParam(1, dtoIn.ideEmpr);
            query.addIntParam(2, dtoIn.ideSucu);
            query.setLazy(false);
            return this.dataSource.createSelectQuery(query);
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al obtener el combo de impuestos: ${msg}`);
        }
    }

    async getListDataTipoContribu(dtoIn: HeaderParamsDto) {
        try {
            const query = new SelectQuery(`
                SELECT ide_cntco AS value, nombre_cntco AS label, COALESCE(no_retener_cntco, FALSE) AS no_retener_cntco
                FROM con_tipo_contribu
                WHERE ide_empr = $1 AND ide_sucu = $2
                ORDER BY nombre_cntco
            `);
            query.addIntParam(1, dtoIn.ideEmpr);
            query.addIntParam(2, dtoIn.ideSucu);
            query.setLazy(false);
            return this.dataSource.createSelectQuery(query);
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al obtener el combo de tipos de contribuyente: ${msg}`);
        }
    }

    async getListDataTipoDocumento(dtoIn: HeaderParamsDto) {
        try {
            const query = new SelectQuery(`
                SELECT ide_cntdo AS value, nombre_cntdo AS label
                FROM con_tipo_document
                WHERE ide_empr = $1 AND ide_sucu = $2
                ORDER BY nombre_cntdo
            `);
            query.addIntParam(1, dtoIn.ideEmpr);
            query.addIntParam(2, dtoIn.ideSucu);
            query.setLazy(false);
            return this.dataSource.createSelectQuery(query);
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al obtener el combo de tipos de documento: ${msg}`);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // HELPERS PRIVADOS (mismo patrón genérico que PlanCuentasService)
    // ─────────────────────────────────────────────────────────────────────────────

    private async saveGenerico(
        dtoIn: { isUpdate: boolean; data: Record<string, any> } & HeaderParamsDto,
        tableName: string,
        primaryKey: string,
    ) {
        try {
            if (!dtoIn.data) throw new BadRequestException('El campo data es requerido');
            const module = 'con';

            if (dtoIn.isUpdate === true) {
                if (!dtoIn.data[primaryKey]) {
                    throw new BadRequestException(`El campo ${primaryKey} es requerido para actualizar`);
                }
                const objQuery: ObjectQueryDto = {
                    operation: 'update',
                    module,
                    tableName,
                    primaryKey,
                    object: dtoIn.data,
                    condition: `${primaryKey} = ${dtoIn.data[primaryKey]}`,
                };
                return this.core.save({ ...dtoIn, listQuery: [objQuery], audit: true });
            }

            dtoIn.data[primaryKey] = await this.dataSource.getSeqTable(`${module}_${tableName}`, primaryKey, 1, dtoIn.login);
            dtoIn.data.ide_empr = dtoIn.ideEmpr;
            dtoIn.data.ide_sucu = dtoIn.ideSucu;

            const objQuery: ObjectQueryDto = {
                operation: 'insert',
                module,
                tableName,
                primaryKey,
                object: dtoIn.data,
            };
            return this.core.save({ ...dtoIn, listQuery: [objQuery], audit: true });
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al guardar: ${msg}`);
        }
    }

    private async deleteGenerico(dtoIn: ArrayIdeDto & HeaderParamsDto, table: string, primaryKey: string) {
        if (!dtoIn.ide || dtoIn.ide.length === 0) {
            throw new BadRequestException(`Debe proporcionar al menos un ${primaryKey} para eliminar`);
        }
        try {
            const deleteQuery = new DeleteQuery(table);
            deleteQuery.where = `${primaryKey} = ANY ($1) AND ide_empr = $2 AND ide_sucu = $3`;
            deleteQuery.addParam(1, dtoIn.ide);
            deleteQuery.addIntParam(2, dtoIn.ideEmpr);
            deleteQuery.addIntParam(3, dtoIn.ideSucu);
            return this.dataSource.createQuery(deleteQuery);
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al eliminar: ${msg}`);
        }
    }
}
