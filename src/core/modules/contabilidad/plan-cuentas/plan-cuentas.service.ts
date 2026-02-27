import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { ArrayIdeDto } from 'src/common/dto/array-ide.dto';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { IdeDto } from 'src/common/dto/ide.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { SearchDto } from 'src/common/dto/search.dto';
import { ObjectQueryDto } from 'src/core/connection/dto';
import { DeleteQuery, SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';

import { BaseService } from '../../../../common/base-service';
import { DataSourceService } from '../../../connection/datasource.service';

import { GetCuentasPorTipoDto, GetDetPlanCuentaDto } from './dto/get-plan-cuentas.dto';
import { SaveCabPlanCuenDto } from './dto/save-cab-plan-cuen.dto';
import { SaveDetPlanCuenDto } from './dto/save-det-plan-cuen.dto';

@Injectable()
export class PlanCuentasService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) {
        super();
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // PRIVATE HELPERS
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Retorna el ide_cncpc del plan de cuentas activo para la sucursal indicada.
     * Lanza BadRequestException si no existe ningún plan activo.
     */
    private async getIdePlanActivo(ideSucu: number): Promise<number> {
        if (!ideSucu) {
            throw new BadRequestException('La sucursal (ide_sucu) es requerida para obtener el plan de cuentas activo');
        }
        try {
            const query = new SelectQuery(`
          SELECT ide_cncpc
          FROM   con_cab_plan_cuen
          WHERE  ide_sucu = $1
            AND  activo_cncpc IS TRUE
          LIMIT  1
        `);
            query.addIntParam(1, ideSucu);
            const rows = await this.dataSource.createSelectQuery(query);
            if (!rows || rows.length === 0) {
                throw new BadRequestException(
                    `No existe un plan de cuentas activo para la sucursal ${ideSucu}. Configure un plan activo antes de continuar.`,
                );
            }
            const id = rows[0].ide_cncpc as number;
            if (id === null || id === undefined) {
                throw new BadRequestException(`El plan de cuentas activo no tiene un identificador válido para la sucursal ${ideSucu}`);
            }
            return id;
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            throw new InternalServerErrorException(`Error al obtener el plan de cuentas activo: ${error?.message ?? error}`);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // CABECERA – Plan de Cuentas
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Lista todos los planes de cuentas registrados para la empresa.
     */
    async getCabPlanCuentas(dtoIn: QueryOptionsDto & HeaderParamsDto) {
        try {
            const query = new SelectQuery(
                `
      SELECT
        ide_cncpc,
        nombre_cncpc,
        fecha_inici_cncpc,
        fecha_final_cncpc,
        observacion_cncpc,
        mascara_cncpc,
        activo_cncpc,
        ide_sucu,
        s.nombre_sucu
      FROM  con_cab_plan_cuen c
      LEFT JOIN sis_sucursal s USING (ide_sucu)
      WHERE c.ide_empr = $1
      and c.ide_sucu = $2
      ORDER BY activo_cncpc DESC, nombre_cncpc
      `,
                dtoIn,
            );
            query.addIntParam(1, dtoIn.ideEmpr);
            query.addIntParam(2, dtoIn.ideSucu);
            query.setLazy(false);
            return this.dataSource.createQuery(query);
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            throw new InternalServerErrorException(`Error al obtener los planes de cuentas: ${error?.message ?? error}`);
        }
    }

    /**
     * Retorna el plan de cuentas activo de la sucursal del usuario.
     * Equivalente a getPlandeCuentasActivo() del sistema anterior.
     */
    async getCabPlanCuentaActivo(dtoIn: HeaderParamsDto) {
        try {
            const query = new SelectQuery(`
      SELECT
        ide_cncpc,
        nombre_cncpc,
        fecha_inici_cncpc,
        fecha_final_cncpc,
        observacion_cncpc,
        mascara_cncpc,
        activo_cncpc
      FROM  con_cab_plan_cuen
      WHERE  ide_empr  = $1
         AND   ide_sucu   = $2
        AND activo_cncpc IS TRUE
      LIMIT 1
    `);
            query.addIntParam(1, dtoIn.ideEmpr);
            query.addIntParam(2, dtoIn.ideSucu);
            const rows = await this.dataSource.createSelectQuery(query);
            return rows && rows.length > 0 ? rows[0] : null;
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            throw new InternalServerErrorException(`Error al obtener el plan de cuentas activo: ${error?.message ?? error}`);
        }
    }

    /**
     * Busca la cabecera de un plan de cuentas por su PK.
     */
    async findCabById(dtoIn: IdeDto & HeaderParamsDto) {
        if (!dtoIn.ide) throw new BadRequestException('El campo ide es requerido');
        try {
            return this.core.findById({
                module: 'con',
                tableName: 'cab_plan_cuen',
                primaryKey: 'ide_cncpc',
                value: dtoIn.ide,
                ...dtoIn,
            });
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            throw new InternalServerErrorException(`Error al buscar el plan de cuentas: ${error?.message ?? error}`);
        }
    }

    /**
     * Crea o actualiza un registro de cabecera del plan de cuentas.
     * Cuando se activa un plan (activo_cncpc = true) se garantiza unicidad
     * desactivando el anterior en la misma sucursal.
     */
    async saveCabPlanCuentas(dtoIn: SaveCabPlanCuenDto & HeaderParamsDto) {
        try {
            if (!dtoIn.data) throw new BadRequestException('El campo data es requerido');
            if (dtoIn.isUpdate && !dtoIn.data.ide_cncpc) {
                throw new BadRequestException('El campo ide_cncpc es requerido para actualizar');
            }

            const module = 'con';
            const tableName = 'cab_plan_cuen';
            const primaryKey = 'ide_cncpc';

            const listQuery: ObjectQueryDto[] = [];

            if (dtoIn.isUpdate === true) {
                if (dtoIn.data.activo_cncpc === true) {
                    listQuery.push({
                        operation: 'update',
                        module,
                        tableName,
                        primaryKey,
                        object: { activo_cncpc: false },
                        condition: `ide_empr = ${dtoIn.ideEmpr} AND ide_sucu = ${dtoIn.ideSucu} AND ${primaryKey} != ${dtoIn.data.ide_cncpc}`,
                    });
                }
                listQuery.push({
                    operation: 'update',
                    module,
                    tableName,
                    primaryKey,
                    object: dtoIn.data,
                    condition: `${primaryKey} = ${dtoIn.data.ide_cncpc}`,
                });
            } else {
                dtoIn.data.ide_cncpc = await this.dataSource.getSeqTable(`${module}_${tableName}`, primaryKey, 1, dtoIn.login);
                dtoIn.data.ide_empr = dtoIn.ideEmpr;
                dtoIn.data.ide_sucu = dtoIn.ideSucu;

                if (dtoIn.data.activo_cncpc === true) {
                    listQuery.push({
                        operation: 'update',
                        module,
                        tableName,
                        primaryKey,
                        object: { activo_cncpc: false },
                        condition: `ide_empr = ${dtoIn.ideEmpr} AND ide_sucu = ${dtoIn.ideSucu}`,
                    });
                }
                listQuery.push({
                    operation: 'insert',
                    module,
                    tableName,
                    primaryKey,
                    object: dtoIn.data,
                });
            }

            return this.core.save({ ...dtoIn, listQuery, audit: true });
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            throw new InternalServerErrorException(`Error al guardar el plan de cuentas: ${error?.message ?? error}`);
        }
    }

    /**
     * Elimina uno o varios planes de cuentas cabecera (solo si no tienen cuentas asociadas).
     */
    async deleteCabPlanCuentas(dtoIn: ArrayIdeDto & HeaderParamsDto) {
        if (!dtoIn.ide || dtoIn.ide.length === 0) {
            throw new BadRequestException('Debe proporcionar al menos un ide_cncpc para eliminar');
        }
        try {
            const deleteQuery = new DeleteQuery('con_cab_plan_cuen');
            deleteQuery.where = 'ide_cncpc = ANY ($1) AND ide_empr = $2 AND ide_sucu = $3';
            deleteQuery.addParam(1, dtoIn.ide);
            return this.dataSource.createQuery(deleteQuery);
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            throw new InternalServerErrorException(`Error al eliminar el plan de cuentas: ${error?.message ?? error}`);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // DETALLE – Cuentas contables
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Retorna todas las cuentas del plan activo de la sucursal en un listado plano.
     * Equivalente a getSqlCuentas() del sistema anterior.
     */
    async getPlanCuentas(dtoIn: GetDetPlanCuentaDto & HeaderParamsDto) {
        try {
            const idePlan = dtoIn.ide_cncpc ?? (await this.getIdePlanActivo(dtoIn.ideSucu));
            const query = new SelectQuery(
                `
      SELECT
        d.ide_cndpc,
        d.codig_recur_cndpc,
        d.nombre_cndpc,
        d.nivel_cndpc,
        d.con_ide_cndpc,
        d.ide_cntcu,
        tc.nombre_cntcu,
        d.ide_cnncu,
        nc.nombre_cnncu
      FROM  con_det_plan_cuen d
      LEFT JOIN con_tipo_cuenta  tc USING (ide_cntcu)
      LEFT JOIN con_nivel_cuenta nc USING (ide_cnncu)
      WHERE d.ide_cncpc = $1
        AND d.ide_empr  = $2
        AND d.ide_sucu  = $3
      ORDER BY d.codig_recur_cndpc
      `,
                dtoIn,
            );
            query.addIntParam(1, idePlan);
            query.addIntParam(2, dtoIn.ideEmpr);
            query.addIntParam(3, dtoIn.ideSucu);
            return this.dataSource.createQuery(query);
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            throw new InternalServerErrorException(`Error al obtener el plan de cuentas: ${error?.message ?? error}`);
        }
    }

    /**
     * Retorna el árbol jerárquico del plan activo, útil para renderizar
     * un TreeView en el frontend.
     */
    async getArbolPlanCuentas(dtoIn: GetDetPlanCuentaDto & HeaderParamsDto) {
        try {
            const idePlan = dtoIn.ide_cncpc ?? (await this.getIdePlanActivo(dtoIn.ideSucu));
            const query = new SelectQuery(`
      WITH RECURSIVE arbol AS (
        -- raíz: cuentas sin padre
        SELECT
          ide_cndpc,
          con_ide_cndpc,
          codig_recur_cndpc,
          nombre_cndpc,
          nivel_cndpc,
          ide_cntcu,
          ide_cnncu,
          0 AS profundidad
        FROM con_det_plan_cuen
        WHERE ide_cncpc = $1
          AND ide_empr  = $2
          AND ide_sucu  = $3
          AND con_ide_cndpc IS NULL
        UNION ALL
        -- hijos recursivos
        SELECT
          h.ide_cndpc,
          h.con_ide_cndpc,
          h.codig_recur_cndpc,
          h.nombre_cndpc,
          h.nivel_cndpc,
          h.ide_cntcu,
          h.ide_cnncu,
          a.profundidad + 1
        FROM con_det_plan_cuen h
        INNER JOIN arbol a ON h.con_ide_cndpc = a.ide_cndpc
        WHERE h.ide_cncpc = $1
          AND h.ide_empr  = $2
          AND h.ide_sucu  = $3
      )
      SELECT
        a.*,
        tc.nombre_cntcu,
        nc.nombre_cnncu
      FROM  arbol a
      LEFT JOIN con_tipo_cuenta  tc USING (ide_cntcu)
      LEFT JOIN con_nivel_cuenta nc USING (ide_cnncu)
      ORDER BY a.codig_recur_cndpc
    `);
            query.addIntParam(1, idePlan);
            query.addIntParam(2, dtoIn.ideEmpr);
            query.addIntParam(3, dtoIn.ideSucu);
            query.setLazy(false);
            return this.dataSource.createSelectQuery(query);
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            throw new InternalServerErrorException(`Error al obtener el árbol del plan de cuentas: ${error?.message ?? error}`);
        }
    }

    /**
     * Retorna únicamente las cuentas de nivel HIJO (movibles en transacciones).
     * Equivalente a getSqlCuentasHijas() del sistema anterior.
     */
    async getCuentasHijas(dtoIn: GetDetPlanCuentaDto & HeaderParamsDto) {
        try {
            const idePlan = dtoIn.ide_cncpc ?? (await this.getIdePlanActivo(dtoIn.ideSucu));
            const query = new SelectQuery(
                `
      SELECT
        ide_cndpc        AS value,
        codig_recur_cndpc || ' - ' || nombre_cndpc AS label,
        codig_recur_cndpc,
        nombre_cndpc,
        ide_cntcu
      FROM  con_det_plan_cuen
      WHERE nivel_cndpc = 'HIJO'
        AND ide_cncpc = $1
        AND ide_empr  = $2
        AND ide_sucu  = $3
      ORDER BY codig_recur_cndpc
      `,
                dtoIn,
            );
            query.addIntParam(1, idePlan);
            query.addIntParam(2, dtoIn.ideEmpr);
            query.addIntParam(3, dtoIn.ideSucu);
            return this.dataSource.createQuery(query);
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            throw new InternalServerErrorException(`Error al obtener las cuentas hijas: ${error?.message ?? error}`);
        }
    }

    /**
     * Retorna cuentas filtradas por tipo (activos, pasivos, patrimonio, etc.).
     * Equivalente a getSqlCuentasActivos() / getSqlCuentasPasivos() unificados.
     */
    async getCuentasPorTipo(dtoIn: GetCuentasPorTipoDto & HeaderParamsDto) {
        try {
            const idePlan = await this.getIdePlanActivo(dtoIn.ideSucu);
            const condTipo = dtoIn.ide_cntcu ? `AND d.ide_cntcu = ${dtoIn.ide_cntcu}` : '';
            const query = new SelectQuery(
                `
      SELECT
        ide_cndpc        AS value,
        codig_recur_cndpc || ' - ' || nombre_cndpc AS label,
        codig_recur_cndpc,
        nombre_cndpc,
        nivel_cndpc,
        ide_cntcu,
        tc.nombre_cntcu
      FROM  con_det_plan_cuen d
      LEFT JOIN con_tipo_cuenta tc USING (ide_cntcu)
      WHERE d.ide_cncpc = $1
        AND d.ide_empr  = $2    
        AND d.ide_sucu  = $3
        ${condTipo}
      ORDER BY d.codig_recur_cndpc
      `,
                dtoIn,
            );
            query.addIntParam(1, idePlan);
            query.addIntParam(2, dtoIn.ideEmpr);
            query.addIntParam(3, dtoIn.ideSucu);
            return this.dataSource.createQuery(query);
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            throw new InternalServerErrorException(`Error al obtener cuentas por tipo: ${error?.message ?? error}`);
        }
    }

    /**
     * Búsqueda de cuentas por código o nombre (autocomplete).
     */
    async searchCuentas(dtoIn: SearchDto & HeaderParamsDto) {
        if (!dtoIn.value) throw new BadRequestException('El parámetro value es requerido para la búsqueda');
        try {
            const idePlan = await this.getIdePlanActivo(dtoIn.ideSucu);
            const query = new SelectQuery(`
      SELECT
        ide_cndpc        AS value,
        codig_recur_cndpc || ' - ' || nombre_cndpc AS label,
        codig_recur_cndpc,
        nombre_cndpc,
        nivel_cndpc
      FROM  con_det_plan_cuen
      WHERE ide_cncpc = $1
        AND ide_empr  = $2
        AND ide_sucu  = $3
        AND (
          unaccent(nombre_cndpc)     ILIKE unaccent($4)
          OR codig_recur_cndpc       ILIKE $4
        )
      ORDER BY codig_recur_cndpc
      LIMIT $5
    `);
            query.addIntParam(1, idePlan);
            query.addIntParam(2, dtoIn.ideEmpr);
            query.addIntParam(3, dtoIn.ideSucu);
            query.addStringParam(4, `%${dtoIn.value}%`);
            query.addIntParam(5, dtoIn.limit ?? 25);
            query.setLazy(false);
            return this.dataSource.createSelectQuery(query);
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            throw new InternalServerErrorException(`Error al buscar cuentas: ${error?.message ?? error}`);
        }
    }

    /**
     * Retorna los niveles del plan de cuentas para la empresa.
     * Equivalente a getSqlNivelesPlandeCuentas() del sistema anterior.
     */
    async getNivelesPlanCuentas(dtoIn: HeaderParamsDto) {
        try {
            const query = new SelectQuery(`
      SELECT
        ide_cnncu AS value,
        nombre_cnncu AS label
      FROM  con_nivel_cuenta
      WHERE ide_empr = $1
      and ide_sucu = $2
      ORDER BY ide_cnncu
    `);
            query.addIntParam(1, dtoIn.ideEmpr);
            query.addIntParam(2, dtoIn.ideSucu);
            query.setLazy(false);
            return this.dataSource.createSelectQuery(query);
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            throw new InternalServerErrorException(`Error al obtener los niveles del plan de cuentas: ${error?.message ?? error}`);
        }
    }

    /**
     * Retorna los tipos de cuenta disponibles (Activo, Pasivo, Patrimonio, etc.)
     */
    async getTiposCuenta(dtoIn: HeaderParamsDto) {
        try {
            const query = new SelectQuery(`
      SELECT
        ide_cntcu AS value,
        nombre_cntcu AS label
      FROM  con_tipo_cuenta
      WHERE ide_empr = $1
      and ide_sucu = $2
      ORDER BY nombre_cntcu
    `);
            query.addIntParam(1, dtoIn.ideEmpr);
            query.addIntParam(2, dtoIn.ideSucu);
            query.setLazy(false);
            return this.dataSource.createSelectQuery(query);
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            throw new InternalServerErrorException(`Error al obtener los tipos de cuenta: ${error?.message ?? error}`);
        }
    }

    /**
     * Retorna el nivel máximo de cuentas registradas en el plan activo.
     * Equivalente a getUltimoNivelCuentas() del sistema anterior.
     */
    async getUltimoNivelCuentas(dtoIn: HeaderParamsDto) {
        try {
            const idePlan = await this.getIdePlanActivo(dtoIn.ideSucu);
            const query = new SelectQuery(`
      SELECT MAX(ide_cnncu) AS ultimo_nivel
      FROM   con_det_plan_cuen
      WHERE  ide_empr  = $1
        AND  ide_sucu  = $2
        AND  ide_cncpc = $3
    `);
            query.addIntParam(1, dtoIn.ideEmpr);
            query.addIntParam(2, dtoIn.ideSucu);
            query.addIntParam(3, idePlan);
            query.setLazy(false);
            const rows = await this.dataSource.createSelectQuery(query);
            return rows && rows.length > 0 ? rows[0].ultimo_nivel : null;
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            throw new InternalServerErrorException(`Error al obtener el último nivel de cuentas: ${error?.message ?? error}`);
        }
    }

    /**
     * Verifica si una cuenta es de nivel HIJO.
     * Equivalente a isCuentaContableHija() del sistema anterior.
     */
    async isCuentaHija(dtoIn: IdeDto & HeaderParamsDto): Promise<boolean> {
        if (!dtoIn.ide) throw new BadRequestException('El campo ide es requerido');
        try {
            const query = new SelectQuery(`
      SELECT nivel_cndpc
      FROM   con_det_plan_cuen
      WHERE  ide_cndpc = $1
    `);
            query.addIntParam(1, dtoIn.ide);
            query.setLazy(false);
            const rows = await this.dataSource.createSelectQuery(query);
            if (!rows || rows.length === 0) {
                throw new BadRequestException(`No se encontró la cuenta con id ${dtoIn.ide}`);
            }
            return (rows[0].nivel_cndpc as string)?.toUpperCase() === 'HIJO';
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            throw new InternalServerErrorException(`Error al verificar la cuenta: ${error?.message ?? error}`);
        }
    }

    /**
     * Busca una cuenta (detalle) por su PK.
     */
    async findDetById(dtoIn: IdeDto & HeaderParamsDto) {
        if (!dtoIn.ide) throw new BadRequestException('El campo ide es requerido');
        try {
            return this.core.findById({
                module: 'con',
                tableName: 'det_plan_cuen',
                primaryKey: 'ide_cndpc',
                value: dtoIn.ide,
                ...dtoIn,
            });
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            throw new InternalServerErrorException(`Error al buscar la cuenta contable: ${error?.message ?? error}`);
        }
    }

    /**
     * Crea o actualiza una cuenta contable (detalle del plan de cuentas).
     */
    async saveDetPlanCuentas(dtoIn: SaveDetPlanCuenDto & HeaderParamsDto) {
        try {
            if (!dtoIn.data) throw new BadRequestException('El campo data es requerido');
            if (!dtoIn.data.nombre_cndpc) throw new BadRequestException('El nombre de la cuenta (nombre_cndpc) es requerido');
            if (dtoIn.isUpdate && !dtoIn.data.ide_cndpc) {
                throw new BadRequestException('El campo ide_cndpc es requerido para actualizar');
            }

            const module = 'con';
            const tableName = 'det_plan_cuen';
            const primaryKey = 'ide_cndpc';

            if (dtoIn.isUpdate === true) {
                const objQuery: ObjectQueryDto = {
                    operation: 'update',
                    module,
                    tableName,
                    primaryKey,
                    object: dtoIn.data,
                    condition: `${primaryKey} = ${dtoIn.data.ide_cndpc}`,
                };
                return this.core.save({ ...dtoIn, listQuery: [objQuery], audit: true });
            } else {
                dtoIn.data.ide_cndpc = await this.dataSource.getSeqTable(`${module}_${tableName}`, primaryKey, 1, dtoIn.login);
                dtoIn.data.ide_empr = dtoIn.ideEmpr;
                dtoIn.data.ide_sucu = dtoIn.ideSucu;
                dtoIn.data.usuario_ingre = dtoIn.login;

                if (!dtoIn.data.ide_cncpc) {
                    dtoIn.data.ide_cncpc = await this.getIdePlanActivo(dtoIn.ideSucu);
                }

                const objQuery: ObjectQueryDto = {
                    operation: 'insert',
                    module,
                    tableName,
                    primaryKey,
                    object: dtoIn.data,
                };
                return this.core.save({ ...dtoIn, listQuery: [objQuery], audit: true });
            }
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            throw new InternalServerErrorException(`Error al guardar la cuenta contable: ${error?.message ?? error}`);
        }
    }

    /**
     * Elimina una o varias cuentas contables (detalle).
     */
    async deleteDetPlanCuentas(dtoIn: ArrayIdeDto & HeaderParamsDto) {
        if (!dtoIn.ide || dtoIn.ide.length === 0) {
            throw new BadRequestException('Debe proporcionar al menos un ide_cndpc para eliminar');
        }
        try {
            const deleteQuery = new DeleteQuery('con_det_plan_cuen');
            deleteQuery.where = 'ide_cndpc = ANY ($1)';
            deleteQuery.addParam(1, dtoIn.ide);
            return this.dataSource.createQuery(deleteQuery);
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            throw new InternalServerErrorException(`Error al eliminar la cuenta contable: ${error?.message ?? error}`);
        }
    }
}
