import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { DeleteQuery, InsertQuery, Query, SelectQuery, UpdateQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';
import { isDefined } from 'src/util/helpers/common-util';
import { getCurrentDate, getCurrentTime, toPgDate } from 'src/util/helpers/date-util';

import { AnularRetencionVentaDto, DetalleRetencionVentaDto, SaveRetencionVentaDto } from './dto/save-retencion-venta.dto';

const TABLE_RET_CAB = 'con_cabece_retenc';
const PK_RET_CAB = 'ide_cncre';
const TABLE_RET_DET = 'con_detall_retenc';
const PK_RET_DET = 'ide_cndre';

/**
 * Persistencia del comprobante de retención recibido en una venta (con_cabece_retenc,
 * es_venta_cncre=true) - ej. retención de Bendo/procesador de tarjeta sobre el depósito de una
 * venta con tarjeta. A diferencia de compras (RetencionesCxPSaveService), esta retención SIEMPRE
 * llega ya emitida por un tercero (nunca la genera/firma este sistema) - se registra tal cual
 * viene en el XML. Migrado de Retencion.guardar() (caso ide_cccfa != null) +
 * ServicioCuentasCxC.generarTransaccionRetencion del legacy.
 */
@Injectable()
export class RetencionVentaSaveService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) {
        super();
        this.core
            .getVariables([
                'p_con_estado_comprobante_rete_normal',
                'p_con_estado_comprobante_rete_anulado',
                'p_cxc_tipo_trans_retencion',
                'p_cxc_estado_factura_normal',
            ])
            .then((result) => {
                this.variables = result;
            });
    }

    private getVar(name: string): number {
        const val = this.variables.get(name);
        if (!isDefined(val)) {
            throw new InternalServerErrorException(
                `Variable del sistema '${name}' no configurada. Contacte al administrador.`,
            );
        }
        return Number(val);
    }

    /**
     * Crea el comprobante de retención de una factura de venta en una única transacción:
     * con_cabece_retenc + con_detall_retenc + transacción CxC de retención (disminuye el
     * saldo por cobrar) + vínculo de la factura (ide_cncre).
     */
    async saveRetencion(dtoIn: SaveRetencionVentaDto & HeaderParamsDto) {
        try {
            const { detalles } = dtoIn;
            if (!detalles || detalles.length === 0) {
                throw new BadRequestException('Debe ingresar detalles al comprobante de retención');
            }

            // ── Factura ──────────────────────────────────────────────────────
            const qFac = new SelectQuery(`
                SELECT ide_cccfa, ide_geper, secuencial_cccfa, fecha_trans_cccfa,
                       total_cccfa, ide_cncre, ide_ccefa, ide_cnccc
                FROM cxc_cabece_factura
                WHERE ide_cccfa = $1
            `);
            qFac.addIntParam(1, dtoIn.ide_cccfa);
            const factura = await this.dataSource.createSingleQuery(qFac);
            if (!factura) throw new BadRequestException(`La factura ide_cccfa=${dtoIn.ide_cccfa} no existe.`);
            if (factura.ide_cncre) {
                throw new BadRequestException('La factura ya tiene un comprobante de retención registrado.');
            }
            if (Number(factura.ide_ccefa) !== this.getVar('p_cxc_estado_factura_normal')) {
                throw new BadRequestException('No se puede registrar la retención de una factura anulada.');
            }

            const fechaEmision = toPgDate(dtoIn.fecha_emisi_cncre) || getCurrentDate();
            await this.validarAntiDuplicado(dtoIn.autorizacion_cncre, dtoIn.numero_cncre);

            const totalRetencion = Number(
                detalles.reduce((sum, d) => sum + this.valorDetalle(d), 0).toFixed(2),
            );
            if (totalRetencion <= 0) {
                throw new BadRequestException('El valor total de la retención debe ser mayor a 0.');
            }
            if (totalRetencion > Number(factura.total_cccfa || 0)) {
                throw new BadRequestException(
                    `El valor retenido (${totalRetencion.toFixed(2)}) no puede ser mayor al total de la factura (${Number(factura.total_cccfa).toFixed(2)}).`,
                );
            }

            // Cabecera de transacción CxC de la factura (donde se registra la retención)
            const qTrn = new SelectQuery(`
                SELECT ide_ccctr FROM cxc_cabece_transa WHERE ide_cccfa = $1 LIMIT 1
            `);
            qTrn.addIntParam(1, dtoIn.ide_cccfa);
            const trn = await this.dataSource.createSingleQuery(qTrn);
            if (!trn) {
                throw new BadRequestException('La factura no tiene transacción de cuenta por cobrar asociada.');
            }

            // ── Secuenciales ─────────────────────────────────────────────────
            const ideCncre = await this.dataSource.getSeqTable(TABLE_RET_CAB, PK_RET_CAB, 1, dtoIn.login);
            const baseIdeCndre = await this.dataSource.getSeqTable(TABLE_RET_DET, PK_RET_DET, detalles.length, dtoIn.login);
            const ideCcdtr = await this.dataSource.getSeqTable('cxc_detall_transa', 'ide_ccdtr', 1, dtoIn.login);

            // ── Construcción de la transacción ───────────────────────────────
            const listQuery: Query[] = [];

            const insCab = new InsertQuery(TABLE_RET_CAB, PK_RET_CAB, dtoIn);
            insCab.values.set(PK_RET_CAB, ideCncre);
            insCab.values.set('ide_cnere', this.getVar('p_con_estado_comprobante_rete_normal'));
            insCab.values.set('es_venta_cncre', true);
            insCab.values.set('fecha_emisi_cncre', fechaEmision);
            insCab.values.set('numero_cncre', dtoIn.numero_cncre);
            insCab.values.set('autorizacion_cncre', dtoIn.autorizacion_cncre);
            insCab.values.set(
                'observacion_cncre',
                dtoIn.observacion_cncre ?? `Retención Factura N. ${factura.secuencial_cccfa}`,
            );
            insCab.values.set('fecha_ingre', getCurrentDate());
            insCab.values.set('hora_ingre', getCurrentTime());
            listQuery.push(insCab);

            detalles.forEach((det, idx) => {
                const insDet = new InsertQuery(TABLE_RET_DET, PK_RET_DET, dtoIn);
                insDet.values.set(PK_RET_DET, baseIdeCndre + idx);
                insDet.values.set(PK_RET_CAB, ideCncre);
                insDet.values.set('ide_cncim', det.ide_cncim);
                insDet.values.set('porcentaje_cndre', det.porcentaje_cndre);
                insDet.values.set('base_cndre', det.base_cndre);
                insDet.values.set('valor_cndre', this.valorDetalle(det));
                insDet.values.set('fecha_ingre', getCurrentDate());
                insDet.values.set('hora_ingre', getCurrentTime());
                listQuery.push(insDet);
            });

            // Transacción CxC de retención (disminuye el saldo por cobrar de la factura)
            const insTrn = new InsertQuery('cxc_detall_transa', 'ide_ccdtr', dtoIn);
            insTrn.values.set('ide_ccdtr', ideCcdtr);
            insTrn.values.set('ide_ccctr', Number(trn.ide_ccctr));
            insTrn.values.set('ide_cccfa', dtoIn.ide_cccfa);
            insTrn.values.set('ide_ccttr', this.getVar('p_cxc_tipo_trans_retencion'));
            insTrn.values.set('ide_usua', dtoIn.ideUsua);
            insTrn.values.set('fecha_trans_ccdtr', factura.fecha_trans_cccfa ?? getCurrentDate());
            insTrn.values.set('fecha_venci_ccdtr', factura.fecha_trans_cccfa ?? getCurrentDate());
            insTrn.values.set('valor_ccdtr', totalRetencion);
            insTrn.values.set('observacion_ccdtr', `V/. RETENCIÓN FACTURA N. ${factura.secuencial_cccfa}`);
            insTrn.values.set('numero_pago_ccdtr', 0);
            insTrn.values.set('docum_relac_ccdtr', factura.secuencial_cccfa);
            insTrn.values.set('ide_cnccc', factura.ide_cnccc ?? null);
            insTrn.values.set('fecha_ingre', getCurrentDate());
            insTrn.values.set('hora_ingre', getCurrentTime());
            listQuery.push(insTrn);

            // Vincular la retención a la factura
            const updFac = new UpdateQuery('cxc_cabece_factura', 'ide_cccfa', dtoIn);
            updFac.values.set('ide_cncre', ideCncre);
            updFac.where = 'ide_cccfa = $1';
            updFac.addIntParam(1, dtoIn.ide_cccfa);
            listQuery.push(updFac);

            await this.dataSource.createListQuery(listQuery);

            return {
                message: 'ok',
                ide_cncre: ideCncre,
                ide_cccfa: dtoIn.ide_cccfa,
                total_retencion: totalRetencion,
            };
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al guardar la retención: ${msg}`);
        }
    }

    /**
     * Anula un comprobante de retención de venta: cambia su estado, desvincula la factura y
     * elimina la transacción CxC de retención para restituir el saldo por cobrar.
     */
    async anularRetencion(dtoIn: AnularRetencionVentaDto & HeaderParamsDto) {
        const qRet = new SelectQuery(`
            SELECT ide_cncre FROM ${TABLE_RET_CAB} WHERE ide_cncre = $1 AND es_venta_cncre = TRUE
        `);
        qRet.addIntParam(1, dtoIn.ide_cncre);
        const retencion = await this.dataSource.createSingleQuery(qRet);
        if (!retencion) {
            throw new BadRequestException(`El comprobante de retención ide_cncre=${dtoIn.ide_cncre} no existe.`);
        }

        const qFac = new SelectQuery(`
            SELECT ide_cccfa FROM cxc_cabece_factura WHERE ide_cncre = $1 LIMIT 1
        `);
        qFac.addIntParam(1, dtoIn.ide_cncre);
        const factura = await this.dataSource.createSingleQuery(qFac);

        const listQuery: Query[] = [];

        const updRet = new UpdateQuery(TABLE_RET_CAB, PK_RET_CAB, dtoIn);
        updRet.values.set('ide_cnere', this.getVar('p_con_estado_comprobante_rete_anulado'));
        updRet.where = 'ide_cncre = $1';
        updRet.addIntParam(1, dtoIn.ide_cncre);
        listQuery.push(updRet);

        if (factura?.ide_cccfa) {
            const updFac = new UpdateQuery('cxc_cabece_factura', 'ide_cccfa', dtoIn);
            updFac.values.set('ide_cncre', null);
            updFac.where = 'ide_cccfa = $1';
            updFac.addIntParam(1, Number(factura.ide_cccfa));
            listQuery.push(updFac);

            const delTrn = new DeleteQuery('cxc_detall_transa');
            delTrn.where = 'ide_cccfa = $1 AND ide_ccttr = $2 AND numero_pago_ccdtr = 0';
            delTrn.addIntParam(1, Number(factura.ide_cccfa));
            delTrn.addIntParam(2, this.getVar('p_cxc_tipo_trans_retencion'));
            listQuery.push(delTrn);
        }

        await this.dataSource.createListQuery(listQuery);
        return { message: 'ok', ide_cncre: dtoIn.ide_cncre, ide_cccfa: factura?.ide_cccfa ?? null };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HELPERS PRIVADOS
    // ─────────────────────────────────────────────────────────────────────────

    private valorDetalle(det: DetalleRetencionVentaDto): number {
        if (isDefined(det.valor_cndre)) return Number(Number(det.valor_cndre).toFixed(2));
        return Number(((Number(det.base_cndre) * Number(det.porcentaje_cndre)) / 100).toFixed(2));
    }

    private async validarAntiDuplicado(autorizacion: string, numero: string) {
        const qDup = new SelectQuery(`
            SELECT 1 AS existe FROM ${TABLE_RET_CAB}
            WHERE autorizacion_cncre = $1 AND numero_cncre = $2 AND es_venta_cncre = TRUE
            LIMIT 1
        `);
        qDup.addStringParam(1, autorizacion);
        qDup.addStringParam(2, numero);
        const dup = await this.dataSource.createSingleQuery(qDup);
        if (dup) throw new BadRequestException('El comprobante de retención ya existe.');
    }
}
