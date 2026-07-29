import { ComprobanteDto } from '../cel/dto/comprobante.dto';
import { EmisorDto } from '../cel/dto/emisor.dto';

import { formatFechaSri } from './fecha-sri.util';
import { isCorreoValido } from './info-adicional-sri.util';
import { fNumero } from './numero-sri.util';

const CORREO_POR_DEFECTO = 'ventas@produquimic.com.ec';

/** Puerto fiel de RetencionServiceImp.getXmlRetencion (legacy sigafi-ceo). */
export function buildRetencionXml(comprobante: ComprobanteDto, emisor: EmisorDto): string {
  const agenteRetencion = comprobante.agenteRetencion ? `      		<agenteRetencion>1</agenteRetencion> \n` : '';

  let impuestos = '';
  for (const impuesto of comprobante.impuesto ?? []) {
    impuestos += `					<impuesto>
						<codigo>${impuesto.codigo}</codigo>
						<codigoRetencion>${impuesto.codigoRetencion}</codigoRetencion>
						<baseImponible>${fNumero(impuesto.baseImponible)}</baseImponible>
						<porcentajeRetener>${fNumero(impuesto.porcentajeRetener)}</porcentajeRetener>
						<valorRetenido>${fNumero(impuesto.valorRetenido)}</valorRetenido>
						<codDocSustento>${impuesto.codDocSustento}</codDocSustento>
						<numDocSustento>${impuesto.numDocSustento}</numDocSustento>
						<fechaEmisionDocSustento>${formatFechaSri(impuesto.fechaEmisionDocSustento)}</fechaEmisionDocSustento>
					</impuesto>
`;
  }

  let infoAdicional = '		<infoAdicional> \n';
  infoAdicional += `      		<campoAdicional nombre="EMAIL">${isCorreoValido(comprobante.correo) ? comprobante.correo : CORREO_POR_DEFECTO}</campoAdicional> \n`;
  if (comprobante.cliente?.telefono) {
    infoAdicional += `      		<campoAdicional nombre="TELEFONO">${comprobante.cliente.telefono}</campoAdicional> \n`;
  }
  if (comprobante.cliente?.direccion) {
    infoAdicional += `      		<campoAdicional nombre="DIRECCION">${comprobante.cliente.direccion}</campoAdicional> \n`;
  }
  if (comprobante.agenteRetencion) {
    infoAdicional += `      		<campoAdicional nombre="AGENTE DE RETENCION">${comprobante.agenteRetencion}</campoAdicional> \n`;
  }
  infoAdicional += '		</infoAdicional> \n';

  return `<?xml version="1.0" encoding="UTF-8"?>
     <comprobanteRetencion id="comprobante" version="1.0.0">
		<infoTributaria>
			<ambiente>${emisor.ambiente}</ambiente>
			<tipoEmision>${comprobante.tipoemision}</tipoEmision>
			<razonSocial>${emisor.razonSocial}</razonSocial>
			<nombreComercial>${emisor.nombreComercial}</nombreComercial>
			<ruc>${emisor.ruc}</ruc>
			<claveAcceso>${comprobante.claveacceso}</claveAcceso>
			<codDoc>07</codDoc>
			<estab>${comprobante.estab}</estab>
			<ptoEmi>${comprobante.ptoemi}</ptoEmi>
			<secuencial>${comprobante.secuencial}</secuencial>
			<dirMatriz>${emisor.dirMatriz}</dirMatriz>
${agenteRetencion}		</infoTributaria>
		<infoCompRetencion>
			<fechaEmision>${formatFechaSri(comprobante.fechaemision)}</fechaEmision>
			<dirEstablecimiento>${comprobante.direstablecimiento ?? emisor.dirMatriz}</dirEstablecimiento>
			<obligadoContabilidad>${emisor.obligadoContabilidad}</obligadoContabilidad>
			<tipoIdentificacionSujetoRetenido>${comprobante.cliente?.tipoIdentificacion}</tipoIdentificacionSujetoRetenido>
			<razonSocialSujetoRetenido>${comprobante.cliente?.nombreCliente}</razonSocialSujetoRetenido>
			<identificacionSujetoRetenido>${comprobante.cliente?.identificacion?.trim()}</identificacionSujetoRetenido>
			<periodoFiscal>${comprobante.periodofiscal}</periodoFiscal>
		</infoCompRetencion>
		<impuestos>
${impuestos}		</impuestos>
${infoAdicional}     </comprobanteRetencion>`;
}
