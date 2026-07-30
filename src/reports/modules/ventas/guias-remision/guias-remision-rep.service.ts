import { Injectable, NotFoundException } from '@nestjs/common';
import * as bwipjs from 'bwip-js';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { ambienteDesdeClaveAcceso } from 'src/reports/common/ride/ride-report.util';
import { EmpresaRepService } from 'src/reports/common/services/empresa-rep.service';
import { PrinterService } from 'src/reports/printer/printer.service';

import { GetGuiaRemisionDto } from './dto/get-guia-remision.dto';
import { guiaRemisionReport } from './guia-remision.report';
import { GuiaRemisionCabecera, GuiaRemisionDetalle, GuiaRemisionRep } from './interfaces/guia-remision-rep';

@Injectable()
export class GuiasRemisionRepService {
    constructor(
        private readonly printerService: PrinterService,
        private readonly dataSource: DataSourceService,
        private readonly empresaRepService: EmpresaRepService,
    ) { }

    /**
     * RIDE de la Guía de Remisión. Nota: cxc_guia.ide_srcom aún no se puebla al
     * guardar la factura (comentario "se asignará al generar la guía electrónica
     * en SriModule" en facturas-save.service.ts::buildInsertGuia) — hasta que esa
     * pieza se conecte, claveAcceso/autorización/número propio de la guía vendrán
     * vacíos, igual que una factura sin autorizar (el reporte lo maneja sin fallar).
     */
    async reportGuiaRemision(dtoIn: HeaderParamsDto & GetGuiaRemisionDto) {
        const queryCabecera = new SelectQuery(`
            SELECT
                g.ide_ccgui, g.ide_cccfa, g.fecha_emision_ccgui, g.fecha_ini_trasla_ccgui, g.fecha_fin_trasla_ccgui,
                g.punto_partida_ccgui, g.punto_llegada_ccgui, g.destinatario_ccgui, g.placa_gecam,
                tg.nombre_cctgi,
                dest.identificac_geper AS destinatario_identificacion,
                dest.direccion_geper AS destinatario_direccion,
                cf.secuencial_cccfa, cf.fecha_emisi_cccfa,
                df.establecimiento_ccdfa, df.pto_emision_ccdfa,
                sFact.autorizacion_srcomn AS factura_autorizacion,
                t.es_transporte_propio_cctfa,
                ca.descripcion_gecam AS vehiculo,
                tr.nombre_vgtra,
                ch.nom_geper AS chofer,
                sGuia.claveacceso_srcom, sGuia.autorizacion_srcomn, sGuia.fechaautoriza_srcom,
                sGuia.estab_srcom, sGuia.ptoemi_srcom, sGuia.secuencial_srcom
            FROM cxc_guia g
            INNER JOIN cxc_cabece_factura cf ON g.ide_cccfa = cf.ide_cccfa
            INNER JOIN cxc_datos_fac df ON cf.ide_ccdaf = df.ide_ccdaf
            LEFT JOIN cxc_tipo_guia tg ON g.ide_cctgi = tg.ide_cctgi
            LEFT JOIN gen_persona dest ON g.ide_geper = dest.ide_geper
            LEFT JOIN cxc_transporte_factura t ON t.ide_cccfa = g.ide_cccfa
            LEFT JOIN gen_camion ca ON g.placa_gecam = ca.placa_gecam
            LEFT JOIN ven_transporte tr ON t.ide_vgtra = tr.ide_vgtra
            LEFT JOIN gen_persona ch ON t.ide_geper = ch.ide_geper
            LEFT JOIN sri_comprobante sFact ON cf.ide_srcom = sFact.ide_srcom
            LEFT JOIN sri_comprobante sGuia ON g.ide_srcom = sGuia.ide_srcom
            WHERE g.ide_ccgui = $1
              AND cf.ide_empr = $2
        `);
        queryCabecera.addIntParam(1, dtoIn.ide_ccgui);
        queryCabecera.addIntParam(2, dtoIn.ideEmpr);
        const cabecera = (await this.dataSource.createSingleQuery(queryCabecera)) as GuiaRemisionCabecera;
        if (!cabecera) {
            throw new NotFoundException(`Guía de remisión ${dtoIn.ide_ccgui} no encontrada`);
        }

        const queryDetalles = new SelectQuery(`
            SELECT
                d.ide_ccdfa, d.ide_inarti, f.codigo_inarti, f.nombre_inarti, d.cantidad_ccdfa, d.observacion_ccdfa,
                u.siglas_inuni
            FROM cxc_deta_factura d
            INNER JOIN inv_articulo f ON d.ide_inarti = f.ide_inarti
            LEFT JOIN inv_unidad u ON f.ide_inuni = u.ide_inuni
            WHERE d.ide_cccfa = $1
            ORDER BY d.ide_ccdfa
        `);
        queryDetalles.addIntParam(1, cabecera.ide_cccfa);
        const detalles = (await this.dataSource.createSelectQuery(queryDetalles)) as GuiaRemisionDetalle[];

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

        const data: GuiaRemisionRep = { cabecera, detalles };
        const docDefinition = guiaRemisionReport(data, empresa, barcodeDataUrl, ambienteTexto);
        try {
            return this.printerService.createPdf(docDefinition);
        } catch {
            const docFallback = guiaRemisionReport(data, empresa, undefined, ambienteTexto);
            return this.printerService.createPdf(docFallback);
        }
    }
}
