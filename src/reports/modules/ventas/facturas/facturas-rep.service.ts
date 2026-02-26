import { Injectable, NotFoundException } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { GetFacturaDto } from 'src/core/modules/ventas/facturas/dto/get-factura.dto';
import { EmpresaRepService } from 'src/reports/common/services/empresa-rep.service';
import { PrinterService } from 'src/reports/printer/printer.service';
import * as bwipjs from 'bwip-js';

import { facturaElectronicaReport } from './factura.report';
import { FacturaCabecera, FacturaDetalle, FacturaPago, FacturaRep } from './interfaces/factura-rep';

@Injectable()
export class FacturasRepService {
    constructor(
        private readonly printerService: PrinterService,
        private readonly dataSource: DataSourceService,
        private readonly empresaRepService: EmpresaRepService,
    ) { }

    async reportFacturaElectronica(dtoIn: GetFacturaDto & HeaderParamsDto) {
        // ── Cabecera de la factura ────────────────────────────────────────────
        const queryCabecera = new SelectQuery(`
      SELECT
        a.ide_cccfa,
        a.ide_ccdaf,
        a.ide_geper,
        a.ide_vgven,
        a.ide_cnccc,
        a.ide_cncre,
        a.ide_ccefa,
        a.ide_srcom,
        a.fecha_emisi_cccfa,
        a.secuencial_cccfa,
        a.dias_credito_cccfa,
        a.observacion_cccfa,
        a.base_grabada_cccfa,
        a.base_tarifa0_cccfa,
        a.base_no_objeto_iva_cccfa,
        a.valor_iva_cccfa,
        a.tarifa_iva_cccfa,
        a.total_cccfa,
        a.usuario_ingre,
        a.fecha_ingre,
        a.hora_ingre,
        -- Punto de emisión
        c.serie_ccdaf,
        c.establecimiento_ccdfa,
        c.pto_emision_ccdfa,
        c.observacion_ccdaf,
        -- Cliente
        b.nom_geper,
        b.identificac_geper,
        b.direccion_geper,
        b.telefono_geper,
        b.correo_geper,
        -- Comprobante SRI
        d.claveacceso_srcom,
        d.autorizacion_srcomn,
        d.fechaautoriza_srcom,
        d.ide_sresc,
        -- Estado SRI
        f.nombre_sresc,
        f.icono_sresc,
        f.color_sresc,
        -- Vendedor
        v.nombre_vgven,
        -- Forma de pago
        x.nombre_cndfp,
        -- Número de retención
        (
          SELECT numero_cncre
          FROM con_cabece_retenc
          WHERE ide_cncre = a.ide_cncre
        ) AS numero_retencion
      FROM cxc_cabece_factura a
        INNER JOIN gen_persona b ON a.ide_geper = b.ide_geper
        INNER JOIN cxc_datos_fac c ON a.ide_ccdaf = c.ide_ccdaf
        LEFT JOIN sri_comprobante d ON a.ide_srcom = d.ide_srcom
        LEFT JOIN sri_estado_comprobante f ON d.ide_sresc = f.ide_sresc
        LEFT JOIN ven_vendedor v ON a.ide_vgven = v.ide_vgven
        LEFT JOIN con_deta_forma_pago x ON a.ide_cndfp1 = x.ide_cndfp
      WHERE a.ide_cccfa = $1
        AND a.ide_empr = ${dtoIn.ideEmpr}
    `);
        queryCabecera.addIntParam(1, dtoIn.ide_cccfa);
        const cabecera = (await this.dataSource.createSingleQuery(queryCabecera)) as FacturaCabecera;

        if (!cabecera) {
            throw new NotFoundException(`Factura ${dtoIn.ide_cccfa} no encontrada`);
        }

        // ── Detalles de la factura ────────────────────────────────────────────
        const queryDetalles = new SelectQuery(`
      SELECT
        d.ide_ccdfa,
        d.ide_inarti,
        d.cantidad_ccdfa,
        d.precio_ccdfa,
        d.total_ccdfa,
        d.observacion_ccdfa,
        d.iva_inarti_ccdfa,
        p.codigo_inarti,
        p.nombre_inarti,
        p.otro_nombre_inarti,
        u.siglas_inuni,
        cat.nombre_incate
      FROM cxc_deta_factura d
        INNER JOIN inv_articulo p ON d.ide_inarti = p.ide_inarti
        LEFT JOIN inv_unidad u ON p.ide_inuni = u.ide_inuni
        LEFT JOIN inv_categoria cat ON p.ide_incate = cat.ide_incate
      WHERE d.ide_cccfa = $1
      ORDER BY d.ide_ccdfa
    `);
        queryDetalles.addIntParam(1, dtoIn.ide_cccfa);
        const detalles = (await this.dataSource.createSelectQuery(queryDetalles)) as FacturaDetalle[];

        // ── Pagos asociados ───────────────────────────────────────────────────
        const queryPagos = new SelectQuery(`
      SELECT
        a.ide_ccdtr,
        a.fecha_trans_ccdtr,
        a.docum_relac_ccdtr,
        nombre_tettb,
        a.valor_ccdtr,
        e.nombre_teban,
        d.nombre_tecba AS cuenta,
        a.observacion_ccdtr AS observacion,
        SUM(a.valor_ccdtr) OVER () AS totalpagos
      FROM cxc_detall_transa a
        LEFT JOIN cxc_tipo_transacc b ON a.ide_ccttr = b.ide_ccttr
        LEFT JOIN tes_cab_libr_banc c ON a.ide_teclb = c.ide_teclb
        LEFT JOIN tes_cuenta_banco d ON c.ide_tecba = d.ide_tecba
        LEFT JOIN tes_banco e ON d.ide_teban = e.ide_teban
        LEFT JOIN tes_tip_tran_banc f ON c.ide_tettb = f.ide_tettb
      WHERE a.numero_pago_ccdtr > 0
        AND a.ide_cccfa = $1
      ORDER BY a.fecha_trans_ccdtr
    `);
        queryPagos.addIntParam(1, dtoIn.ide_cccfa);
        const resPagos = await this.dataSource.createSelectQuery(queryPagos);

        const totalPagos =
            resPagos && resPagos.length > 0 ? parseFloat(resPagos[0].totalpagos) || 0 : 0;

        // ── Retención ─────────────────────────────────────────────────────────
        let retencData: FacturaRep['retencion'] = null;
        if (cabecera.ide_cncre) {
            const queryRetCab = new SelectQuery(`
        SELECT
          ide_cncre, fecha_emisi_cncre, numero_cncre, observacion_cncre, autorizacion_cncre
        FROM con_cabece_retenc
        WHERE ide_cncre = $1
      `);
            queryRetCab.addParam(1, cabecera.ide_cncre);

            const queryRetDet = new SelectQuery(`
        SELECT
          b.nombre_cncim, b.casillero_cncim,
          a.porcentaje_cndre, a.base_cndre, a.valor_cndre,
          SUM(a.valor_cndre) OVER () AS totalretencion
        FROM con_detall_retenc a
          INNER JOIN con_cabece_impues b ON a.ide_cncim = b.ide_cncim
        WHERE a.ide_cncre = $1
      `);
            queryRetDet.addParam(1, cabecera.ide_cncre);

            const retCab = await this.dataSource.createSingleQuery(queryRetCab);
            const retDet = await this.dataSource.createSelectQuery(queryRetDet);
            const totalRetencion =
                retDet && retDet.length > 0 ? parseFloat(retDet[0].totalretencion) || 0 : 0;

            if (retCab) {
                retencData = { cabecera: retCab, detalles: retDet ?? [], total: totalRetencion };
            }
        }

        // ── Estado de pago ────────────────────────────────────────────────────
        const totalFactura = parseFloat(String(cabecera.total_cccfa)) || 0;
        const totalRetencionAplicada = retencData?.total ?? 0;
        const saldoFinal = totalFactura - totalPagos - totalRetencionAplicada;
        const estaPagada = saldoFinal <= 0;
        const estadoPago = (() => {
            const totalAplicado = totalPagos + totalRetencionAplicada;
            if (totalAplicado === 0) return 'POR PAGAR';
            if (saldoFinal <= 0) return 'PAGADA';
            if (totalAplicado < totalFactura) return 'PAGADO PARCIAL';
            return 'PAGADO EN EXCESO';
        })();

        const pagos: FacturaPago = {
            pagada: estaPagada,
            estado: estadoPago,
            color: estaPagada ? 'success' : 'warning',
            detalles: resPagos ?? [],
            total: totalPagos,
        };

        // ── Datos de empresa ──────────────────────────────────────────────────
        const empresa = await this.empresaRepService.getEmpresaById(dtoIn.ideEmpr);

        // ── Código de barras Code128 de la clave de acceso ────────────────────
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
            } catch (_) {
                // Si falla, se omite el barcode sin interrumpir el reporte
            }
        }

        // ── Construir objeto reporte ──────────────────────────────────────────
        const facturaRep: FacturaRep = {
            cabecera,
            detalles: detalles ?? [],
            pagos,
            retencion: retencData,
        };

        const docDefinition = facturaElectronicaReport(facturaRep, empresa, barcodeDataUrl);
        return this.printerService.createPdf(docDefinition);
    }
}
