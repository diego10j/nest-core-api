import { ComprobanteDto } from '../cel/dto/comprobante.dto';
import { EmisorDto } from '../cel/dto/emisor.dto';

import { formatFechaSri } from './fecha-sri.util';
import { isCorreoValido } from './info-adicional-sri.util';
import { fNumero } from './numero-sri.util';

const CORREO_POR_DEFECTO = 'nodispone@produquimic.com.ec';

/**
 * Puerto fiel de GuiaRemisionServiceImp.getXmlGuiaRemision (legacy sigafi-ceo).
 * Nota: el legacy tenía un bug donde TELEFONO/DIRECCION del destinatario tomaban el valor
 * del cliente en vez del propio destinatario; aquí se usa el valor correcto del destinatario
 * (no hay caller de este builder aún en nest-core-api, así que no hay comportamiento en
 * producción que replicar con el bug incluido).
 */
export function buildGuiaRemisionXml(comprobante: ComprobanteDto, emisor: EmisorDto): string {
  const destinatario = comprobante.destinatario;
  const agenteRetencion = comprobante.agenteRetencion ? `<agenteRetencion>1</agenteRetencion> \n` : '';

  let detalles = '';
  for (const detalle of comprobante.detalle ?? []) {
    detalles += `                                <detalle>
                                       <codigoInterno>${detalle.codigoprincipal}</codigoInterno>
                                       <codigoAdicional>${detalle.codigoauxiliar ?? detalle.codigoprincipal}</codigoAdicional>
                                       <descripcion>${detalle.descripciondet}</descripcion>
                                       <cantidad>${fNumero(detalle.cantidad, 2)}</cantidad>
                               </detalle>
`;
  }

  let infoAdicional = '		<infoAdicional> \n';
  infoAdicional += `      		<campoAdicional nombre="EMAIL">${isCorreoValido(destinatario?.correo) ? destinatario?.correo : CORREO_POR_DEFECTO}</campoAdicional> \n`;
  if (destinatario?.telefono) {
    infoAdicional += `      		<campoAdicional nombre="TELEFONO">${destinatario.telefono}</campoAdicional> \n`;
  }
  if (destinatario?.dirDestinatario) {
    infoAdicional += `      		<campoAdicional nombre="DIRECCION">${destinatario.dirDestinatario}</campoAdicional> \n`;
  }
  if (comprobante.numOrdenCompra) {
    infoAdicional += `      		<campoAdicional nombre="ORDEN DE COMPRA">${comprobante.numOrdenCompra}</campoAdicional> \n`;
  }
  if (comprobante.agenteRetencion) {
    infoAdicional += `      		<campoAdicional nombre="AGENTE DE RETENCION">${comprobante.agenteRetencion}</campoAdicional> \n`;
  }
  infoAdicional += '		</infoAdicional> \n';

  return `<?xml version="1.0" encoding="UTF-8"?>
     <guiaRemision id="comprobante" version="1.0.0">
		<infoTributaria>
			<ambiente>${emisor.ambiente}</ambiente>
			<tipoEmision>${comprobante.tipoemision}</tipoEmision>
			<razonSocial>${emisor.razonSocial}</razonSocial>
			<nombreComercial>${emisor.nombreComercial}</nombreComercial>
			<ruc>${emisor.ruc}</ruc>
			<claveAcceso>${comprobante.claveacceso}</claveAcceso>
			<codDoc>06</codDoc>
			<estab>${comprobante.estab}</estab>
			<ptoEmi>${comprobante.ptoemi}</ptoEmi>
			<secuencial>${comprobante.secuencial}</secuencial>
			<dirMatriz>${emisor.dirMatriz}</dirMatriz>
${agenteRetencion}		</infoTributaria>
		<infoGuiaRemision>
			<dirEstablecimiento>${emisor.dirMatriz}</dirEstablecimiento>
			<dirPartida>${comprobante.dirPartida ?? ''}</dirPartida>
			<razonSocialTransportista>${comprobante.cliente?.nombreCliente}</razonSocialTransportista>
			<tipoIdentificacionTransportista>${comprobante.cliente?.tipoIdentificacion}</tipoIdentificacionTransportista>
			<rucTransportista>${comprobante.cliente?.identificacion?.trim()}</rucTransportista>
			<obligadoContabilidad>${emisor.obligadoContabilidad}</obligadoContabilidad>
			<fechaIniTransporte>${formatFechaSri(comprobante.fechaIniTransporte)}</fechaIniTransporte>
			<fechaFinTransporte>${formatFechaSri(comprobante.fechaFinTransporte)}</fechaFinTransporte>
			<placa>${comprobante.placa ?? ''}</placa>
		</infoGuiaRemision>
		<destinatarios>
                   <destinatario>
                           <identificacionDestinatario>${destinatario?.identificacionDestinatario}</identificacionDestinatario>
                           <razonSocialDestinatario>${destinatario?.razonSocialDestinatario}</razonSocialDestinatario>
                           <dirDestinatario>${destinatario?.dirDestinatario}</dirDestinatario>
                           <motivoTraslado>${destinatario?.motivoTraslado}</motivoTraslado>
                           <docAduaneroUnico>${destinatario?.docAduaneroUnico ?? '000'}</docAduaneroUnico>
                           <codEstabDestino>${destinatario?.codEstabDestino}</codEstabDestino>
                           <ruta>${destinatario?.ruta ?? 'RUTA'}</ruta>
                           <codDocSustento>${destinatario?.codDocSustento}</codDocSustento>
                           <numDocSustento>${destinatario?.numDocSustento}</numDocSustento>
                           <numAutDocSustento>${destinatario?.numAutDocSustento}</numAutDocSustento>
                           <fechaEmisionDocSustento>${formatFechaSri(destinatario?.fechaEmisionDocSustento)}</fechaEmisionDocSustento>
                           <detalles>
${detalles}                            </detalles>
                    </destinatario>
		</destinatarios>
${infoAdicional}     </guiaRemision>`;
}
