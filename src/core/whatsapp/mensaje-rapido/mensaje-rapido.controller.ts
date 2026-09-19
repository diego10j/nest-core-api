import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { ArrayIdeDto } from 'src/common/dto/array-ide.dto';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { Auth } from '../../auth';
import { FILE_STORAGE_CONSTANTS } from '../../modules/sistema/files/constants/files.constants';
import { YcloudService } from '../ycloud/ycloud.service';

import { EnviarUbicacionDto } from './dto/enviar-ubicacion.dto';
import { SaveMensajeRapidoDto } from './dto/save-mensaje-rapido.dto';
import { MensajeRapidoService } from './mensaje-rapido.service';

@ApiTags('WhatsApp-Mensajes-Rapidos')
@Controller('whatsapp/mensajes-rapidos')
export class MensajeRapidoController {
  constructor(
    private readonly service: MensajeRapidoService,
    private readonly ycloud: YcloudService,
  ) {}

  @Get()
  @Auth()
  @ApiOperation({ summary: 'Listar mensajes rápidos de la empresa (soloActivos=true para el selector del chat)' })
  getList(@AppHeaders() h: HeaderParamsDto, @Query('soloActivos') soloActivos?: string) {
    return this.service.getList({ ...h, soloActivos: soloActivos === 'true' });
  }

  @Post()
  @Auth()
  @ApiOperation({ summary: 'Crear o actualizar un mensaje rápido' })
  save(@AppHeaders() h: HeaderParamsDto, @Body() dto: SaveMensajeRapidoDto) {
    return this.service.save({ ...h, ...dto });
  }

  @Delete()
  @Auth()
  @ApiOperation({ summary: 'Eliminar mensajes rápidos' })
  delete(@AppHeaders() h: HeaderParamsDto, @Body() dto: ArrayIdeDto) {
    return this.service.delete({ ...h, ...dto });
  }

  @Post('adjunto')
  @Auth()
  @ApiOperation({ summary: 'Sube un adjunto (imagen, video, documento) y devuelve su URL permanente' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: FILE_STORAGE_CONSTANTS.MAX_FILE_SIZE, files: 1 },
    }),
  )
  async uploadAdjunto(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No se ha subido ningún archivo');
    return this.service.saveAdjunto(file);
  }

  @Post('enviar-ubicacion')
  @Auth()
  @ApiOperation({ summary: 'Envía una ubicación por WhatsApp al chat indicado' })
  async enviarUbicacion(@AppHeaders() h: HeaderParamsDto, @Body() dto: EnviarUbicacionDto) {
    const res = await this.ycloud.sendLocation(
      h.ideEmpr,
      dto.telefono,
      dto.latitud,
      dto.longitud,
      dto.nombre,
      dto.direccion,
    );
    return { mensaje: 'ok', messageId: res.messageId };
  }
}
