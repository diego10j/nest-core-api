import { Injectable, NotFoundException } from '@nestjs/common';
import * as bwipjs from 'bwip-js';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { ambienteDesdeClaveAcceso } from 'src/reports/common/ride/ride-report.util';
import { EmpresaRepService } from 'src/reports/common/services/empresa-rep.service';
import { PrinterService } from 'src/reports/printer/printer.service';

import { GetNotaCreditoDto } from './dto/get-nota-credito.dto';
import { NotaCreditoCabecera, NotaCreditoDetalle, NotaCreditoRep } from './interfaces/nota-credito-rep';
import { notaCreditoReport } from './nota-credito.report';

@Injectable()
export class NotasCreditoRepService {
    constructor(
        private readonly printerService: PrinterService,
        private readonly dataSource: DataSourceService,
        private readonly empresaRepService: EmpresaRepService,
    ) { }

    /** RIDE de la Nota de Crédito de venta electrónica. */
    async reportNotaCredito(dtoIn: HeaderParamsDto & GetNotaCreditoDto) {
        const queryCabecera = new SelectQuery(`
            SELECT
                a.ide_cpcno, a.numero_cpcno, a.fecha_emisi_cpcno, a.observacion_cpcno,
                a.num_doc_mod_cpcno, a.fecha_emision_mod_cpcno, a.valor_mod_cpcno,
                a.base_grabada_cpcno, a.base_tarifa0_cpcno, a.base_no_objeto_iva_cpcno,
                a.valor_iva_cpcno, a.tarifa_iva_cpcno, a.total_cpcno,
                p.nom_geper, p.identificac_geper, p.direccion_geper, p.telefono_geper, p.correo_geper,
                m.nombre_cpmno,
                ven.nombre_vgven,
                s.claveacceso_srcom, s.autorizacion_srcomn, s.fechaautoriza_srcom
            FROM cxp_cabecera_nota a
            INNER JOIN gen_persona p ON a.ide_geper = p.ide_geper
            LEFT JOIN cxp_motivo_nota m ON a.ide_cpmno = m.ide_cpmno
            LEFT JOIN sri_comprobante s ON a.ide_srcom = s.ide_srcom
            -- Vendedor: la NC no tiene vendedor propio, se muestra el de la factura que
            -- origina la nota de crédito.
            LEFT JOIN cxc_cabece_factura cf ON cf.ide_cccfa = a.ide_cccfa
            LEFT JOIN ven_vendedor ven ON ven.ide_vgven = cf.ide_vgven
            WHERE a.ide_cpcno = $1
              AND a.ide_empr = $2
        `);
        queryCabecera.addIntParam(1, dtoIn.ide_cpcno);
        queryCabecera.addIntParam(2, dtoIn.ideEmpr);
        const cabecera = (await this.dataSource.createSingleQuery(queryCabecera)) as NotaCreditoCabecera;
        if (!cabecera) {
            throw new NotFoundException(`Nota de crédito ${dtoIn.ide_cpcno} no encontrada`);
        }

        const queryDetalles = new SelectQuery(`
            SELECT
                d.ide_cpdno, d.ide_inarti, f.codigo_inarti, f.nombre_inarti,
                d.cantidad_cpdno, d.precio_cpdno, d.valor_cpdno, d.observacion_cpdno, d.iva_inarti_cpdno,
                u.siglas_inuni
            FROM cxp_detalle_nota d
            INNER JOIN inv_articulo f ON d.ide_inarti = f.ide_inarti
            LEFT JOIN inv_unidad u ON f.ide_inuni = u.ide_inuni
            WHERE d.ide_cpcno = $1
            ORDER BY d.ide_cpdno
        `);
        queryDetalles.addIntParam(1, dtoIn.ide_cpcno);
        const detalles = (await this.dataSource.createSelectQuery(queryDetalles)) as NotaCreditoDetalle[];

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

        const data: NotaCreditoRep = { cabecera, detalles };
        const docDefinition = notaCreditoReport(data, empresa, barcodeDataUrl, ambienteTexto);
        try {
            return this.printerService.createPdf(docDefinition);
        } catch {
            const docFallback = notaCreditoReport(data, empresa, undefined, ambienteTexto);
            return this.printerService.createPdf(docFallback);
        }
    }
}
