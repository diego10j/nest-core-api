import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { Auth } from 'src/core/auth';

import { AuditService } from './audit.service';
import { DeleteAuditoriaDto } from './dto/delete-auditoria.dto';
import { EventosAuditoriaDto } from './dto/eventos-auditoria.dto';
import { PaginasMasUsadasDto } from './dto/paginas-mas-usadas.dto';
import { RegistrarVisitaDto } from './dto/registrar-visita.dto';

@ApiTags('Auditoría')
@Controller('audit')
export class AuditController {
  constructor(private readonly service: AuditService) { }

  @Get('getEventosAuditoria')
  @ApiOperation({ summary: 'Listar eventos de auditoría con filtros de fecha y usuario' })
  @Auth()
  getEventosAuditoria(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: EventosAuditoriaDto) {
    return this.service.getEventosAuditoria({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('deleteEventosAuditoria')
  @ApiOperation({ summary: 'Eliminar eventos de auditoría por rango de fechas' })
  @Auth()
  deleteEventosAuditoria(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: DeleteAuditoriaDto) {
    return this.service.deleteEventosAuditoria({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('registrarVisita')
  @ApiOperation({ summary: 'Registra la visita del usuario a una pantalla (para páginas más usadas)' })
  @Auth()
  registrarVisita(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: RegistrarVisitaDto) {
    return this.service.registrarVisitaPantalla(headersParams, dtoIn.path);
  }

  @Get('paginasMasUsadas')
  @ApiOperation({ summary: 'Páginas más usadas por el usuario, dentro de las que su perfil aún tiene permitidas' })
  @Auth()
  paginasMasUsadas(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: PaginasMasUsadasDto) {
    return this.service.getPaginasMasUsadas(headersParams, dtoIn.limit);
  }
}
