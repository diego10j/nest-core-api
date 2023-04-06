import { Body, Controller, Delete, Post } from '@nestjs/common';
import { Auth } from '../auth/decorators';
import { AuditService } from './audit.service';
import { EventosAuditoriaDto } from './dto/eventos-auditoria.dto';
import { DeleteAuditoriaDto } from './dto/delete-auditoria.dto';

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


    @Delete('deleteEventosAuditoria')
    // @Auth()
    deleteEventosAuditoria(
        @Body() dtoIn: DeleteAuditoriaDto
    ) {
        return this.service.deleteEventosAuditoria(dtoIn);
    }


}
