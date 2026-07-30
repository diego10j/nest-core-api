import { BadRequestException, Injectable } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { UpdateQuery } from 'src/core/connection/helpers';

import { BaseService } from '../../../../common/base-service';
import { DataSourceService } from '../../../connection/datasource.service';
import { ComprobantesElecService } from '../cel/comprobantes-elec.service';
import { ComprobanteDto } from '../cel/dto/comprobante.dto';
import { EmisorDto } from '../cel/dto/emisor.dto';
import { EmisorService } from '../cel/emisor.service';
import { EstadoComprobanteEnum } from '../cel/enum/estado-comprobante.enum';
import { FirmaXmlService } from '../firma/firma-xml.service';
import { SriMensaje, SriSoapClientService } from '../soap/sri-soap-client.service';
import { buildFacturaXml } from '../xml/factura-xml.builder';
import { buildGuiaRemisionXml } from '../xml/guia-remision-xml.builder';
import { buildLiquidacionCompraXml } from '../xml/liquidacion-compra-xml.builder';
import { buildNotaCreditoXml } from '../xml/nota-credito-xml.builder';
import { buildRetencionXml } from '../xml/retencion-xml.builder';

import { ComprobanteAutorizadoEmitter } from './comprobante-autorizado.emitter';
import { SriXmlComprobanteService } from './sri-xml-comprobante.service';

type HeaderQueryDto = QueryOptionsDto & HeaderParamsDto;

const XML_BUILDER_BY_CODDOC: Record<string, (c: ComprobanteDto, e: EmisorDto) => string> = {
  '01': buildFacturaXml,
  '04': buildNotaCreditoXml,
  '07': buildRetencionXml,
  '06': buildGuiaRemisionXml,
  '03': buildLiquidacionCompraXml,
};

/**
 * Orquesta el envío de un comprobante electrónico al SRI: firma -> recepción -> autorización,
 * persistiendo el historial en sri_xml_comprobante y el estado en sri_comprobante.
 * Puerto de ComprobanteServiceImp/RecepcionServiceImp/AutorizacionServiceImp (legacy sigafi-ceo).
 *
 * Simplificaciones intencionales respecto al legacy (ver plan de migración):
 *  - No se porta la regeneración de clave de acceso por "más de 59 minutos": esa lógica estaba
 *    deshabilitada en el legacy (claveTieneMasDe59Minutos siempre retornaba false).
 *  - No se porta el encadenamiento automático factura->guía de remisión: el módulo de guías de
 *    remisión de ventas aún no existe en nest-core-api (no hay cabecera sri_comprobante que encadenar).
 */
@Injectable()
export class ComprobanteEnvioService extends BaseService {
  constructor(
    private readonly dataSource: DataSourceService,
    private readonly comprobantesElecService: ComprobantesElecService,
    private readonly emisorService: EmisorService,
    private readonly firmaXmlService: FirmaXmlService,
    private readonly soapClient: SriSoapClientService,
    private readonly xmlComprobanteService: SriXmlComprobanteService,
    private readonly autorizadoEmitter: ComprobanteAutorizadoEmitter,
  ) {
    super();
  }

  /** Firma y envía a Recepción del SRI un comprobante en estado PENDIENTE. */
  async enviarRecepcion(claveAcceso: string, dtoIn: HeaderQueryDto): Promise<void> {
    const comprobante = await this.comprobantesElecService.getComprobantePorClaveAcceso({ ...dtoIn, claveAcceso });
    const emisor = await this.emisorService.getEmisor(dtoIn);

    const buildXml = XML_BUILDER_BY_CODDOC[comprobante.coddoc];
    if (!buildXml) {
      throw new BadRequestException(`Tipo de comprobante no soportado: ${comprobante.coddoc}`);
    }
    const xml = reemplazarCaracteresEspeciales(buildXml(comprobante, emisor));
    const xmlFirmado = await this.firmaXmlService.firmarXml(xml, comprobante.coddoc, dtoIn);

    const resultado = await this.soapClient.enviarRecepcion(
      xmlFirmado,
      emisor.wsdlRecepcion,
      emisor.tiempoMaxEspera ?? 30,
    );
    const mensajesTexto = formatMensajesRecepcion(resultado.mensajes);
    // Códigos 70 ("Clave de acceso en procesamiento") y 43 ("Clave ya registrada") según
    // Ficha Técnica SRI sección 11: se matchea por identificador de mensaje, no por texto
    // (el legacy comparaba el texto completo en mayúsculas, frágil ante cambios de wording).
    const tieneMensaje = (identificador: string) => resultado.mensajes.some((m) => m.identificador === identificador);

    let nuevoEstado: number;
    if (tieneMensaje('70')) {
      nuevoEstado = EstadoComprobanteEnum.PENDIENTE.codigo;
    } else if (tieneMensaje('43')) {
      nuevoEstado = EstadoComprobanteEnum.RECIBIDA.codigo;
    } else {
      nuevoEstado = EstadoComprobanteEnum.getCodigo(resultado.estado) ?? EstadoComprobanteEnum.DEVUELTA.codigo;
    }

    await this.actualizarEstado(comprobante.codigocomprobante, nuevoEstado);
    await this.guardarHistorialXml(comprobante.codigocomprobante, nuevoEstado, xmlFirmado, mensajesTexto, undefined, dtoIn);
  }

  /** Consulta el estado de Autorización del SRI para un comprobante ya RECIBIDA. */
  async enviarAutorizacion(claveAcceso: string, dtoIn: HeaderQueryDto): Promise<void> {
    const comprobante = await this.comprobantesElecService.getComprobantePorClaveAcceso({ ...dtoIn, claveAcceso });
    const emisor = await this.emisorService.getEmisor(dtoIn);

    const resultado = await this.soapClient.consultarAutorizacion(
      claveAcceso,
      emisor.wsdlAutorizacion,
      emisor.tiempoMaxEspera ?? 30,
    );
    const mensajesTexto = formatMensajesAutorizacion(resultado.mensajes);
    const nuevoEstado = EstadoComprobanteEnum.getCodigo(resultado.estado) ?? comprobante.codigoestado ?? EstadoComprobanteEnum.DEVUELTA.codigo;

    if (resultado.estado === EstadoComprobanteEnum.AUTORIZADO.descripcion) {
      await this.actualizarAutorizado(
        comprobante.codigocomprobante,
        nuevoEstado,
        resultado.numeroAutorizacion,
        resultado.fechaAutorizacion,
      );
      const xmlAutorizacion = buildXmlAutorizacion(resultado, emisor.ambiente);
      await this.guardarHistorialXml(comprobante.codigocomprobante, nuevoEstado, xmlAutorizacion, undefined, mensajesTexto, dtoIn);
      // Notifica para que quien esté interesado (envío de correo con PDF+XML) reaccione,
      // sin acoplar este módulo a reportes/correo (ver ComprobanteAutorizadoEmitter).
      // Se adjunta el envoltorio de autorización completo (estado/numeroAutorizacion/
      // fechaAutorizacion/ambiente + comprobante), no solo el comprobante firmado: es el
      // mismo XML que el SRI entrega como "autorizado" y el que se guarda en el historial.
      this.autorizadoEmitter.emitAutorizado({
        ideSrcom: comprobante.codigocomprobante,
        claveAcceso,
        coddoc: comprobante.coddoc,
        xmlAutorizado: xmlAutorizacion,
        dtoIn,
      });
    } else {
      await this.actualizarEstado(comprobante.codigocomprobante, nuevoEstado);
      await this.guardarHistorialXml(
        comprobante.codigocomprobante,
        nuevoEstado,
        resultado.comprobanteAutorizado,
        undefined,
        mensajesTexto,
        dtoIn,
      );
    }
  }

  /** Flujo completo: si está PENDIENTE la firma y envía, si queda RECIBIDA consulta autorización. */
  async enviarComprobante(claveAcceso: string, dtoIn: HeaderQueryDto): Promise<void> {
    let comprobante = await this.comprobantesElecService.getComprobantePorClaveAcceso({ ...dtoIn, claveAcceso });

    if (comprobante.codigoestado === EstadoComprobanteEnum.PENDIENTE.codigo) {
      await this.enviarRecepcion(claveAcceso, dtoIn);
      comprobante = await this.comprobantesElecService.getComprobantePorClaveAcceso({ ...dtoIn, claveAcceso });
      if (comprobante.codigoestado !== EstadoComprobanteEnum.RECIBIDA.codigo) {
        throw new BadRequestException(`El comprobante ${claveAcceso} no pudo ser enviado al SRI`);
      }
    }

    if (comprobante.codigoestado === EstadoComprobanteEnum.RECIBIDA.codigo) {
      await this.enviarAutorizacion(claveAcceso, dtoIn);
      comprobante = await this.comprobantesElecService.getComprobantePorClaveAcceso({ ...dtoIn, claveAcceso });
      if (comprobante.codigoestado !== EstadoComprobanteEnum.AUTORIZADO.codigo) {
        throw new BadRequestException(`El comprobante ${claveAcceso} no pudo ser autorizado por el SRI`);
      }
    }
  }

  private async actualizarEstado(ideSrcom: number, estado: number): Promise<void> {
    const upd = new UpdateQuery('sri_comprobante', 'ide_srcom');
    upd.values.set('ide_sresc', estado);
    upd.where = `ide_srcom = ${ideSrcom}`;
    await this.dataSource.createQuery(upd);
  }

  private async actualizarAutorizado(
    ideSrcom: number,
    estado: number,
    numeroAutorizacion: string | undefined,
    fechaAutorizacion: string | undefined,
  ): Promise<void> {
    const upd = new UpdateQuery('sri_comprobante', 'ide_srcom');
    upd.values.set('ide_sresc', estado);
    upd.values.set('autorizacion_srcomn', numeroAutorizacion ?? null);
    upd.values.set('fechaautoriza_srcom', fechaAutorizacion ?? null);
    upd.where = `ide_srcom = ${ideSrcom}`;
    await this.dataSource.createQuery(upd);
  }

  private async guardarHistorialXml(
    ideSrcom: number,
    estado: number,
    xml: string | undefined,
    mensajeRecepcion: string | undefined,
    mensajeAutorizacion: string | undefined,
    dtoIn: HeaderQueryDto,
  ): Promise<void> {
    const anterior = await this.xmlComprobanteService.getUltimo(ideSrcom, dtoIn);
    await this.xmlComprobanteService.guardar({
      ideSrxmc: anterior?.ideSrxmc,
      ideSrcom,
      codigoEstado: estado,
      xmlComprobante: xml ?? anterior?.xmlComprobante,
      mensajeRecepcion: mensajeRecepcion ?? anterior?.mensajeRecepcion,
      mensajeAutorizacion: mensajeAutorizacion ?? anterior?.mensajeAutorizacion,
    });
  }
}

function formatMensajesRecepcion(mensajes: SriMensaje[]): string {
  return mensajes
    .map((m) => `${m.tipo}.${m.identificador} ${m.mensaje}: ${m.informacionAdicional}`)
    .join(' \n');
}

function formatMensajesAutorizacion(mensajes: SriMensaje[]): string {
  return mensajes
    .map((m) =>
      m.informacionAdicional
        ? `${m.tipo}.${m.identificador} ${m.mensaje}: ${m.informacionAdicional}`
        : `${m.tipo}.${m.identificador} ${m.mensaje}`,
    )
    .join(' \n');
}

/** Envoltorio informativo del resultado de autorización, paridad con AutorizacionServiceImp (stb_xml). */
function buildXmlAutorizacion(
  resultado: { estado: string; numeroAutorizacion?: string; fechaAutorizacion?: string; comprobanteAutorizado?: string },
  ambiente: number,
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<autorizacion>
<estado>${resultado.estado}</estado>
<numeroAutorizacion>${resultado.numeroAutorizacion ?? ''}</numeroAutorizacion>
<fechaAutorizacion>${resultado.fechaAutorizacion ?? ''}</fechaAutorizacion>
<ambiente>${ambiente === 2 ? 'PRODUCCIÓN' : 'PRUEBAS'}</ambiente>
<comprobante><![CDATA[${resultado.comprobanteAutorizado ?? ''}]]></comprobante>
</autorizacion>`;
}

/** Puerto de UtilitarioCeo.reemplazarCaracteresEspeciales: SRI exige XML sin tildes/ñ en el ambiente offline. */
function reemplazarCaracteresEspeciales(xml: string): string {
  return xml
    .replace(/Ñ/g, 'N')
    .replace(/ñ/g, 'n')
    .replace(/Á/g, 'A')
    .replace(/á/g, 'a')
    .replace(/É/g, 'E')
    .replace(/é/g, 'e')
    .replace(/Í/g, 'I')
    .replace(/í/g, 'i')
    .replace(/Ó/g, 'O')
    .replace(/ó/g, 'o')
    .replace(/Ú/g, 'U')
    .replace(/ú/g, 'u')
    .replace(/&/g, '');
}
