import { Injectable, NotFoundException } from '@nestjs/common';
import * as bwipjs from 'bwip-js';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { ambienteDesdeClaveAcceso } from 'src/reports/common/ride/ride-report.util';
import { EmpresaRepService } from 'src/reports/common/services/empresa-rep.service';
import { PrinterService } from 'src/reports/printer/printer.service';

import { GetLiquidacionCompraDto } from './dto/get-liquidacion-compra.dto';
import {
    LiquidacionCompraCabecera,
    LiquidacionCompraDetalle,
    LiquidacionCompraRep,
    LiquidacionCompraReembolso,
} from './interfaces/liquidacion-compra-rep';
import { liquidacionCompraReport } from './liquidacion-compra.report';

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
}
