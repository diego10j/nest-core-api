import { Injectable, InternalServerErrorException } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';

export interface SriMensaje {
  tipo?: string;
  identificador?: string;
  mensaje?: string;
  informacionAdicional?: string;
}

export interface SriRecepcionResultado {
  estado: string;
  mensajes: SriMensaje[];
}

export interface SriAutorizacionResultado {
  estado: string;
  numeroAutorizacion?: string;
  fechaAutorizacion?: string;
  comprobanteAutorizado?: string;
  mensajes: SriMensaje[];
}

const SOAP_HEADERS = { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' };

/**
 * Cliente SOAP crudo (axios + XML string) para los web services offline del SRI.
 * Puerto de RecepcionServiceImp/AutorizacionServiceImp (legacy sigafi-ceo), que usaban
 * clientes JAX-WS generados desde el mismo WSDL. La URL configurada en sri_emisor
 * (wsdl_recep_offline_sremi / wsdl_autori_offline_sremi) es también la URL de invocación SOAP.
 */
@Injectable()
export class SriSoapClientService {
  /** Envía el XML firmado (comprobante) al servicio de Recepción del SRI. */
  async enviarRecepcion(xmlFirmado: string, wsdlUrl: string, timeoutSeconds = 30): Promise<SriRecepcionResultado> {
    const xmlBase64 = Buffer.from(xmlFirmado, 'utf-8').toString('base64');
    const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="http://ec.gob.sri.ws.recepcion">
   <soapenv:Header/>
   <soapenv:Body>
      <ec:validarComprobante>
         <xml>${xmlBase64}</xml>
      </ec:validarComprobante>
   </soapenv:Body>
</soapenv:Envelope>`;

    const responseXml = await this.post(wsdlUrl, envelope, timeoutSeconds);
    const $ = cheerio.load(stripNamespacePrefixes(responseXml), { xml: true });

    // Estructura oficial (Ficha Técnica SRI, sección 7.2.3): <RespuestaRecepcionComprobante><estado>...
    const estado = $('RespuestaRecepcionComprobante > estado').first().text().trim() || $('estado').first().text().trim();
    const mensajes: SriMensaje[] = [];
    $('comprobantes > comprobante > mensajes > mensaje').each((_, el) => {
      const $m = $(el);
      mensajes.push({
        tipo: $m.children('tipo').text().trim() || undefined,
        identificador: $m.children('identificador').text().trim() || undefined,
        mensaje: $m.children('mensaje').text().trim() || undefined,
        informacionAdicional: $m.children('informacionAdicional').text().trim() || undefined,
      });
    });

    return { estado, mensajes };
  }

  /** Consulta el estado de autorización de un comprobante ya recibido por el SRI. */
  async consultarAutorizacion(claveAcceso: string, wsdlUrl: string, timeoutSeconds = 30): Promise<SriAutorizacionResultado> {
    const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="http://ec.gob.sri.ws.autorizacion">
   <soapenv:Header/>
   <soapenv:Body>
      <ec:autorizacionComprobante>
         <claveAccesoComprobante>${claveAcceso}</claveAccesoComprobante>
      </ec:autorizacionComprobante>
   </soapenv:Body>
</soapenv:Envelope>`;

    const responseXml = await this.post(wsdlUrl, envelope, timeoutSeconds);
    const $ = cheerio.load(stripNamespacePrefixes(responseXml), { xml: true });

    const $autorizacion = $('autorizaciones > autorizacion').first();
    const mensajes: SriMensaje[] = [];
    $autorizacion.find('> mensajes > mensaje').each((_, el) => {
      const $m = $(el);
      mensajes.push({
        tipo: $m.children('tipo').text().trim() || undefined,
        identificador: $m.children('identificador').text().trim() || undefined,
        mensaje: $m.children('mensaje').text().trim() || undefined,
        informacionAdicional: $m.children('informacionAdicional').text().trim() || undefined,
      });
    });

    return {
      estado: $autorizacion.children('estado').first().text().trim(),
      numeroAutorizacion: $autorizacion.children('numeroAutorizacion').first().text().trim() || undefined,
      fechaAutorizacion: $autorizacion.children('fechaAutorizacion').first().text().trim() || undefined,
      comprobanteAutorizado: $autorizacion.children('comprobante').first().text().trim() || undefined,
      mensajes,
    };
  }

  private async post(url: string, envelope: string, timeoutSeconds: number): Promise<string> {
    try {
      const { data } = await axios.post<string>(url, envelope, {
        headers: SOAP_HEADERS,
        timeout: timeoutSeconds * 1000,
        responseType: 'text',
        transformResponse: (res) => res, // conservar XML crudo
      });
      return data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new InternalServerErrorException(`Error de comunicación con el servicio web del SRI (${url}): ${msg}`);
    }
  }
}

/** Quita prefijos de namespace (ns2:tag -> tag) para poder seleccionar por nombre local con cheerio. */
function stripNamespacePrefixes(xml: string): string {
  return xml.replace(/<(\/?)([a-zA-Z0-9]+):/g, '<$1');
}
