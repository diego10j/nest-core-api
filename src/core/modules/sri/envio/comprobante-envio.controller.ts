import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { Auth } from 'src/core/auth';

import { ClaveAccesoDto } from '../cel/dto/clave-acceso.dto';
import { EstadoComprobanteEnum } from '../cel/enum/estado-comprobante.enum';

import { ComprobanteEnvioService } from './comprobante-envio.service';
import { SriEnvioQueueService } from './sri-envio-queue.service';
import { SriXmlComprobanteService } from './sri-xml-comprobante.service';

@ApiTags('SRI-ComprobanteEnvio')
@Controller('sri/envio')
export class ComprobanteEnvioController {
  constructor(
    private readonly queueService: SriEnvioQueueService,
    private readonly xmlComprobanteService: SriXmlComprobanteService,
    private readonly comprobanteEnvioService: ComprobanteEnvioService,
  ) { }

  /**
   * Punto de entrada bajo demanda para enviar un comprobante al SRI EN SEGUNDO PLANO: recibe
   * la clave de acceso, la encola y responde de inmediato sin esperar el resultado (firma +
   * recepción + autorización ocurren después, fuera de esta petición). Pensado para flujos
   * donde no se necesita el resultado inmediato en pantalla (ej. reintentos automáticos a
   * futuro). Para mostrar el resultado real en la UI en el momento, usar enviarSRISincrono.
   * El guardado del comprobante NUNCA encola automáticamente — uno de estos dos métodos debe
   * llamarse explícitamente cuando se quiere autorizar. Al autorizarse, el envío por correo
   * (PDF+XML) se dispara solo para Factura/Nota de Crédito/Liquidación de Compra (ver
   * ComprobanteAutorizadoEmitter / ComprobanteEmailListener) — en ambos métodos, siempre en
   * segundo plano, nunca bloquea la respuesta.
   */
  @Post('enviarSRI')
  @ApiOperation({ summary: 'Encolar el envío de un comprobante al SRI en segundo plano (no espera el resultado)' })
  @Auth()
  enviarSRI(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: ClaveAccesoDto) {
    this.queueService.encolar(dtoIn.claveAcceso, { ...headersParams, ...dtoIn });
    return { message: 'ok', claveAcceso: dtoIn.claveAcceso, encolado: true };
  }

  /**
   * Envía un comprobante al SRI de forma SÍNCRONA: firma + recepción + autorización dentro
   * de esta misma petición, esperando la respuesta final para poder mostrarla en pantalla
   * (autorizado, devuelto, rechazado, etc. — con el mensaje del SRI si no fue autorizado).
   * Es el método que usa el botón "Enviar al SRI" del frontend. El envío del correo de
   * notificación, si queda autorizado, sigue disparándose en segundo plano (no bloquea esta
   * respuesta) — ver ComprobanteEnvioService.enviarComprobanteSincrono.
   */
  @Post('enviarSRISincrono')
  @ApiOperation({ summary: 'Enviar un comprobante al SRI y esperar el resultado final (firma + recepción + autorización)' })
  @Auth()
  enviarSRISincrono(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: ClaveAccesoDto) {
    return this.comprobanteEnvioService.enviarComprobanteSincrono(dtoIn.claveAcceso, { ...headersParams, ...dtoIn });
  }

  /**
   * Reinicia manualmente a PENDIENTE un comprobante que quedó DEVUELTO/RECHAZADO/NO AUTORIZADO,
   * para poder reintentar el envío desde cero (ver ComprobanteEnvioService.reiniciarPendiente).
   * Rechaza el reinicio si el comprobante ya está AUTORIZADO.
   */
  @Post('reiniciarPendiente')
  @ApiOperation({ summary: 'Reiniciar a PENDIENTE un comprobante no autorizado, para poder reenviarlo al SRI' })
  @Auth()
  reiniciarPendiente(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: ClaveAccesoDto) {
    return this.comprobanteEnvioService.reiniciarPendiente(dtoIn.claveAcceso, { ...headersParams, ...dtoIn });
  }

  /**
   * Devuelve el último XML guardado para un comprobante (firmado o autorizado), junto con
   * su estado y, si no está AUTORIZADO (ej. DEVUELTA/RECHAZADO), el mensaje de recepción
   * y/o autorización que explica el motivo — vienen en la misma fila del historial.
   */
  @Get('verXml')
  @ApiOperation({ summary: 'Obtener el XML, estado y mensajes de recepción/autorización de un comprobante por clave de acceso' })
  @Auth()
  async verXml(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: ClaveAccesoDto) {
    const historial = await this.xmlComprobanteService.getXmlPorClaveAcceso(dtoIn.claveAcceso, { ...headersParams, ...dtoIn });
    if (!historial?.xmlComprobante) {
      throw new BadRequestException(`No existe XML guardado para el comprobante con clave de acceso ${dtoIn.claveAcceso}`);
    }
    return {
      claveAcceso: dtoIn.claveAcceso,
      xml: historial.xmlComprobante,
      codigoEstado: historial.codigoEstado,
      nombreEstado: EstadoComprobanteEnum.getDescripcion(historial.codigoEstado),
      autorizado: historial.codigoEstado === EstadoComprobanteEnum.AUTORIZADO.codigo,
      mensajeRecepcion: historial.mensajeRecepcion,
      mensajeAutorizacion: historial.mensajeAutorizacion,
    };
  }
}
