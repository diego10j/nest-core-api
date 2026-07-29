import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { Auth } from 'src/core/auth';

import { EnviarSriNotaCreditoDto } from './dto/enviar-sri-nota-credito.dto';
import { AnularNotaCreditoDto, SaveNotaCreditoDto } from './dto/save-nota-credito.dto';
import { NotasCreditoSaveService } from './notas-credito-save.service';

@ApiTags('Ventas - Notas de Crédito')
@Controller('ventas/notas-credito')
export class NotasCreditoController {
    constructor(private readonly saveService: NotasCreditoSaveService) { }

    @Post('saveNotaCredito')
    @Auth()
    @ApiOperation({ summary: 'Crear una nota de crédito de venta (reversa una factura, genera comprobante SRI)' })
    saveNotaCredito(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: SaveNotaCreditoDto,
    ) {
        return this.saveService.saveNotaCredito({ ...headersParams, ...dtoIn });
    }

    @Post('enviarSRI')
    @Auth()
    @ApiOperation({ summary: 'Enviar bajo demanda una nota de crédito al SRI (firma + recepción + autorización + correo)' })
    enviarSRI(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: EnviarSriNotaCreditoDto,
    ) {
        return this.saveService.enviarSRI({ ...headersParams, ...dtoIn });
    }

    @Post('anularNotaCredito')
    @Auth()
    @ApiOperation({ summary: 'Anular una nota de crédito de venta' })
    anularNotaCredito(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: AnularNotaCreditoDto,
    ) {
        return this.saveService.anularNotaCredito({ ...headersParams, ...dtoIn });
    }
}
