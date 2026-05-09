import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';

import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { InsertQuery, SelectQuery, UpdateQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';
import { isDefined } from 'src/util/helpers/common-util';
import { getCurrentDate, getCurrentTime } from 'src/util/helpers/date-util';
import { SriFacturaService } from 'src/core/modules/sri/cel/sri-factura.service';

import { DetaFacturaDto, SaveFacturaDto } from './dto/save-factura.dto';

const MODULE = 'cxc';
const TABLE_CAB = 'cabece_factura';
const TABLE_DET = 'deta_factura';
const PK_CAB = 'ide_cccfa';
const PK_DET = 'ide_ccdfa';

@Injectable()
export class FacturasSaveService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
        private readonly sriFacturaService: SriFacturaService,
    ) {
        super();
        this.core
            .getVariables([
                'p_cxc_estado_factura_normal',
                'p_con_tipo_documento_factura',
                'p_sri_estado_comprobante_creado',
            ])
            .then((result) => {
                this.variables = result;
            });
    }

    private get ideEstadoNormal(): number {
        return Number(this.variables.get('p_cxc_estado_factura_normal'));
    }

    private get ideTipoDocFactura(): number {
        return Number(this.variables.get('p_con_tipo_documento_factura'));
    }

    private get ideSriEstadoCreado(): number {
        return Number(this.variables.get('p_sri_estado_comprobante_creado'));
    }

    /**
     * Crea o actualiza una factura (cabecera + detalles + comprobante SRI).
     */
    async save(dtoIn: SaveFacturaDto & HeaderParamsDto) {
        try {
            if (!dtoIn.data) throw new BadRequestException('El campo data es requerido');
            if (!dtoIn.detalles || dtoIn.detalles.length === 0) {
                throw new BadRequestException('La factura debe tener al menos un ítem en el detalle.');
            }

            const { data, detalles } = dtoIn;
            const isUpdate = dtoIn.isUpdate && !!data.ide_cccfa;

            // Validar punto de emisión y cliente
            const { ptoEmision, cliente } = await this.validarFactura(dtoIn);

            // Configurar tarifa IVA
            const tarifaIva = isDefined(data.tarifa_iva_cccfa)
                ? Number(data.tarifa_iva_cccfa)
                : 15;

            // Calcular totales
            const totales = this.calcularTotales(detalles, tarifaIva);

            // Validar cantidades y precios
            for (const det of detalles) {
                if (det.cantidad_ccdfa <= 0) {
                    throw new BadRequestException(`La cantidad del artículo ide_inarti=${det.ide_inarti} debe ser mayor a 0.`);
                }
                if (det.precio_ccdfa < 0) {
                    throw new BadRequestException(`El precio del artículo ide_inarti=${det.ide_inarti} no puede ser negativo.`);
                }
            }

            // Aplicar defaults de cabecera
            data.ide_cntdo = this.ideTipoDocFactura;
            data.ide_ccefa = this.ideEstadoNormal;
            data.ide_usua = dtoIn.ideUsua;

            if (isUpdate) {
                return this.actualizarFactura(data.ide_cccfa, data, detalles, totales, tarifaIva, cliente, dtoIn);
            }

            return this.crearFactura(data, detalles, totales, tarifaIva, ptoEmision, cliente, dtoIn);
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al guardar la factura: ${msg}`);
        }
    }

    /**
     * Elimina una o varias facturas.
     */
    async deleteFacturas(dtoIn: { ide: number[] } & HeaderParamsDto) {
        if (!dtoIn.ide || dtoIn.ide.length === 0) {
            throw new BadRequestException('Debe proporcionar al menos un ide_cccfa para eliminar');
        }
        try {
            const deleteDet = new SelectQuery(`
                DELETE FROM cxc_deta_factura
                WHERE ide_cccfa = ANY ($1)
            `);
            deleteDet.addParam(1, dtoIn.ide);
            await this.dataSource.createSelectQuery(deleteDet);

            const deleteCab = new SelectQuery(`
                DELETE FROM cxc_cabece_factura
                WHERE ide_cccfa = ANY ($1) AND ide_sucu = $2
            `);
            deleteCab.addParam(1, dtoIn.ide);
            deleteCab.addIntParam(2, dtoIn.ideSucu);
            return this.dataSource.createQuery(deleteCab);
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Error al eliminar facturas: ${msg}`);
        }
    }

    // ─── PRIVADOS ──────────────────────────────────────────────────────────

    /**
     * Valida punto de emisión y cliente. Lanza BadRequestException si no son válidos.
     */
    private async validarFactura(
        dtoIn: SaveFacturaDto & HeaderParamsDto,
    ): Promise<{ ptoEmision: any; cliente: any }> {
        const qPto = new SelectQuery(`
            SELECT
                a.ide_ccdaf,
                a.establecimiento_ccdfa,
                a.pto_emision_ccdfa,
                a.num_actual_ccdfa,
                a.ide_sucu
            FROM cxc_datos_fac a
            WHERE a.ide_ccdaf = $1
              AND a.ide_empr   = $2
        `);
        qPto.addIntParam(1, dtoIn.data.ide_ccdaf);
        qPto.addIntParam(2, dtoIn.ideEmpr);
        const ptoEmision = await this.dataSource.createSingleQuery(qPto);

        if (!ptoEmision) {
            throw new BadRequestException(
                `El punto de emisión ide_ccdaf=${dtoIn.data.ide_ccdaf} no existe o no pertenece a la empresa.`,
            );
        }

        const qCliente = new SelectQuery(`
            SELECT
                g.ide_geper,
                g.nom_geper,
                g.identificac_geper,
                g.correo_geper,
                g.direccion_geper,
                t.alterno2_getid AS tipo_identificacion
            FROM gen_persona g
            INNER JOIN gen_tipo_identifi t ON g.ide_getid = t.ide_getid
            WHERE g.ide_geper = $1
        `);
        qCliente.addIntParam(1, dtoIn.data.ide_geper);
        const cliente = await this.dataSource.createSingleQuery(qCliente);

        if (!cliente) {
            throw new BadRequestException(
                `El cliente ide_geper=${dtoIn.data.ide_geper} no existe.`,
            );
        }

        return { ptoEmision, cliente };
    }

    /**
     * Calcula base tarifa 0%, base grabada, IVA y total a partir del detalle.
     */
    private calcularTotales(detalles: DetaFacturaDto[], tarifaIva: number) {
        let baseTarifa0 = 0;
        let baseGrabada = 0;

        for (const det of detalles) {
            if (det.iva_inarti_ccdfa > 0) {
                baseGrabada += Number(det.total_ccdfa);
            } else {
                baseTarifa0 += Number(det.total_ccdfa);
            }
        }

        const valorIva = Number((baseGrabada * (tarifaIva / 100)).toFixed(2));
        const total = Number((baseTarifa0 + baseGrabada + valorIva).toFixed(2));

        return {
            base_no_objeto_iva: 0,
            base_tarifa0: Number(baseTarifa0.toFixed(2)),
            base_grabada: Number(baseGrabada.toFixed(2)),
            valor_iva: valorIva,
            total,
        };
    }

    /**
     * Crea una nueva factura: SRI comprobante + cabecera + detalles + actualiza secuencial.
     */
    private async crearFactura(
        data: SaveFacturaDto['data'],
        detalles: DetaFacturaDto[],
        totales: ReturnType<FacturasSaveService['calcularTotales']>,
        tarifaIva: number,
        ptoEmision: any,
        cliente: any,
        dtoIn: SaveFacturaDto & HeaderParamsDto,
    ) {
        const numActual = Number(ptoEmision.num_actual_ccdfa) + 1;
        const secuencial = String(numActual).padStart(9, '0');

        data.secuencial_cccfa = secuencial;

        const [ideSrcom, ideCccfa, baseIdeCcdfa] = await Promise.all([
            this.sriFacturaService.getSecuencialSriComprobante(dtoIn.login),
            this.dataSource.getSeqTable(`${MODULE}_${TABLE_CAB}`, PK_CAB, 1, dtoIn.login),
            this.dataSource.getSeqTable(`${MODULE}_${TABLE_DET}`, PK_DET, detalles.length, dtoIn.login),
        ]);

        data.ide_cccfa = ideCccfa;
        data.ide_srcom = ideSrcom;

        const insertSriComp = await this.sriFacturaService.buildSriComprobanteInsert(
            {
                ideEmpr: dtoIn.ideEmpr,
                ideSucu: dtoIn.ideSucu,
                login: dtoIn.login,
                ide_sresc: this.ideSriEstadoCreado,
                ide_cntdo: this.ideTipoDocFactura,
                ide_geper: data.ide_geper,
                fecha_emisi: data.fecha_emisi_cccfa,
                estab: ptoEmision.establecimiento_ccdfa,
                pto_emi: ptoEmision.pto_emision_ccdfa,
                secuencial,
                subtotal0: totales.base_tarifa0,
                base_grabada: totales.base_grabada,
                iva: totales.valor_iva,
                total: totales.total,
                identificacion: cliente.identificac_geper,
                forma_cobro: data.ide_cndfp1 ? String(data.ide_cndfp1) : '01',
                dias_credito: data.dias_credito_cccfa ?? 0,
                correo: data.correo_cccfa ?? cliente.correo_geper,
            },
            ideSrcom,
        );

        const insertCabecera = this.buildInsertCabecera(data, totales, tarifaIva, dtoIn);

        const insertDetalles = detalles.map((det, idx) =>
            this.buildInsertDetalle(ideCccfa, baseIdeCcdfa + idx, det, dtoIn),
        );

        const updatePto = new UpdateQuery('cxc_datos_fac', 'ide_ccdaf', dtoIn);
        updatePto.values.set('num_actual_ccdfa', numActual);
        updatePto.where = `ide_ccdaf = ${data.ide_ccdaf}`;

        await this.dataSource.createListQuery([
            insertSriComp,
            insertCabecera,
            ...insertDetalles,
            updatePto,
        ]);

        return {
            message: 'ok',
            rowCount: 1,
            ide_cccfa: ideCccfa,
            ide_srcom: ideSrcom,
            secuencial_cccfa: secuencial,
            numero_completo: `${ptoEmision.establecimiento_ccdfa}-${ptoEmision.pto_emision_ccdfa}-${secuencial}`,
            total: totales.total,
        };
    }

    /**
     * Actualiza una factura existente: cabecera + reemplaza detalles.
     * También actualiza el comprobante SRI si los totales cambiaron.
     */
    private async actualizarFactura(
        ideCccfa: number,
        data: SaveFacturaDto['data'],
        detalles: DetaFacturaDto[],
        totales: ReturnType<FacturasSaveService['calcularTotales']>,
        tarifaIva: number,
        _cliente: any,
        dtoIn: SaveFacturaDto & HeaderParamsDto,
    ) {
        const existe = await this.dataSource.createSingleQuery(
            new SelectQuery(`SELECT ide_cccfa, ide_srcom FROM cxc_cabece_factura WHERE ide_cccfa = $1 AND ide_empr = $2`)
                .addIntParam(1, ideCccfa)
                .addIntParam(2, dtoIn.ideEmpr),
        );

        if (!existe) {
            throw new BadRequestException(`La factura ide_cccfa=${ideCccfa} no existe`);
        }

        // Actualizar SRI comprobante si existe
        if (existe.ide_srcom) {
            const updSri = new UpdateQuery('sri_comprobante', 'ide_srcom');
            updSri.values.set('subtotal0_srcom', totales.base_tarifa0);
            updSri.values.set('base_grabada_srcom', totales.base_grabada);
            updSri.values.set('iva_srcom', totales.valor_iva);
            updSri.values.set('total_srcom', totales.total);
            updSri.values.set('identificacion_srcom', data.ide_geper);
            updSri.where = `ide_srcom = ${existe.ide_srcom}`;
            await this.dataSource.createQuery(updSri);
        }

        // Actualizar cabecera
        const updCab = this.buildUpdateCabecera(ideCccfa, data, totales, tarifaIva, dtoIn);
        await this.dataSource.createQuery(updCab);

        // Reemplazar detalles
        if (detalles.length > 0) {
            await this.dataSource.pool.query(
                `DELETE FROM cxc_deta_factura WHERE ide_cccfa = $1`,
                [ideCccfa],
            );

            for (let idx = 0; idx < detalles.length; idx++) {
                const ideCcdfa = await this.dataSource.getSeqTable(
                    `${MODULE}_${TABLE_DET}`,
                    PK_DET,
                    1,
                    dtoIn.login,
                );
                const insertDet = this.buildInsertDetalle(ideCccfa, ideCcdfa, detalles[idx], dtoIn);
                await this.dataSource.createQuery(insertDet);
            }
        }

        return {
            message: 'ok',
            rowCount: 1,
            ide_cccfa: ideCccfa,
            total: totales.total,
        };
    }

    private buildInsertCabecera(
        data: SaveFacturaDto['data'],
        totales: ReturnType<FacturasSaveService['calcularTotales']>,
        tarifaIva: number,
        dtoIn: SaveFacturaDto & HeaderParamsDto,
    ): InsertQuery {
        const q = new InsertQuery(`${MODULE}_${TABLE_CAB}`, PK_CAB, dtoIn);
        q.values.set('ide_cccfa', data.ide_cccfa);
        q.values.set('ide_ccdaf', data.ide_ccdaf);
        q.values.set('ide_geper', data.ide_geper);
        q.values.set('ide_cntdo', data.ide_cntdo);
        q.values.set('ide_ccefa', data.ide_ccefa);
        q.values.set('ide_srcom', data.ide_srcom);
        q.values.set('ide_usua', data.ide_usua);
        q.values.set('fecha_emisi_cccfa', data.fecha_emisi_cccfa);
        q.values.set('secuencial_cccfa', data.secuencial_cccfa);
        q.values.set('base_no_objeto_iva_cccfa', totales.base_no_objeto_iva);
        q.values.set('base_tarifa0_cccfa', totales.base_tarifa0);
        q.values.set('base_grabada_cccfa', totales.base_grabada);
        q.values.set('valor_iva_cccfa', totales.valor_iva);
        q.values.set('tarifa_iva_cccfa', tarifaIva);
        q.values.set('total_cccfa', totales.total);
        q.values.set('dias_credito_cccfa', data.dias_credito_cccfa ?? 0);
        q.values.set('pagado_cccfa', false);
        q.values.set('solo_guardar_cccfa', false);
        q.values.set('usuario_ingre', dtoIn.login);
        q.values.set('fecha_ingre', getCurrentDate());
        q.values.set('hora_ingre', getCurrentTime());
        if (isDefined(data.ide_vgven)) q.values.set('ide_vgven', data.ide_vgven);
        if (isDefined(data.ide_cndfp1)) q.values.set('ide_cndfp1', data.ide_cndfp1);
        if (isDefined(data.observacion_cccfa)) q.values.set('observacion_cccfa', data.observacion_cccfa);
        if (isDefined(data.direccion_cccfa)) q.values.set('direccion_cccfa', data.direccion_cccfa);
        if (isDefined(data.correo_cccfa)) q.values.set('correo_cccfa', data.correo_cccfa);
        if (isDefined(data.orden_compra_cccfa)) q.values.set('orden_compra_cccfa', data.orden_compra_cccfa);
        return q;
    }

    private buildUpdateCabecera(
        ideCccfa: number,
        data: SaveFacturaDto['data'],
        totales: ReturnType<FacturasSaveService['calcularTotales']>,
        tarifaIva: number,
        dtoIn: SaveFacturaDto & HeaderParamsDto,
    ): UpdateQuery {
        const q = new UpdateQuery(`${MODULE}_${TABLE_CAB}`, PK_CAB, dtoIn);
        q.values.set('ide_ccdaf', data.ide_ccdaf);
        q.values.set('ide_geper', data.ide_geper);
        q.values.set('fecha_emisi_cccfa', data.fecha_emisi_cccfa);
        q.values.set('base_no_objeto_iva_cccfa', totales.base_no_objeto_iva);
        q.values.set('base_tarifa0_cccfa', totales.base_tarifa0);
        q.values.set('base_grabada_cccfa', totales.base_grabada);
        q.values.set('valor_iva_cccfa', totales.valor_iva);
        q.values.set('tarifa_iva_cccfa', tarifaIva);
        q.values.set('total_cccfa', totales.total);
        q.values.set('dias_credito_cccfa', data.dias_credito_cccfa ?? 0);
        q.values.set('usuario_actua', dtoIn.login);
        q.values.set('fecha_actua', getCurrentDate());
        q.values.set('hora_actua', getCurrentTime());
        if (isDefined(data.ide_vgven)) q.values.set('ide_vgven', data.ide_vgven);
        if (isDefined(data.ide_cndfp1)) q.values.set('ide_cndfp1', data.ide_cndfp1);
        if (isDefined(data.observacion_cccfa)) q.values.set('observacion_cccfa', data.observacion_cccfa);
        if (isDefined(data.direccion_cccfa)) q.values.set('direccion_cccfa', data.direccion_cccfa);
        if (isDefined(data.correo_cccfa)) q.values.set('correo_cccfa', data.correo_cccfa);
        if (isDefined(data.orden_compra_cccfa)) q.values.set('orden_compra_cccfa', data.orden_compra_cccfa);
        q.where = `${PK_CAB} = $1 AND ide_empr = $2`;
        q.addIntParam(1, ideCccfa);
        q.addIntParam(2, dtoIn.ideEmpr);
        return q;
    }

    private buildInsertDetalle(
        ideCccfa: number,
        ideCcdfa: number,
        det: DetaFacturaDto,
        dtoIn: SaveFacturaDto & HeaderParamsDto,
    ): InsertQuery {
        const q = new InsertQuery(`${MODULE}_${TABLE_DET}`, PK_DET, dtoIn);
        q.values.set('ide_ccdfa', ideCcdfa);
        q.values.set('ide_cccfa', ideCccfa);
        q.values.set('ide_inarti', det.ide_inarti);
        q.values.set('cantidad_ccdfa', det.cantidad_ccdfa);
        q.values.set('precio_ccdfa', det.precio_ccdfa);
        q.values.set('total_ccdfa', det.total_ccdfa);
        q.values.set('iva_inarti_ccdfa', det.iva_inarti_ccdfa);
        q.values.set('credito_tributario_ccdfa', det.credito_tributario_ccdfa ?? false);
        q.values.set('usuario_ingre', dtoIn.login);
        q.values.set('fecha_ingre', getCurrentDate());
        q.values.set('hora_ingre', getCurrentTime());
        if (isDefined(det.observacion_ccdfa)) q.values.set('observacion_ccdfa', det.observacion_ccdfa);
        if (isDefined(det.ide_inuni)) q.values.set('ide_inuni', det.ide_inuni);
        return q;
    }
}
