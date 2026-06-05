import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { CxcTransaccionesSaveService } from './cxc-transacciones-save.service';
import { CxcTransaccionesService } from './cxc-transacciones.service';
import { GetFacturaCxCDto } from './dto/get-factura-cxc.dto';
import { SaveCobroCxCDto } from './dto/save-cobro-cxc.dto';

@ApiTags('Tesoreria - Cobros CxC')
@Controller('tesoreria/cxc-transacciones')
export class CxcTransaccionesController {
    constructor(
        private readonly service: CxcTransaccionesService,
        private readonly saveService: CxcTransaccionesSaveService,
    ) { }

    @Get('getFacturaCxC/:ideCccfa')
    @ApiOperation({ summary: 'Obtener factura CxC con saldo pendiente' })
    getFacturaCxC(
        @AppHeaders() h: HeaderParamsDto,
        @Param('ideCccfa', ParseIntPipe) ideCccfa: number,
    ) {
        return this.service.getFacturaCxC({ ...h, ideCccfa } as any);
    }

    @Get('getTiposTransaccionPositivo')
    @ApiOperation({ summary: 'Listar tipos de transaccion bancaria positivos' })
    getTiposTransaccionPositivo(@AppHeaders() h: HeaderParamsDto) {
        return this.service.getTiposTransaccionPositivo(h as any);
    }

    @Post('saveCobroCxC')
    @ApiOperation({ summary: 'Registrar cobro de factura CxC' })
    saveCobroCxC(
        @AppHeaders() h: HeaderParamsDto,
        @Body() dto: SaveCobroCxCDto,
    ) {
        return this.saveService.saveCobroCxC({ ...h, ...dto });
    }
}
