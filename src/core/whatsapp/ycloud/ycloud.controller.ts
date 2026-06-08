import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

import { EnviarCampaniaDto } from '../dto/enviar-campania.dto';
import { SaveCampaniaDto } from '../dto/save-campania.dto';

import { SendDocumentDto } from './dto/send-document.dto';
import { SendMediaDto } from './dto/send-media.dto';
import { SendTemplateDto } from './dto/send-template.dto';
import { SendTextDto } from './dto/send-text.dto';
import { YcloudMetricsQueryDto } from './dto/ycloud-metrics-query.dto';
import { YcloudCampaniaService } from './ycloud-camp.service';
import { YcloudMetricsService } from './ycloud-metrics.service';
import { YcloudWindowService } from './ycloud-window.service';
import { YcloudService } from './ycloud.service';

@ApiTags('WhatsApp-YCloud')
@Controller('whatsapp/ycloud')
export class YcloudController {
  constructor(
    private readonly ycloudService: YcloudService,
    private readonly ycloudCampService: YcloudCampaniaService,
    private readonly windowService: YcloudWindowService,
    private readonly metricsService: YcloudMetricsService,
  ) {}

  @Post('send-text')
  @ApiOperation({ summary: 'Enviar mensaje de texto (valida ventana 24h)' })
  async sendText(
    @AppHeaders() h: HeaderParamsDto,
    @Body() dto: SendTextDto,
  ): Promise<{ messageId: string }> {
    return this.ycloudService.sendText(h.ideEmpr, dto.telefono, dto.body, h.ideUsua);
  }

  @Post('send-template')
  @ApiOperation({ summary: 'Enviar plantilla (sin restriccion de ventana 24h)' })
  async sendTemplate(
    @AppHeaders() h: HeaderParamsDto,
    @Body() dto: SendTemplateDto,
  ): Promise<{ messageId: string }> {
    return this.ycloudService.sendTemplate(
      h.ideEmpr,
      dto.telefono,
      dto.name,
      dto.language,
      dto.components,
      h.ideUsua,
    );
  }

  @Post('send-media')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  @ApiOperation({ summary: 'Enviar imagen, audio o video' })
  async sendMedia(
    @AppHeaders() h: HeaderParamsDto,
    @Body() dto: SendMediaDto,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ messageId: string }> {
    let mediaId = dto.mediaId;
    if (!mediaId && file) {
      const upload = await this.ycloudService.uploadMedia(
        h.ideEmpr,
        file.buffer,
        file.mimetype,
        file.originalname,
      );
      mediaId = upload.mediaId;
    }

    if (dto.mediaType === 'image') {
      return this.ycloudService.sendImage(h.ideEmpr, dto.telefono, mediaId, dto.caption, h.ideUsua);
    }
    if (dto.mediaType === 'video') {
      return this.ycloudService.sendVideo(h.ideEmpr, dto.telefono, mediaId, dto.caption, h.ideUsua);
    }
    throw new Error('Tipo de media no soportado');
  }

  @Post('send-document')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  @ApiOperation({ summary: 'Enviar documento (PDF, Excel, Word, etc.)' })
  async sendDocument(
    @AppHeaders() h: HeaderParamsDto,
    @Body() dto: SendDocumentDto,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ messageId: string }> {
    let mediaId = dto.mediaId;
    if (!mediaId && file) {
      const upload = await this.ycloudService.uploadMedia(
        h.ideEmpr,
        file.buffer,
        file.mimetype,
        file.originalname,
      );
      mediaId = upload.mediaId;
    }

    return this.ycloudService.sendDocument(
      h.ideEmpr,
      dto.telefono,
      mediaId,
      dto.filename || file?.originalname || 'document',
      dto.caption,
      h.ideUsua,
    );
  }

  @Get('check-window')
  @ApiOperation({ summary: 'Verificar si se puede responder sin plantilla (ventana 24h)' })
  async checkWindow(
    @AppHeaders() h: HeaderParamsDto,
    @Query('wa_id') waId: string,
    @Query('phone_number_id') phoneNumberId: string,
  ) {
    const config = await this.ycloudService.getConfig(h.ideEmpr);
    return this.windowService.canSendFreeMessage(
      phoneNumberId || config.phoneNumberId,
      waId,
    );
  }

  @Post('assign-agent')
  @ApiOperation({ summary: 'Asignar agente a una conversacion' })
  async assignAgent(
    @AppHeaders() h: HeaderParamsDto,
    @Body() body: { waId: string; phoneNumberId: string; ideUsua: number },
  ) {
    await this.windowService.assignAgent(body.waId, body.phoneNumberId, body.ideUsua);
    return { message: 'ok' };
  }

  @Post('upload-media')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  @ApiOperation({ summary: 'Subir archivo a YCloud y obtener mediaId' })
  async uploadMedia(
    @AppHeaders() h: HeaderParamsDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.ycloudService.uploadMedia(h.ideEmpr, file.buffer, file.mimetype, file.originalname);
  }

  @Get('metrics/daily')
  @ApiOperation({ summary: 'Metricas diarias de mensajeria' })
  async getDailyMetrics(
    @AppHeaders() h: HeaderParamsDto,
    @Query() dto: YcloudMetricsQueryDto,
  ) {
    return this.metricsService.getDailyMetrics(h.ideEmpr, dto.fechaDesde, dto.fechaHasta);
  }

  @Get('metrics/agents')
  @ApiOperation({ summary: 'Metricas por agente' })
  async getAgentMetrics(
    @AppHeaders() h: HeaderParamsDto,
    @Query() dto: YcloudMetricsQueryDto,
  ) {
    return this.metricsService.getAgentMetrics(h.ideEmpr, dto.fechaDesde, dto.fechaHasta);
  }

  @Get('metrics/response-time')
  @ApiOperation({ summary: 'Estadisticas de tiempos de respuesta' })
  async getResponseTimeStats(
    @AppHeaders() h: HeaderParamsDto,
    @Query() dto: YcloudMetricsQueryDto,
  ) {
    return this.metricsService.getResponseTimeStats(h.ideEmpr, dto.fechaDesde, dto.fechaHasta);
  }

  @Get('metrics/generate-today')
  @ApiOperation({ summary: 'Generar metricas del dia actual' })
  async generateTodayMetrics(@AppHeaders() h: HeaderParamsDto) {
    const today = new Date().toISOString().split('T')[0];
    await this.metricsService.generateDailyMetrics(h.ideEmpr, today);
    return { message: 'ok', fecha: today };
  }

  @Get('sync/pending')
  @ApiOperation({ summary: 'Mensajes pendientes de sincronizar con YCloud' })
  async getPendingSyncs(@AppHeaders() h: HeaderParamsDto) {
    return this.metricsService.getPendingSyncs(h.ideEmpr);
  }

  @Post('sync/reconcile')
  @ApiOperation({ summary: 'Reconciliar un mensaje manualmente' })
  async reconcileMessage(
    @AppHeaders() h: HeaderParamsDto,
    @Body() body: { idMensaje: string },
  ) {
    await this.metricsService.reconcileMessage(h.ideEmpr, body.idMensaje);
    return { message: 'ok' };
  }

  @Post('sync/run')
  @ApiOperation({ summary: 'Ejecutar sincronizacion automatica de mensajes huerfanos' })
  async runSync(@AppHeaders() h: HeaderParamsDto) {
    return this.ycloudService.syncPendingMessages(h.ideEmpr);
  }

  @Get('config')
  @ApiOperation({ summary: 'Obtener configuracion YCloud de la empresa' })
  async getConfig(@AppHeaders() h: HeaderParamsDto) {
    return this.ycloudService.getConfig(h.ideEmpr);
  }

  @Get('validate-number')
  @ApiOperation({ summary: 'Validar si un numero tiene WhatsApp' })
  async validateNumber(
    @AppHeaders() h: HeaderParamsDto,
    @Query('phone') phone: string,
  ) {
    return this.ycloudService.validateNumber(h.ideEmpr, phone);
  }

  @Get('campanias')
  @ApiOperation({ summary: 'Listar campanias YCloud' })
  getCampanias(
    @AppHeaders() h: HeaderParamsDto,
    @Query() dto: QueryOptionsDto,
  ) {
    return this.ycloudCampService.getCampanias({ ...h, ...dto });
  }

  @Post('campania')
  @ApiOperation({ summary: 'Guardar campania YCloud' })
  async saveCampania(
    @AppHeaders() h: HeaderParamsDto,
    @Body() dto: SaveCampaniaDto,
  ) {
    return this.ycloudCampService.saveCampania({ ...h, ...dto });
  }

  @Post('campania/enviar')
  @ApiOperation({ summary: 'Enviar campania YCloud' })
  async sendCampania(
    @AppHeaders() h: HeaderParamsDto,
    @Body() dto: EnviarCampaniaDto,
  ) {
    return this.ycloudCampService.sendCampania({ ...h, ...dto });
  }

  @Get('campania/:ideWhcenv')
  @ApiOperation({ summary: 'Obtener detalle de campania YCloud' })
  getCampaniaById(
    @AppHeaders() h: HeaderParamsDto,
    @Param('ideWhcenv', ParseIntPipe) ideWhcenv: number,
  ) {
    return this.ycloudCampService.getCampaniaById({
      ide_whcenv: ideWhcenv,
      ...h,
    });
  }

  @Post('campania/detalle/:ideWhdenv')
  @ApiOperation({ summary: 'Eliminar detalle de campania YCloud' })
  async deleteDetailCampaniaById(
    @AppHeaders() _h: HeaderParamsDto,
    @Param('ideWhdenv', ParseIntPipe) ideWhdenv: number,
  ) {
    return this.ycloudCampService.deleteDetailCampaniaById(ideWhdenv);
  }
}
