import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { Auth } from 'src/core/auth';

import { ComprobanteEmailListener } from './comprobante-email.listener';
import { ReenviarComprobanteDto } from './dto/reenviar-comprobante.dto';

@ApiTags('SRI-ComprobanteEmail')
@Controller('sri/comprobante-email')
export class ComprobanteEmailController {
    constructor(private readonly listener: ComprobanteEmailListener) { }

    @Post('reenviar')
    @Auth()
    @ApiOperation({ summary: 'Reenviar por correo (PDF+XML) un comprobante ya autorizado por el SRI a otro destinatario' })
    reenviar(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: ReenviarComprobanteDto) {
        return this.listener.reenviar({ ...headersParams, ...dtoIn });
    }
}
