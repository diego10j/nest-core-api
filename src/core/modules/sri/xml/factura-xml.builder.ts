import { ComprobanteDto } from '../cel/dto/comprobante.dto';
import { EmisorDto } from '../cel/dto/emisor.dto';

import { formatFechaSri } from './fecha-sri.util';
import { buildInfoAdicionalComprobante } from './info-adicional-sri.util';
import { fNumero, fPrecio } from './numero-sri.util';
import { getCodigoPorcentajeIva, CODIGO_PORCENTAJE_IVA_0, TipoImpuestoCodigo } from './tipo-impuesto-iva.util';

const CORREO_POR_DEFECTO = 'ventas@produquimic.com.ec';

/** Puerto fiel de FacturaServiceImp.getXmlFactura (legacy sigafi-ceo). */
export function buildFacturaXml(comprobante: ComprobanteDto, emisor: EmisorDto): string {
  const baseTarifa0 = Number(comprobante.subtotal0 ?? 0);
  const baseGrabada = Number(comprobante.subtotal ?? 0);
  const totalSinImpuestos = baseTarifa0 + baseGrabada;
  const totalDescuento = Number(comprobante.totaldescuento ?? 0);
  const iva = Number(comprobante.iva ?? 0);
  const porcentajeIva = baseGrabada > 0 ? (iva * 100) / baseGrabada : 0;

  let subtotales = '';
  if (baseGrabada > 0) {
    subtotales += `				<totalImpuesto>
					<codigo>${TipoImpuestoCodigo.IVA}</codigo>
					<codigoPorcentaje>${getCodigoPorcentajeIva(porcentajeIva)}</codigoPorcentaje>
					<descuentoAdicional>${fNumero(0)}</descuentoAdicional>
					<baseImponible>${fNumero(baseGrabada)}</baseImponible>
					<valor>${fNumero(iva)}</valor>
				</totalImpuesto>
`;
  }
  if (baseTarifa0 > 0) {
    subtotales += `				<totalImpuesto>
					<codigo>${TipoImpuestoCodigo.IVA}</codigo>
					<codigoPorcentaje>${CODIGO_PORCENTAJE_IVA_0}</codigoPorcentaje>
					<descuentoAdicional>${fNumero(0)}</descuentoAdicional>
					<baseImponible>${fNumero(baseTarifa0)}</baseImponible>
					<valor>${fNumero(0)}</valor>
				</totalImpuesto>
`;
  }

  const agenteRetencion = comprobante.agenteRetencion ? `<agenteRetencion>1</agenteRetencion> \n` : '';

  let detalles = '';
  for (const detalle of comprobante.detalle ?? []) {
    const valorIva = detalle.preciototalsinimpuesto * (detalle.porcentajeiva / 100);
    detalles += `			<detalle>
				<codigoPrincipal>${detalle.codigoprincipal}</codigoPrincipal>
				<codigoAuxiliar>${detalle.codigoauxiliar ?? detalle.codigoprincipal}</codigoAuxiliar>
				<descripcion>${detalle.descripciondet}</descripcion>
				<cantidad>${fNumero(detalle.cantidad, 3)}</cantidad>
				<precioUnitario>${fPrecio(detalle.preciounitario)}</precioUnitario>
				<descuento>${fNumero(detalle.descuento ?? 0)}</descuento>
				<precioTotalSinImpuesto>${fNumero(detalle.preciototalsinimpuesto)}</precioTotalSinImpuesto>
				<impuestos>
					<impuesto>
						<codigo>${TipoImpuestoCodigo.IVA}</codigo>
						<codigoPorcentaje>${getCodigoPorcentajeIva(detalle.porcentajeiva)}</codigoPorcentaje>
						<tarifa>${detalle.porcentajeiva}</tarifa>
						<baseImponible>${fNumero(detalle.preciototalsinimpuesto)}</baseImponible>
						<valor>${fNumero(valorIva)}</valor>
					</impuesto>
				</impuestos>
			</detalle>
`;
  }

  // guiaRemision es opcional en la Ficha Técnica SRI: si no hay guía asociada, el tag
  // no debe enviarse (ni siquiera vacío) — el SRI rechaza <guiaRemision></guiaRemision>.
  const guiaRemisionTag = comprobante.guiaremision
    ? `			<guiaRemision>${comprobante.guiaremision}</guiaRemision>\n`
    : '';

  const infoAdicional = buildInfoAdicionalComprobante(comprobante, CORREO_POR_DEFECTO);

  return `<?xml version="1.0" encoding="UTF-8"?>
     <factura id="comprobante" version="1.1.0">
		<infoTributaria>
			<ambiente>${emisor.ambiente}</ambiente>
			<tipoEmision>${comprobante.tipoemision}</tipoEmision>
			<razonSocial>${emisor.razonSocial}</razonSocial>
			<nombreComercial>${emisor.nombreComercial}</nombreComercial>
			<ruc>${emisor.ruc}</ruc>
			<claveAcceso>${comprobante.claveacceso}</claveAcceso>
			<codDoc>01</codDoc>
			<estab>${comprobante.estab}</estab>
			<ptoEmi>${comprobante.ptoemi}</ptoEmi>
			<secuencial>${comprobante.secuencial}</secuencial>
			<dirMatriz>${emisor.dirMatriz}</dirMatriz>
${agenteRetencion}		</infoTributaria>
		<infoFactura>
			<fechaEmision>${formatFechaSri(comprobante.fechaemision)}</fechaEmision>
			<dirEstablecimiento>${emisor.dirMatriz}</dirEstablecimiento>
			<obligadoContabilidad>${emisor.obligadoContabilidad}</obligadoContabilidad>
			<tipoIdentificacionComprador>${comprobante.cliente?.tipoIdentificacion}</tipoIdentificacionComprador>
${guiaRemisionTag}			<razonSocialComprador>${comprobante.cliente?.nombreCliente}</razonSocialComprador>
			<identificacionComprador>${comprobante.cliente?.identificacion?.trim()}</identificacionComprador>
			<direccionComprador>${comprobante.cliente?.direccion ?? ''}</direccionComprador>
			<totalSinImpuestos>${fNumero(totalSinImpuestos)}</totalSinImpuestos>
			<totalDescuento>${fNumero(totalDescuento)}</totalDescuento>
			<totalConImpuestos>
${subtotales}			</totalConImpuestos>
			<propina>${fNumero(0)}</propina>
			<importeTotal>${fNumero(comprobante.importetotal)}</importeTotal>
			<moneda>DOLAR</moneda>
                   <pagos>
                           <pago>
                                    <formaPago>${comprobante.formaCobro}</formaPago>
                                    <total>${fNumero(comprobante.importetotal)}</total>
                                    <plazo>${comprobante.diasCredito ?? 0}</plazo>
                                    <unidadTiempo>dias</unidadTiempo>
                           </pago>
                   </pagos>
		</infoFactura>
		<detalles>
${detalles}		</detalles>
		<retenciones>
			<retencion>
				<codigo>4</codigo>
				<codigoPorcentaje>3</codigoPorcentaje>
				<tarifa>1</tarifa>
				<valor>0.00</valor>
			</retencion>
		</retenciones>
${infoAdicional}     </factura>`;
}
