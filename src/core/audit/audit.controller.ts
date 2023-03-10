import { Body, Controller, Post } from '@nestjs/common';
import { Auth } from '../auth/decorators';
import { AuditService } from './audit.service';
import { EventosAuditoriaDto } from './dto/eventos-auditoria.dto';

@Controller('audit')
export class AuditController {
    constructor(private readonly service: AuditService) { }

    @Post('eventos-auditoria')
    //@Auth()
    getEventosAuditoria(
        @Body() dtoIn: EventosAuditoriaDto
    ) {
        return this.service.getEventosAuditoria(dtoIn);
    }

}
