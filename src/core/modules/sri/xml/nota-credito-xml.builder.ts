import { ComprobanteDto } from '../cel/dto/comprobante.dto';
import { EmisorDto } from '../cel/dto/emisor.dto';

import { formatFechaSri } from './fecha-sri.util';
import { buildInfoAdicionalComprobante } from './info-adicional-sri.util';
import { fNumero, fPrecio } from './numero-sri.util';
import { getCodigoPorcentajeIva, CODIGO_PORCENTAJE_IVA_0, TipoImpuestoCodigo } from './tipo-impuesto-iva.util';

const CORREO_POR_DEFECTO = 'ventas@produquimic.com.ec';

/** Puerto fiel de NotaCreditoServiceImp.getXmlNotaCredito (legacy sigafi-ceo). */
export function buildNotaCreditoXml(comprobante: ComprobanteDto, emisor: EmisorDto): string {
  const baseTarifa0 = Number(comprobante.subtotal0 ?? 0);
  const baseGrabada = Number(comprobante.subtotal ?? 0);
  const totalSinImpuestos = baseTarifa0 + baseGrabada;
  const iva = Number(comprobante.iva ?? 0);
  const porcentajeIva = baseGrabada > 0 ? (iva * 100) / baseGrabada : 0;

  let subtotales = '';
  if (baseGrabada > 0) {
    subtotales += `				<totalImpuesto>
					<codigo>${TipoImpuestoCodigo.IVA}</codigo>
					<codigoPorcentaje>${getCodigoPorcentajeIva(porcentajeIva)}</codigoPorcentaje>
					<baseImponible>${fNumero(baseGrabada)}</baseImponible>
					<valor>${fNumero(iva)}</valor>
				</totalImpuesto>
`;
  }
  if (baseTarifa0 > 0) {
    subtotales += `				<totalImpuesto>
					<codigo>${TipoImpuestoCodigo.IVA}</codigo>
					<codigoPorcentaje>${CODIGO_PORCENTAJE_IVA_0}</codigoPorcentaje>
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
				<codigoInterno>${detalle.codigoprincipal}</codigoInterno>
				<codigoAdicional>${detalle.codigoauxiliar ?? detalle.codigoprincipal}</codigoAdicional>
				<descripcion>${detalle.descripciondet}</descripcion>
				<cantidad>${fNumero(detalle.cantidad, 3)}</cantidad>
				<precioUnitario>${fPrecio(detalle.preciounitario)}</precioUnitario>
				<descuento>${fNumero(detalle.descuento ?? 0)}</descuento>
				<precioTotalSinImpuesto>${fNumero(detalle.preciototalsinimpuesto)}</precioTotalSinImpuesto>
				<impuestos>
					<impuesto>
						<codigo>${TipoImpuestoCodigo.IVA}</codigo>
						<codigoPorcentaje>${getCodigoPorcentajeIva(fNumero(detalle.porcentajeiva))}</codigoPorcentaje>
						<tarifa>${fNumero(detalle.porcentajeiva)}</tarifa>
						<baseImponible>${fNumero(detalle.preciototalsinimpuesto)}</baseImponible>
						<valor>${fNumero(valorIva)}</valor>
					</impuesto>
				</impuestos>
			</detalle>
`;
  }

  const infoAdicional = buildInfoAdicionalComprobante(comprobante, CORREO_POR_DEFECTO);

  return `<?xml version="1.0" encoding="UTF-8"?>
     <notaCredito id="comprobante" version="1.1.0">
		<infoTributaria>
			<ambiente>${emisor.ambiente}</ambiente>
			<tipoEmision>${comprobante.tipoemision}</tipoEmision>
			<razonSocial>${emisor.razonSocial}</razonSocial>
			<nombreComercial>${emisor.nombreComercial}</nombreComercial>
			<ruc>${emisor.ruc}</ruc>
			<claveAcceso>${comprobante.claveacceso}</claveAcceso>
			<codDoc>04</codDoc>
			<estab>${comprobante.estab}</estab>
			<ptoEmi>${comprobante.ptoemi}</ptoEmi>
			<secuencial>${comprobante.secuencial}</secuencial>
			<dirMatriz>${emisor.dirMatriz}</dirMatriz>
${agenteRetencion}		</infoTributaria>
		<infoNotaCredito>
			<fechaEmision>${formatFechaSri(comprobante.fechaemision)}</fechaEmision>
			<dirEstablecimiento>${comprobante.direstablecimiento ?? emisor.dirMatriz}</dirEstablecimiento>
			<tipoIdentificacionComprador>${comprobante.cliente?.tipoIdentificacion}</tipoIdentificacionComprador>
			<razonSocialComprador>${comprobante.cliente?.nombreCliente}</razonSocialComprador>
			<identificacionComprador>${comprobante.cliente?.identificacion?.trim()}</identificacionComprador>
			<obligadoContabilidad>${emisor.obligadoContabilidad}</obligadoContabilidad>
                   <codDocModificado>${comprobante.coddocmodificado ?? ''}</codDocModificado>
                   <numDocModificado>${comprobante.numdocmodificado ?? ''}</numDocModificado>
                   <fechaEmisionDocSustento>${formatFechaSri(comprobante.fechaemisiondocsustento)}</fechaEmisionDocSustento>
			<totalSinImpuestos>${fNumero(totalSinImpuestos)}</totalSinImpuestos>
                   <valorModificacion>${fNumero(comprobante.importetotal)}</valorModificacion>
			<moneda>DOLAR</moneda>
			<totalConImpuestos>
${subtotales}			</totalConImpuestos>
			<motivo>${comprobante.motivo ?? ''}</motivo>
		</infoNotaCredito>
		<detalles>
${detalles}		</detalles>
${infoAdicional}     </notaCredito>`;
}
