import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { CxcTransaccionesSaveService } from './cxc-transacciones-save.service';
import { CxcTransaccionesService } from './cxc-transacciones.service';
import { GetFacturasPendientesClienteDto } from './dto/get-facturas-pendientes-cliente.dto';
import { SaveCobroCxCDto } from './dto/save-cobro-cxc.dto';
import { SavePagoMultipleCxCDto } from './dto/save-pago-multiple-cxc.dto';

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

    @Get('getFacturasPendientesCliente')
    @ApiOperation({ summary: 'Cuentas por cobrar del cliente con saldo pendiente (selección múltiple)' })
    getFacturasPendientesCliente(
        @AppHeaders() h: HeaderParamsDto,
        @Query() dto: GetFacturasPendientesClienteDto,
    ) {
        return this.service.getFacturasPendientesCliente({ ...h, ...dto });
    }

    @Post('savePagoMultipleCxC')
    @ApiOperation({ summary: 'Registrar cobro a cliente con distribución entre una o varias cuentas por cobrar' })
    savePagoMultipleCxC(
        @AppHeaders() h: HeaderParamsDto,
        @Body() dto: SavePagoMultipleCxCDto,
    ) {
        return this.saveService.savePagoMultipleCxC({ ...h, ...dto });
    }
}
