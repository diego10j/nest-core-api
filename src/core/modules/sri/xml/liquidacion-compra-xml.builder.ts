import { ComprobanteDto } from '../cel/dto/comprobante.dto';
import { EmisorDto } from '../cel/dto/emisor.dto';

import { formatFechaSri } from './fecha-sri.util';
import { isCorreoValido } from './info-adicional-sri.util';
import { fNumero } from './numero-sri.util';
import { buildReembolsosXml } from './reembolso-xml.util';
import { getCodigoPorcentajeIva, CODIGO_PORCENTAJE_IVA_0, TipoImpuestoCodigo } from './tipo-impuesto-iva.util';

/** Puerto fiel de LiquidacionCompraServiceImp.getXmlLiquidacionCompra (legacy sigafi-ceo). */
export function buildLiquidacionCompraXml(comprobante: ComprobanteDto, emisor: EmisorDto): string {
  const baseTarifa0 = Number(comprobante.subtotal0 ?? 0);
  const baseGrabada = Number(comprobante.subtotal ?? 0);
  const totalSinImpuestos = baseTarifa0 + baseGrabada;
  const iva = Number(comprobante.iva ?? 0);
  const porcentajeIva = totalSinImpuestos > 0 ? (iva * 100) / totalSinImpuestos : 0;
  const descuento = Number(comprobante.totaldescuento ?? 0);

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

  let detalles = '';
  for (const detalle of comprobante.detalle ?? []) {
    const valorIva = detalle.preciototalsinimpuesto * (detalle.porcentajeiva / 100);
    detalles += `			<detalle>
				<codigoPrincipal>${detalle.codigoprincipal}</codigoPrincipal>
				<codigoAuxiliar>${detalle.codigoauxiliar ?? detalle.codigoprincipal}</codigoAuxiliar>
				<descripcion>${detalle.descripciondet}</descripcion>
				<cantidad>${fNumero(detalle.cantidad)}</cantidad>
				<precioUnitario>${fNumero(detalle.preciounitario)}</precioUnitario>
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

  let infoAdicional = '		<infoAdicional> \n';
  if (isCorreoValido(comprobante.cliente?.correo)) {
    infoAdicional += `      		<campoAdicional nombre="Email">${comprobante.cliente?.correo}</campoAdicional> \n`;
  }
  if (comprobante.cliente?.telefono) {
    infoAdicional += `      		<campoAdicional nombre="Teléfono">${comprobante.cliente.telefono}</campoAdicional> \n`;
  }
  if (comprobante.cliente?.direccion) {
    infoAdicional += `      		<campoAdicional nombre="Dirección">${comprobante.cliente.direccion}</campoAdicional> \n`;
  }
  if (comprobante.infoAdicional1) {
    infoAdicional += `      		<campoAdicional nombre="Detalle">${comprobante.infoAdicional1}</campoAdicional> \n`;
  }
  if (comprobante.infoAdicional2) {
    infoAdicional += `      		<campoAdicional nombre="Forma de Pago">${comprobante.infoAdicional2}</campoAdicional> \n`;
  }
  if (comprobante.infoAdicional3) {
    infoAdicional += `      		<campoAdicional nombre="Observación">${comprobante.infoAdicional3}</campoAdicional> \n`;
  }
  infoAdicional += '		</infoAdicional> \n';

  // Reembolso de gastos (Anexo 17 SRI): solo si la liquidación tiene líneas de reembolso.
  const { codDocReembXml, reembolsosXml } = buildReembolsosXml(comprobante.reembolsos ?? []);

  return `<?xml version="1.0" encoding="UTF-8"?>
     <liquidacionCompra id="comprobante" version="1.0.0">
		<infoTributaria>
			<ambiente>${emisor.ambiente}</ambiente>
			<tipoEmision>${comprobante.tipoemision}</tipoEmision>
			<razonSocial>${emisor.razonSocial}</razonSocial>
			<nombreComercial>${emisor.nombreComercial}</nombreComercial>
			<ruc>${emisor.ruc}</ruc>
			<claveAcceso>${comprobante.claveacceso}</claveAcceso>
			<codDoc>03</codDoc>
			<estab>${comprobante.estab}</estab>
			<ptoEmi>${comprobante.ptoemi}</ptoEmi>
			<secuencial>${comprobante.secuencial}</secuencial>
			<dirMatriz>${emisor.dirMatriz}</dirMatriz>
		</infoTributaria>
		<infoLiquidacionCompra>
			<fechaEmision>${formatFechaSri(comprobante.fechaemision)}</fechaEmision>
			<dirEstablecimiento>${emisor.dirMatriz}</dirEstablecimiento>
			<obligadoContabilidad>${emisor.obligadoContabilidad}</obligadoContabilidad>
			<tipoIdentificacionProveedor>${comprobante.cliente?.tipoIdentificacion}</tipoIdentificacionProveedor>
			<razonSocialProveedor>${comprobante.cliente?.nombreCliente}</razonSocialProveedor>
			<identificacionProveedor>${comprobante.cliente?.identificacion?.trim()}</identificacionProveedor>
			<direccionProveedor>${comprobante.cliente?.direccion ?? ''}</direccionProveedor>
			<totalSinImpuestos>${fNumero(totalSinImpuestos)}</totalSinImpuestos>
			<totalDescuento>${fNumero(descuento)}</totalDescuento>
${codDocReembXml}			<totalConImpuestos>
${subtotales}			</totalConImpuestos>
			<importeTotal>${fNumero(comprobante.importetotal)}</importeTotal>
			<moneda>DOLAR</moneda>
		</infoLiquidacionCompra>
		<detalles>
${detalles}		</detalles>
${reembolsosXml}${infoAdicional}     </liquidacionCompra>`;
}
