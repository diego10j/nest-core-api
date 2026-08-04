import { Body, Controller, Get, Param, Query, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { CxpTransaccionesSaveService } from './cxp-transacciones-save.service';
import { CxpTransaccionesService } from './cxp-transacciones.service';
import { GetFacturaCxPDto } from './dto/get-factura-cxp.dto';
import { GetFacturasPendientesProveedorDto } from './dto/get-facturas-pendientes-proveedor.dto';
import { SaveAnticipoCxPDto } from './dto/save-anticipo-cxp.dto';
import { SavePagoCxPDto } from './dto/save-pago-cxp.dto';

@ApiTags('Tesoreria - Pagos CxP')
@Controller('tesoreria/cxp-transacciones')
export class CxpTransaccionesController {
    constructor(
        private readonly service: CxpTransaccionesService,
        private readonly saveService: CxpTransaccionesSaveService,
    ) { }

    @Get('getFacturaCxP/:ideCpcfa')
    @ApiOperation({ summary: 'Documento CxP puntual con saldo pendiente, para el diálogo de Registrar Pago' })
    getFacturaCxP(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Param('ideCpcfa') ideCpcfa: string,
    ) {
        return this.service.getFacturaCxP({ ...headersParams, ideCpcfa: Number(ideCpcfa) });
    }

    @Get('getFacturasPendientesProveedor')
    @ApiOperation({ summary: 'Cuentas por pagar del proveedor con saldo pendiente (selección múltiple)' })
    getFacturasPendientesProveedor(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetFacturasPendientesProveedorDto,
    ) {
        return this.service.getFacturasPendientesProveedor({ ...headersParams, ...dtoIn });
    }

    @Post('savePagoCxP')
    @ApiOperation({ summary: 'Registrar pago a proveedor con distribución entre una o varias cuentas por pagar' })
    savePagoCxP(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: SavePagoCxPDto,
    ) {
        return this.saveService.savePagoCxP({ ...headersParams, ...dtoIn });
    }

    @Post('saveAnticipoCxP')
    @ApiOperation({ summary: 'Registrar anticipo a proveedor (pago sin documento asociado)' })
    saveAnticipoCxP(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: SaveAnticipoCxPDto,
    ) {
        return this.saveService.saveAnticipoCxP({ ...headersParams, ...dtoIn });
    }
}
