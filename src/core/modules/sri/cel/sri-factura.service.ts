import { BadRequestException, Injectable } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { InsertQuery } from 'src/core/connection/helpers';
import { fNumber } from 'src/util/helpers/number-util';

import { BaseService } from '../../../../common/base-service';
import { DataSourceService } from '../../../connection/datasource.service';

import { ComprobantesElecService } from './comprobantes-elec.service';
import { ClaveAccesoDto } from './dto/clave-acceso.dto';
import { EmisorService } from './emisor.service';

/** Datos mínimos necesarios para crear el comprobante SRI */
export interface SriComprobanteData {
  ideEmpr: number;
  ideSucu: number;
  login: string;
  ide_sresc: number;
  ide_cntdo: number;
  ide_geper: number;
  fecha_emisi: string;
  estab: string;
  pto_emi: string;
  secuencial: string;
  subtotal0: number;
  base_grabada: number;
  iva: number;
  total: number;
  identificacion: string;
  forma_cobro: string;
  dias_credito: number;
  correo?: string;
}

@Injectable()
export class SriFacturaService extends BaseService {
  constructor(
    private readonly dataSource: DataSourceService,
    private readonly comprobantesElecService: ComprobantesElecService,
    private readonly emisorService: EmisorService,
  ) {
    super();
  }

  /**
   * Retorna el siguiente secuencial disponible para la tabla sri_comprobante
   */
  async getSecuencialSriComprobante(login: string): Promise<number> {
    return this.dataSource.getSeqTable('sri_comprobante', 'ide_srcom', 1, login);
  }

  /**
   * Inserta un registro en sri_comprobante y retorna el ide_srcom generado.
   * Se invoca dentro de la transacción de saveFactura.
   */
  async buildSriComprobanteInsert(data: SriComprobanteData, ideSrcom: number): Promise<InsertQuery> {
    const q = new InsertQuery('sri_comprobante', 'ide_srcom');
    q.values.set('ide_srcom', ideSrcom);
    q.values.set('coddoc_srcom', '01'); // 01 = Factura
    q.values.set('tipoemision_srcom', '1');  // 1 = Normal
    q.values.set('fechaemision_srcom', data.fecha_emisi);
    q.values.set('estab_srcom', data.estab);
    q.values.set('ptoemi_srcom', data.pto_emi);
    q.values.set('secuencial_srcom', data.secuencial);
    q.values.set('ide_sresc', data.ide_sresc);
    q.values.set('subtotal0_srcom', data.subtotal0);
    q.values.set('base_grabada_srcom', data.base_grabada);
    q.values.set('iva_srcom', data.iva);
    q.values.set('total_srcom', data.total);
    q.values.set('identificacion_srcom', data.identificacion);
    q.values.set('forma_cobro_srcom', data.forma_cobro);
    q.values.set('dias_credito_srcom', data.dias_credito);
    q.values.set('correo_srcom', data.correo ?? null);
    q.values.set('ide_geper', data.ide_geper);
    q.values.set('ide_cntdo', data.ide_cntdo);
    q.values.set('ide_empr', data.ideEmpr);
    q.values.set('ide_sucu', data.ideSucu);
    q.values.set('usuario_ingre', data.login);
    q.values.set('fecha_sistema_srcom', new Date());
    return q;
  }

  async getXmlFactura(dtoIn: ClaveAccesoDto & HeaderParamsDto) {
    const comprobante = await this.comprobantesElecService.getComprobantePorClaveAcceso(dtoIn);
    const emisor = await this.emisorService.getEmisor(dtoIn);
    if (comprobante) {
      const dou_base_no_objeto_iva = 0; // No aplica
      const dou_base_tarifa0 = Number(comprobante.subtotal0 ?? 0);
      const dou_base_grabada = Number(comprobante.subtotal ?? 0);
      const totalSinImpuestos = dou_base_no_objeto_iva + dou_base_tarifa0 + dou_base_grabada;
      const dou_iva = Number(comprobante.iva ?? 0);
      const dou_porcentaje_iva = dou_base_grabada > 0 ? (dou_iva * 100) / dou_base_grabada : 0;

      let str_subtotales = '';
      if (dou_base_grabada > 0) {
        str_subtotales += `
                    <totalImpuesto>
                        <codigo>").append(TipoImpuestoEnum.IVA.getCodigo())</codigo>
                        <codigoPorcentaje>").append(TipoImpuestoIvaEnum.getCodigo(dou_porcentaje_iva))</codigoPorcentaje>
                        <descuentoAdicional>${fNumber(comprobante.totaldescuento ?? 0)}</descuentoAdicional>
                        <baseImponible>${fNumber(dou_base_grabada)}</baseImponible>
                        <valor>${fNumber(dou_iva)}</valor>
                    </totalImpuesto>
                `;
      }

      if (dou_base_tarifa0 > 0) {
        str_subtotales += `
                    <totalImpuesto>
                        <codigo>").append(TipoImpuestoEnum.IVA.getCodigo())</codigo>
                        <codigoPorcentaje>").append(TipoImpuestoIvaEnum.IVA_VENTA_0.getCodigo())</codigoPorcentaje>
                        <descuentoAdicional>${fNumber(0)}</descuentoAdicional>
                        <baseImponible>${fNumber(dou_base_tarifa0)}</baseImponible>
                        <valor>${fNumber(0)}</valor>
                    </totalImpuesto>;
                `;
      }
      const agenteRetencion = comprobante.agenteRetencion
        ? `<agenteRetencion>${comprobante.agenteRetencion}</agenteRetencion> `
        : '';

      let xml = '';
      xml = `
            <?xml version="1.0" encoding="UTF-8"?>\n")
            <factura id="comprobante" version="1.1.0">
               <infoTributaria>
                   <ambiente>${emisor.ambiente}</ambiente>
                   <tipoEmision>${comprobante.tipoemision}</tipoEmision>
                   <razonSocial>${emisor.razonSocial}</razonSocial>
                   <nombreComercial>${emisor.nombreComercial}</nombreComercial>
                   <ruc>${emisor.ruc}</ruc>
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
    } else {
      throw new BadRequestException(`No existe el comrpobante : ${dtoIn.claveAcceso}`);
    }
  }
}
