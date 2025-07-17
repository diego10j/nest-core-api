import { Body, Controller, Delete, Get, Post, Query } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';

import { Auth } from '../../auth/decorators';
import { AuditService } from './audit.service';
import { EventosAuditoriaDto } from './dto/eventos-auditoria.dto';
import { DeleteAuditoriaDto } from './dto/delete-auditoria.dto';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';

@ApiTags('Auditoría')
@Controller('audit')
export class AuditController {
    constructor(private readonly service: AuditService) { }

    @Get('getEventosAuditoria')
    // @Auth()
    getEventosAuditoria(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: EventosAuditoriaDto
    ) {
        return this.service.getEventosAuditoria({
            ...headersParams,
            ...dtoIn
        });
    }


    @Post('deleteEventosAuditoria')
    // @Auth()
    deleteEventosAuditoria(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: DeleteAuditoriaDto
    ) {
        return this.service.deleteEventosAuditoria({
            ...headersParams,
            ...dtoIn
        });
    }


}
