import { Body, Controller, Delete, Post } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';

import { Auth } from '../auth/decorators';
import { AuditService } from './audit.service';
import { EventosAuditoriaDto } from './dto/eventos-auditoria.dto';
import { DeleteAuditoriaDto } from './dto/delete-auditoria.dto';

@ApiTags('Auditoría')
@Controller('audit')
export class AuditController {
    constructor(private readonly service: AuditService) { }

    @Post('getEventosAuditoria')
    // @Auth()
    getEventosAuditoria(
        @Body() dtoIn: EventosAuditoriaDto
    ) {
        return this.service.getEventosAuditoria(dtoIn);
    }


    @Post('deleteEventosAuditoria')
    // @Auth()
    deleteEventosAuditoria(
        @Body() dtoIn: DeleteAuditoriaDto
    ) {
        return this.service.deleteEventosAuditoria(dtoIn);
    }


}
