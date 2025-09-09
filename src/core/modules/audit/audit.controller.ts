import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { AuditService } from './audit.service';
import { DeleteAuditoriaDto } from './dto/delete-auditoria.dto';
import { EventosAuditoriaDto } from './dto/eventos-auditoria.dto';

@ApiTags('Auditoría')
@Controller('audit')
export class AuditController {
  constructor(private readonly service: AuditService) {}

  @Get('getEventosAuditoria')
  // @Auth()
  getEventosAuditoria(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: EventosAuditoriaDto) {
    return this.service.getEventosAuditoria({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('deleteEventosAuditoria')
  // @Auth()
  deleteEventosAuditoria(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: DeleteAuditoriaDto) {
    return this.service.deleteEventosAuditoria({
      ...headersParams,
      ...dtoIn,
    });
  }
}
