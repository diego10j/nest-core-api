import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { Auth } from 'src/core/auth';

import { ClaveAccesoDto } from '../cel/dto/clave-acceso.dto';

import { SriEnvioQueueService } from './sri-envio-queue.service';
import { SriXmlComprobanteService } from './sri-xml-comprobante.service';

@ApiTags('SRI-ComprobanteEnvio')
@Controller('sri/envio')
export class ComprobanteEnvioController {
  constructor(
    private readonly queueService: SriEnvioQueueService,
    private readonly xmlComprobanteService: SriXmlComprobanteService,
  ) { }

  /**
   * Punto de entrada bajo demanda para enviar un comprobante al SRI: recibe la clave de
   * acceso y la encola (firma + recepción + autorización en segundo plano, sin bloquear
   * la respuesta HTTP). El guardado del comprobante NUNCA encola automáticamente — es este
   * método el que se llama explícitamente cuando se quiere autorizar. Al autorizarse, el
   * envío por correo (PDF+XML) se dispara solo para Factura/Nota de Crédito/Liquidación de
   * Compra (ver ComprobanteAutorizadoEmitter / ComprobanteEmailListener).
   */
  @Post('enviarSRI')
  @ApiOperation({ summary: 'Encolar el envío de un comprobante al SRI por clave de acceso (firma + recepción + autorización + correo)' })
  @Auth()
  enviarSRI(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: ClaveAccesoDto) {
    this.queueService.encolar(dtoIn.claveAcceso, { ...headersParams, ...dtoIn });
    return { message: 'ok', claveAcceso: dtoIn.claveAcceso, encolado: true };
  }

  /** Devuelve el último XML (firmado o autorizado) guardado para un comprobante, por clave de acceso. */
  @Get('verXml')
  @ApiOperation({ summary: 'Obtener el XML (firmado o autorizado) de un comprobante por clave de acceso' })
  @Auth()
  async verXml(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: ClaveAccesoDto) {
    const xml = await this.xmlComprobanteService.getXmlPorClaveAcceso(dtoIn.claveAcceso, { ...headersParams, ...dtoIn });
    if (!xml) {
      throw new BadRequestException(`No existe XML guardado para el comprobante con clave de acceso ${dtoIn.claveAcceso}`);
    }
    return { claveAcceso: dtoIn.claveAcceso, xml };
  }
}
