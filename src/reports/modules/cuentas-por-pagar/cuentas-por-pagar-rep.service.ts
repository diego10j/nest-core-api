import { Injectable, NotFoundException } from '@nestjs/common';
import * as bwipjs from 'bwip-js';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { ambienteDesdeClaveAcceso } from 'src/reports/common/ride/ride-report.util';
import { EmpresaRepService } from 'src/reports/common/services/empresa-rep.service';
import { PrinterService } from 'src/reports/printer/printer.service';

import { GetLiquidacionCompraDto } from './dto/get-liquidacion-compra.dto';
import { GetOrdenPagoDto } from './dto/get-orden-pago.dto';
import {
    LiquidacionCompraCabecera,
    LiquidacionCompraDetalle,
    LiquidacionCompraRep,
    LiquidacionCompraReembolso,
} from './interfaces/liquidacion-compra-rep';
import {
    CuentaBancoProveedor,
    OrdenPagoCabecera,
    OrdenPagoDetalle,
    OrdenPagoGrupoProveedor,
    OrdenPagoRep,
} from './interfaces/orden-pago-rep';
import { liquidacionCompraReport } from './liquidacion-compra.report';
import { ordenPagoReport } from './orden-pago.report';

@Injectable()
export class CuentasPorPagarRepService {
    constructor(
        private readonly printerService: PrinterService,
        private readonly dataSource: DataSourceService,
        private readonly empresaRepService: EmpresaRepService,
    ) { }

    /** RIDE de la Liquidación de Compra electrónica. */
    async reportLiquidacionCompra(dtoIn: HeaderParamsDto & GetLiquidacionCompraDto) {
        const queryCabecera = new SelectQuery(`
            SELECT
                a.ide_cpcfa, a.numero_cpcfa, a.fecha_emisi_cpcfa, a.observacion_cpcfa,
                a.base_grabada_cpcfa, a.base_tarifa0_cpcfa, a.base_no_objeto_iva_cpcfa,
                a.valor_iva_cpcfa, a.valor_ice_cpcfa, a.tarifa_iva_cpcfa, a.descuento_cpcfa, a.total_cpcfa,
                p.nom_geper, p.identificac_geper, p.direccion_geper, p.telefono_geper, p.correo_geper,
                x.nombre_cndfp,
                s.claveacceso_srcom, s.autorizacion_srcomn, s.fechaautoriza_srcom
            FROM cxp_cabece_factur a
            INNER JOIN gen_persona p ON a.ide_geper = p.ide_geper
            LEFT JOIN con_deta_forma_pago x ON a.ide_cndfp = x.ide_cndfp
            LEFT JOIN sri_comprobante s ON a.ide_srcom = s.ide_srcom
            WHERE a.ide_cpcfa = $1
              AND a.ide_empr = $2
        `);
        queryCabecera.addIntParam(1, dtoIn.ide_cpcfa);
        queryCabecera.addIntParam(2, dtoIn.ideEmpr);
        const cabecera = (await this.dataSource.createSingleQuery(queryCabecera)) as LiquidacionCompraCabecera;
        if (!cabecera) {
            throw new NotFoundException(`Liquidación de compra ${dtoIn.ide_cpcfa} no encontrada`);
        }

        const queryDetalles = new SelectQuery(`
            SELECT
                d.ide_cpdfa, d.ide_inarti, f.codigo_inarti, f.nombre_inarti,
                d.cantidad_cpdfa, d.precio_cpdfa, d.valor_cpdfa, d.observacion_cpdfa, d.iva_inarti_cpdfa,
                u.siglas_inuni
            FROM cxp_detall_factur d
            INNER JOIN inv_articulo f ON d.ide_inarti = f.ide_inarti
            LEFT JOIN inv_unidad u ON f.ide_inuni = u.ide_inuni
            WHERE d.ide_cpcfa = $1
            ORDER BY d.ide_cpdfa
        `);
        queryDetalles.addIntParam(1, dtoIn.ide_cpcfa);
        const detalles = (await this.dataSource.createSelectQuery(queryDetalles)) as LiquidacionCompraDetalle[];

        const queryReembolsos = new SelectQuery(`
            SELECT identificacion_cpdcr, serie_cpdcr, secuencial_cpdcr,
                base_no_objeto_cpdcr, base_tarifa0_cpdcr, base_imponible_cpdcr, valor_iva_cpdcr, valor_ice_cpdcr
            FROM cxp_datos_com_reembolso
            WHERE ide_cpcfa = $1
            ORDER BY ide_cpdcr
        `);
        queryReembolsos.addIntParam(1, dtoIn.ide_cpcfa);
        const reembolsos = (await this.dataSource.createSelectQuery(queryReembolsos)) as LiquidacionCompraReembolso[];

        const empresa = await this.empresaRepService.getEmpresaById(dtoIn.ideEmpr);
        const ambienteTexto = ambienteDesdeClaveAcceso(cabecera.claveacceso_srcom);

        let barcodeDataUrl: string | undefined;
        if (cabecera.claveacceso_srcom) {
            try {
                const pngBuffer = await bwipjs.toBuffer({
                    bcid: 'code128',
                    text: cabecera.claveacceso_srcom,
                    scale: 2,
                    height: 10,
                    includetext: false,
                });
                barcodeDataUrl = `data:image/png;base64,${Buffer.from(pngBuffer).toString('base64')}`;
            } catch {
                // Si falla, se omite el barcode sin interrumpir el reporte
            }
        }

        const data: LiquidacionCompraRep = { cabecera, detalles, reembolsos };
        const docDefinition = liquidacionCompraReport(data, empresa, barcodeDataUrl, ambienteTexto);
        try {
            return this.printerService.createPdf(docDefinition);
        } catch {
            const docFallback = liquidacionCompraReport(data, empresa, undefined, ambienteTexto);
            return this.printerService.createPdf(docFallback);
        }
    }

    /** Reporte de Orden de Pago. */
    async reportOrdenPago(dtoIn: HeaderParamsDto & GetOrdenPagoDto) {
        const queryCabecera = new SelectQuery(`
            SELECT
                cab.ide_cpcop,
                cab.secuencial_cpcop,
                cab.ide_cpeo,
                est.nombre_cpeo                 AS estado,
                est.color_cpeo,
                cab.fecha_genera_cpcop,
                cab.fecha_pago_cpcop,
                cab.fecha_efectiva_pago_cpcop,
                cab.referencia_cpcop,
                cab.activo_cpcop,
                cab.ide_usua,
                u.nom_usua                      AS nombre_usuario,
                cab.ide_empr,
                cab.ide_sucu
            FROM cxp_cab_orden_pago cab
            JOIN cxp_estado_orden est    ON est.ide_cpeo = cab.ide_cpeo
            LEFT JOIN sis_usuario u      ON u.ide_usua   = cab.ide_usua
            WHERE cab.ide_cpcop = $1
              AND cab.ide_empr  = ${dtoIn.ideEmpr}
              AND cab.ide_sucu  = ${dtoIn.ideSucu}
        `);
        queryCabecera.addIntParam(1, dtoIn.ide_cpcop);
        const cabecera = await this.dataSource.createSingleQuery(queryCabecera) as OrdenPagoCabecera;
        if (!cabecera) {
            throw new NotFoundException(`Orden de pago ${dtoIn.ide_cpcop} no encontrada`);
        }

        const queryDetalles = new SelectQuery(`
            SELECT
                det.ide_cpcdop,
                det.ide_cpcop,
                det.ide_cpctr,
                ct.ide_cpcfa,
                cf.numero_cpcfa,
                cf.total_cpcfa,
                ct.ide_geper,
                p.nom_geper                         AS nombre_proveedor,
                p.identificac_geper,
                ti.nombre_getid                     AS identificacion_tipo,
                det.valor_pagado_cpcdop,
                det.activo_cpcdop
            FROM cxp_det_orden_pago det
            JOIN cxp_cabece_transa        ct  ON ct.ide_cpctr  = det.ide_cpctr
            LEFT JOIN cxp_cabece_factur   cf  ON cf.ide_cpcfa  = ct.ide_cpcfa
            LEFT JOIN gen_persona          p  ON p.ide_geper   = ct.ide_geper
            LEFT JOIN gen_tipo_identifi   ti ON p.ide_getid  = ti.ide_getid
            WHERE det.ide_cpcop = $1
            ORDER BY det.ide_cpcdop
        `);
        queryDetalles.addIntParam(1, dtoIn.ide_cpcop);
        const detalles = await this.dataSource.createSelectQuery(queryDetalles) as OrdenPagoDetalle[];

        const queryCtas = new SelectQuery(`
            SELECT sub.ide_cpcbp, sub.ide_geper, sub.nombre_cpcbp, sub.numero_cpcbp,
                   sub.nombre_teban, sub.nombre_tetcb
            FROM (
                SELECT cb.ide_cpcbp, cb.ide_geper, cb.nombre_cpcbp, cb.numero_cpcbp,
                       b.nombre_teban, tc.nombre_tetcb,
                       ROW_NUMBER() OVER (PARTITION BY cb.ide_geper ORDER BY cb.defecto_cpcbp DESC, cb.nombre_cpcbp) AS rn
                FROM cxp_cta_banco_prove cb
                LEFT JOIN tes_banco b ON b.ide_teban = cb.ide_teban
                LEFT JOIN tes_tip_cuen_banc tc ON tc.ide_tetcb = cb.ide_tetcb
                WHERE cb.ide_geper IN (
                    SELECT DISTINCT ct.ide_geper
                    FROM cxp_det_orden_pago det2
                    JOIN cxp_cabece_transa ct ON ct.ide_cpctr = det2.ide_cpctr
                    WHERE det2.ide_cpcop = $1
                )
                  AND cb.activo_cpcbp = true
                  AND cb.ide_empr = ${dtoIn.ideEmpr}
                  AND cb.ide_sucu = ${dtoIn.ideSucu}
            ) sub
            WHERE sub.rn <= 5
            ORDER BY sub.ide_geper, sub.rn
        `);
        queryCtas.addIntParam(1, dtoIn.ide_cpcop);
        const cuentasBancarias = await this.dataSource.createSelectQuery(queryCtas) as CuentaBancoProveedor[];

        const ctasPorProveedor = new Map<number, CuentaBancoProveedor[]>();
        for (const cta of cuentasBancarias) {
            const list = ctasPorProveedor.get(cta.ide_geper) || [];
            list.push(cta);
            ctasPorProveedor.set(cta.ide_geper, list);
        }

        const detalleMap = new Map<number, { proveedor: string; identificacion: string; facturas: string[]; total: number }>();
        for (const det of detalles) {
            if (!det.activo_cpcdop) continue;
            const key = det.ide_geper;
            if (!detalleMap.has(key)) {
                const tipoId = det.identificacion_tipo || '';
                const numId = det.identificac_geper || '';
                const ident = tipoId && numId ? `${tipoId}: ${numId}` : numId || tipoId || '---';
                detalleMap.set(key, { proveedor: det.nombre_proveedor, identificacion: ident, facturas: [], total: 0 });
            }
            const entry = detalleMap.get(key)!;
            if (det.numero_cpcfa && !entry.facturas.includes(det.numero_cpcfa)) {
                entry.facturas.push(det.numero_cpcfa);
            }
            entry.total += Number(det.valor_pagado_cpcdop) || 0;
        }

        const gruposProveedor: OrdenPagoGrupoProveedor[] = [];
        let numPago = 1;
        let totalGeneral = 0;
        for (const [ideGeper, info] of detalleMap) {
            gruposProveedor.push({
                numPago: numPago++,
                nombreProveedor: info.proveedor,
                identificacion: info.identificacion,
                facturas: info.facturas.join(', ') || '---',
                valorTotal: info.total,
                cuentasBancarias: ctasPorProveedor.get(ideGeper) || [],
            });
            totalGeneral += info.total;
        }

        const empresa = await this.empresaRepService.getEmpresaById(dtoIn.ideEmpr);

        const data: OrdenPagoRep = { cabecera, gruposProveedor, totalGeneral };
        const docDefinition = ordenPagoReport(data, empresa);
        return this.printerService.createPdf(docDefinition);
    }
}
