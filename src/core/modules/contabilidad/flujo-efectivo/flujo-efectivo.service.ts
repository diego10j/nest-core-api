import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { ObjectQueryDto } from 'src/core/connection/dto';
import { DeleteQuery, SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';
import { DataSourceService } from 'src/core/connection/datasource.service';

import { DeleteFlujoClasifDto, SaveFlujoClasifDto } from './dto/flujo-efectivo.dto';

const MODULE = 'con';
const TABLE = 'flujo_cuenta_clasif';
const PK = 'ide_cnfcc';

@Injectable()
export class FlujoEfectivoService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) { }

    /**
     * Retorna todas las clasificaciones de flujo de efectivo de la sucursal.
     * Incluye el nombre y código de la cuenta del plan para facilitar la pantalla de configuración.
     */
    async getClasificaciones(dto: HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT
                f.ide_cnfcc,
                f.ide_cndpc,
                dpc.codig_recur_cndpc,
                dpc.nombre_cndpc,
                tc.nombre_cntcu,
                f.clasificacion_cnfcc,
                f.es_no_monetaria_cnfcc,
                f.descripcion_cnfcc,
                f.orden_cnfcc
            FROM con_flujo_cuenta_clasif f
            JOIN con_det_plan_cuen dpc ON f.ide_cndpc   = dpc.ide_cndpc
            JOIN con_tipo_cuenta   tc  ON dpc.ide_cntcu = tc.ide_cntcu
            WHERE f.ide_sucu = $1
            ORDER BY f.clasificacion_cnfcc, f.orden_cnfcc, dpc.codig_recur_cndpc
        `);
        query.addIntParam(1, dto.ideSucu);
        return this.dataSource.createQuery(query);
    }

    /**
     * Retorna las cuentas del plan que aún NO tienen clasificación de flujo
     * y que tampoco son cuentas de efectivo (no están en tes_cuenta_banco).
     * Sólo retorna cuentas HIJO (cuentas movibles) para facilitar la clasificación.
     */
    async getCuentasParaClasificar(dto: HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT
                dpc.ide_cndpc,
                dpc.codig_recur_cndpc,
                dpc.nombre_cndpc,
                tc.nombre_cntcu
            FROM con_det_plan_cuen dpc
            JOIN con_tipo_cuenta   tc  ON dpc.ide_cntcu = tc.ide_cntcu
            WHERE dpc.nivel_cndpc = 'HIJO'
              AND NOT EXISTS (
                    SELECT 1 FROM con_flujo_cuenta_clasif f
                    WHERE f.ide_cndpc = dpc.ide_cndpc
                      AND f.ide_sucu  = $1
              )
              AND NOT EXISTS (
                    SELECT 1 FROM tes_cuenta_banco tcb
                    WHERE tcb.ide_cndpc      = dpc.ide_cndpc
                      AND tcb.ide_sucu       = $1
                      AND tcb.activo_tecba   = true
              )
            ORDER BY dpc.codig_recur_cndpc
        `);
        query.isLazy = false;
        query.addIntParam(1, dto.ideSucu);
        return this.dataSource.createQuery(query);
    }

    /**
     * Retorna las cuentas de efectivo y equivalentes identificadas automáticamente
     * desde tes_cuenta_banco (no necesitan clasificación manual).
     */
    async getCuentasEfectivo(dto: HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT
                tcb.ide_tecba,
                tcb.nombre_tecba,
                tcb.ide_cndpc,
                dpc.codig_recur_cndpc,
                dpc.nombre_cndpc,
                b.nombre_teban,
                b.es_caja_teban
            FROM tes_cuenta_banco  tcb
            JOIN con_det_plan_cuen dpc ON tcb.ide_cndpc = dpc.ide_cndpc
            JOIN tes_banco         b   ON tcb.ide_teban = b.ide_teban
            WHERE tcb.ide_sucu      = $1
              AND tcb.activo_tecba  = true
            ORDER BY b.es_caja_teban DESC, tcb.nombre_tecba
        `);
        query.isLazy = false;
        query.addIntParam(1, dto.ideSucu);
        return this.dataSource.createQuery(query);
    }

    /**
     * Crea o actualiza la clasificación de flujo de efectivo de una cuenta.
     */
    async saveClasificacion(dto: HeaderParamsDto & { data: SaveFlujoClasifDto }) {
        try {
            const listQuery: ObjectQueryDto[] = [];
            const isUpdate = !!dto.data.ide_cnfcc;

            if (isUpdate) {
                listQuery.push({
                    operation: 'update',
                    module: MODULE,
                    tableName: TABLE,
                    primaryKey: PK,
                    object: dto.data,
                    condition: `${PK} = ${dto.data.ide_cnfcc} AND ide_sucu = ${dto.ideSucu}`,
                });
            } else {
                const newId = await this.dataSource.getSeqTable(`${MODULE}_${TABLE}`, PK, 1, dto.login);
                dto.data.ide_cnfcc = newId;
                listQuery.push({
                    operation: 'insert',
                    module: MODULE,
                    tableName: TABLE,
                    primaryKey: PK,
                    object: {
                        ...dto.data,
                        ide_empr: dto.ideEmpr,
                        ide_sucu: dto.ideSucu,
                        usuario_ingre: dto.login,
                    },
                });
            }

            return this.core.save({ ...dto, listQuery, audit: true });
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al guardar la clasificación de flujo: ${msg}`);
        }
    }

    /**
     * Elimina una o varias clasificaciones de flujo de efectivo.
     */
    async deleteClasificacion(dto: HeaderParamsDto & DeleteFlujoClasifDto) {
        if (!dto.ide || dto.ide.length === 0) {
            throw new BadRequestException('Debe proporcionar al menos un ide_cnfcc para eliminar');
        }
        try {
            const deleteQuery = new DeleteQuery(`${MODULE}_${TABLE}`, dto);
            deleteQuery.where = `${PK} = ANY ($1) AND ide_sucu = $2`;
            deleteQuery.addParam(1, dto.ide);
            deleteQuery.addIntParam(2, dto.ideSucu);
            return this.dataSource.createQuery(deleteQuery);
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al eliminar la clasificación de flujo: ${msg}`);
        }
    }
}
