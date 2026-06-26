import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { AsignarUsuarioDto } from './dto/asignar-usuario.dto';
import { CreateNotificacionDto } from './dto/create-notificacion.dto';
import { GetMisNotificacionesDto } from './dto/get-mis-notificaciones.dto';
import { GetPlantillasDto } from './dto/get-plantillas.dto';
import { UpdateNotificacionDto } from './dto/update-notificacion.dto';
import { NotificacionesService } from './notificaciones.service';

@ApiTags('Notificaciones')
@Controller('notificaciones')
export class NotificacionesController {
  constructor(private readonly service: NotificacionesService) {}

  // ========== PLANTILLAS ==========

  @Get('plantillas')
  @ApiOperation({ summary: 'Listar plantillas de notificación' })
  getPlantillas(
    @AppHeaders() h: HeaderParamsDto,
    @Query() dto: GetPlantillasDto,
  ) {
    return this.service.getPlantillas({ ...h, ...dto });
  }

  @Post('plantillas')
  @ApiOperation({ summary: 'Crear plantilla de notificación' })
  createPlantilla(
    @AppHeaders() h: HeaderParamsDto,
    @Body() dto: CreateNotificacionDto,
  ) {
    return this.service.createPlantilla({ ...h, ...dto });
  }

  @Put('plantillas/:uuid')
  @ApiOperation({ summary: 'Actualizar plantilla de notificación' })
  updatePlantilla(
    @AppHeaders() h: HeaderParamsDto,
    @Param('uuid', ParseUUIDPipe) uuid: string,
    @Body() dto: UpdateNotificacionDto,
  ) {
    return this.service.updatePlantilla({ ...h, ...dto, uuid });
  }

  @Delete('plantillas/:uuid')
  @ApiOperation({ summary: 'Eliminar plantilla de notificación' })
  deletePlantilla(
    @AppHeaders() h: HeaderParamsDto,
    @Param('uuid', ParseUUIDPipe) uuid: string,
  ) {
    return this.service.deletePlantilla(uuid, h);
  }

  @Get('plantillas/:uuid/usuarios')
  @ApiOperation({ summary: 'Usuarios asignados a una plantilla' })
  getPlantillaUsuarios(
    @AppHeaders() h: HeaderParamsDto,
    @Param('uuid', ParseUUIDPipe) uuid: string,
  ) {
    return this.service.getPlantillaUsuarios(uuid, h.ideEmpr);
  }

  @Post('plantillas/:uuid/usuarios')
  @ApiOperation({ summary: 'Asignar usuario a plantilla' })
  asignarUsuario(
    @AppHeaders() h: HeaderParamsDto,
    @Param('uuid', ParseUUIDPipe) uuid: string,
    @Body() dto: AsignarUsuarioDto,
  ) {
    return this.service.asignarUsuario(uuid, { ...h, ...dto });
  }

  @Delete('plantillas/:uuid/usuarios/:ideUsua')
  @ApiOperation({ summary: 'Quitar usuario de plantilla' })
  quitarUsuario(
    @AppHeaders() h: HeaderParamsDto,
    @Param('uuid', ParseUUIDPipe) uuid: string,
    @Param('ideUsua', ParseIntPipe) ideUsua: number,
  ) {
    return this.service.quitarUsuario(uuid, ideUsua, h);
  }

  // ========== NOTIFICACIONES DEL USUARIO ==========

  @Get('mias')
  @ApiOperation({ summary: 'Mis notificaciones (all|unread|archived)' })
  getMisNotificaciones(
    @AppHeaders() h: HeaderParamsDto,
    @Query() dto: GetMisNotificacionesDto,
  ) {
    return this.service.getMisNotificaciones({ ...h, ...dto });
  }

  @Get('conteos')
  @ApiOperation({ summary: 'Conteos para badges (total, noLeidas, archivadas)' })
  getConteos(@AppHeaders() h: HeaderParamsDto) {
    return this.service.getConteos(h);
  }

  @Post('marcar-leido/:uuid')
  @ApiOperation({ summary: 'Marcar notificación como leída' })
  marcarLeido(
    @AppHeaders() h: HeaderParamsDto,
    @Param('uuid', ParseUUIDPipe) uuid: string,
  ) {
    return this.service.marcarLeido(uuid, h);
  }

  @Post('marcar-todas-leidas')
  @ApiOperation({ summary: 'Marcar todas las notificaciones como leídas' })
  marcarTodasLeidas(@AppHeaders() h: HeaderParamsDto) {
    return this.service.marcarTodasLeidas(h);
  }

  @Post('archivar/:uuid')
  @ApiOperation({ summary: 'Archivar notificación' })
  archivar(
    @AppHeaders() h: HeaderParamsDto,
    @Param('uuid', ParseUUIDPipe) uuid: string,
  ) {
    return this.service.archivar(uuid, h);
  }

  @Delete(':uuid')
  @ApiOperation({ summary: 'Eliminar notificación (soft-delete)' })
  deleteNotificacion(
    @AppHeaders() h: HeaderParamsDto,
    @Param('uuid', ParseUUIDPipe) uuid: string,
  ) {
    return this.service.deleteNotificacion(uuid, h);
  }
}
