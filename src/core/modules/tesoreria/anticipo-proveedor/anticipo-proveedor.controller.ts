import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { Auth } from 'src/core/auth';

import { AnticipoProveedorSaveService } from './anticipo-proveedor-save.service';
import { AnticipoProveedorService } from './anticipo-proveedor.service';
import { GetAnticiposProveedorDto, IdAnticipoProveedorDto } from './dto/anticipo-proveedor-query.dto';
import { LiquidarAnticipoProveedorDto } from './dto/liquidar-anticipo-proveedor.dto';
import { RegistrarAnticipoProveedorDto } from './dto/registrar-anticipo-proveedor.dto';

@ApiTags('Tesorería - Anticipo a Proveedores')
@Controller('tesoreria/anticipo-proveedor')
export class AnticipoProveedorController {
    constructor(
        private readonly service: AnticipoProveedorService,
        private readonly saveService: AnticipoProveedorSaveService,
    ) { }

    @Get('getAnticiposProveedor')
    @Auth()
    @ApiOperation({ summary: 'Anticipos activos (con saldo) de un proveedor, o de todos si no se indica' })
    getAnticiposProveedor(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetAnticiposProveedorDto,
    ) {
        return this.service.getAnticiposProveedor({ ...headersParams, ...dtoIn });
    }

    @Get('getAnticipoProveedorById/:ideTeanp')
    @Auth()
    @ApiOperation({ summary: 'Detalle de un anticipo, con las facturas a las que ya se aplicó' })
    getAnticipoProveedorById(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Param('ideTeanp') ideTeanp: string,
    ) {
        return this.service.getAnticipoProveedorById(Number(ideTeanp), headersParams);
    }

    @Post('registrar')
    @Auth()
    @ApiOperation({ summary: 'Registra un Anticipo a Proveedores: pago sin factura, contra la cuenta de activo dedicada' })
    registrar(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: RegistrarAnticipoProveedorDto,
    ) {
        return this.saveService.registrar({ ...headersParams, ...dtoIn });
    }

    @Post('liquidar')
    @Auth()
    @ApiOperation({ summary: 'Aplica (liquida) un anticipo contra una o varias facturas del proveedor' })
    liquidar(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: LiquidarAnticipoProveedorDto,
    ) {
        return this.saveService.liquidar({ ...headersParams, ...dtoIn });
    }

    @Post('anular')
    @Auth()
    @ApiOperation({ summary: 'Anula un anticipo sin liquidaciones aplicadas todavía' })
    anular(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: IdAnticipoProveedorDto,
    ) {
        return this.saveService.anular(dtoIn.ide_teanp, headersParams);
    }
}
