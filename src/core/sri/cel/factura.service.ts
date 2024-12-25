// 

import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSourceService } from '../../connection/datasource.service';
import { BaseService } from '../../../common/base-service';
import { ServiceDto } from 'src/common/dto/service.dto';
import { SelectQuery } from 'src/core/connection/helpers';
import { ClaveAccesoDto } from './dto/clave-acceso.dto';
import { ComprobantesElecService } from './comprobantes-elec.service';
import { EmisorService } from './emisor.service';
import { fNumber } from 'src/util/helpers/number-util';


@Injectable()
export class FacturaService extends BaseService {


    constructor(private readonly dataSource: DataSourceService,
        private readonly comprobantesElecService: ComprobantesElecService,
        private readonly emisorService: EmisorService) {
        super();
    }


    async getXmlFactura(dtoIn: ClaveAccesoDto) {

        const comprobante = await this.comprobantesElecService.getComprobantePorClaveAcceso(dtoIn);
        const emisor = await this.emisorService.getEmisor(dtoIn);
        if (comprobante) {

            const dou_base_no_objeto_iva = 0; // No aplica
            const dou_base_tarifa0 = comprobante.subtotal0 || 0;
            const dou_base_grabada = comprobante.subtotal || 0;
            const totalSinImpuestos = dou_base_no_objeto_iva + dou_base_tarifa0 + dou_base_grabada;
            const dou_porcentaje_iva = ((comprobante.iva * 100) / dou_base_grabada) || 0;

            let str_subtotales = "";
            if (comprobante.subtotal > 0) {
                str_subtotales += `
                    <totalImpuesto>
                        <codigo>").append(TipoImpuestoEnum.IVA.getCodigo())</codigo>
                        <codigoPorcentaje>").append(TipoImpuestoIvaEnum.getCodigo(dou_porcentaje_iva))</codigoPorcentaje>
                        <descuentoAdicional>${fNumber(comprobante.totaldescuento)}</descuentoAdicional>
                        <baseImponible>${fNumber(comprobante.subtotal)}</baseImponible>
                        <valor>${fNumber(comprobante.iva)}</valor>
                    </totalImpuesto>
                `;

            }

            if (comprobante.subtotal0 > 0) {
                str_subtotales += `
                    <totalImpuesto>
                        <codigo>").append(TipoImpuestoEnum.IVA.getCodigo())</codigo>
                        <codigoPorcentaje>").append(TipoImpuestoIvaEnum.IVA_VENTA_0.getCodigo())</codigoPorcentaje>
                        <descuentoAdicional>${fNumber(0)}</descuentoAdicional>
                        <baseImponible>${fNumber(comprobante.subtotal0)}</baseImponible>
                        <valor>${fNumber(0)}</valor>
                    </totalImpuesto>;
                `;

            }
            const agenteRetencion = comprobante.agenteRetencion ? `<agenteRetencion>${comprobante.agenteRetencion}</agenteRetencion> ` : '';

            let xml = "";
            xml = `
            <?xml version=\"1.0\" encoding=\"UTF-8\"?>\n")
            <factura id=\"comprobante\" version=\"1.1.0\">
               <infoTributaria>
                   <ambiente>${emisor.ambiente}</ambiente>
                   <tipoEmision>").append(comprobante.getTipoemision()).</tipoEmision>
                   <razonSocial>").append(emisor.getRazonsocial()).</razonSocial>
                   <nombreComercial>").append(emisor.getNombrecomercial()).</nombreComercial>
                   <ruc>").append(emisor.getRuc()).</ruc>
                   <claveAcceso>").append(comprobante.getClaveacceso()).</claveAcceso>
                   <codDoc>").append(TipoComprobanteEnum.FACTURA.getCodigo()).</codDoc>
                   <estab>").append(comprobante.getEstab()).</estab>
                   <ptoEmi>").append(comprobante.getPtoemi()).</ptoEmi>
                   <secuencial>").append(comprobante.getSecuencial()).</secuencial>
                   <dirMatriz>").append(emisor.getDirmatriz()).</dirMatriz>
                   ${agenteRetencion}
               </infoTributaria>
               <infoFactura>
                   <fechaEmision>").append(utilitario.getFormatoFecha(comprobante.getFechaemision(), "dd/MM/yyyy")).</fechaEmision> 
                   <dirEstablecimiento>").append(emisor.getDirmatriz()).</dirEstablecimiento>
        //  			<contribuyenteEspecial>").append(emisor.getContribuyenteespecial()).</contribuyenteEspecial>
                   <obligadoContabilidad>").append(emisor.getObligadocontabilidad()).</obligadoContabilidad>
                   <tipoIdentificacionComprador>").append(comprobante.getCliente().getTipoIdentificacion()).</tipoIdentificacionComprador> 
                   <guiaRemision>").append(comprobante.getGuiaremision()).</guiaRemision> 
                   <razonSocialComprador>").append(comprobante.getCliente().getNombreCliente()).</razonSocialComprador> 
                   <identificacionComprador>").append(comprobante.getCliente().getIdentificacion().trim()).</identificacionComprador> 
                   <direccionComprador>").append(comprobante.getCliente().getDireccion()).</direccionComprador>
                   <totalSinImpuestos>").append(utilitario.getFormatoNumero(totalSinImpuestos)).</totalSinImpuestos> 
                   <totalDescuento>").append((utilitario.getFormatoNumero(0))).</totalDescuento> 
                   <totalConImpuestos> 
                   ${str_subtotales}
                   </totalConImpuestos> 
                   <propina>").append(utilitario.getFormatoNumero(0)).</propina> 
                   <importeTotal>").append(utilitario.getFormatoNumero(comprobante.getImportetotal())).</importeTotal>
                   <moneda>").append(moneda).</moneda>
                          <pagos>
                                  <pago>
                                           <formaPago>").append(comprobante.getFormaCobro()).</formaPago>
                                           <total>").append(utilitario.getFormatoNumero(comprobante.getImportetotal())).</total> 
                                           <plazo>").append(comprobante.getDiasCredito()).</plazo> 
                                           <unidadTiempo>").dias").</unidadTiempo> 
                                  </pago> 
                          </pagos>
               </infoFactura> 
               <detalles> 
            `;



        }
        else {
            throw new BadRequestException(`No existe el comrpobante : ${dtoIn.claveAcceso}`);
        }
    }



}