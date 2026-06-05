import {
    Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { ComprobanteBancoSaveService } from './comprobante-banco-save.service';
import { ComprobanteBancoService } from './comprobante-banco.service';
import { GetComprobantesBancoDto } from './dto/get-comprobantes-banco.dto';
import { SaveComprobanteBancoDto } from './dto/save-comprobante-banco.dto';
import { SetActivoDto } from './dto/set-activo.dto';

@ApiTags('Tesoreria - Comprobantes Banco')
@Controller('tesoreria/comprobante-banco')
export class ComprobanteBancoController {
    constructor(
        private readonly service: ComprobanteBancoService,
        private readonly saveService: ComprobanteBancoSaveService,
    ) { }

    @Get('getComprobantes')
    @ApiOperation({ summary: 'Listar comprobantes de banco con paginación y filtros' })
    getComprobantes(
        @AppHeaders() h: HeaderParamsDto,
        @Query() dto: GetComprobantesBancoDto,
    ) {
        return this.service.getComprobantes({ ...h, ...dto });
    }

    @Get('getComprobanteById/:ideTeincb')
    @ApiOperation({ summary: 'Obtener comprobante de banco por ID' })
    getComprobanteById(
        @AppHeaders() _h: HeaderParamsDto,
        @Param('ideTeincb', ParseIntPipe) ideTeincb: number,
    ) {
        return this.service.getComprobanteById(ideTeincb);
    }

    @Get('getComprobantesByBanco/:ideTeclb')
    @ApiOperation({ summary: 'Listar comprobantes por libro banco con paginación y filtros' })
    getComprobantesByBanco(
        @AppHeaders() h: HeaderParamsDto,
        @Param('ideTeclb', ParseIntPipe) ideTeclb: number,
        @Query() dto: GetComprobantesBancoDto,
    ) {
        return this.service.getComprobantesByBanco(ideTeclb, { ...h, ...dto });
    }

    @Post('saveComprobante')
    @ApiOperation({ summary: 'Crear o actualizar un comprobante de banco' })
    saveComprobante(
        @AppHeaders() h: HeaderParamsDto,
        @Body() dto: SaveComprobanteBancoDto,
    ) {
        return this.saveService.saveComprobante({ ...h, ...dto });
    }

    @Post('setActivoComprobante')
    @ApiOperation({ summary: 'Activar o desactivar un comprobante de banco' })
    setActivoComprobante(
        @AppHeaders() h: HeaderParamsDto,
        @Body() dto: SetActivoDto,
    ) {
        return this.saveService.setActivoComprobante({ ...h, ...dto });
    }

    @Delete('deleteComprobante/:ideTeincb')
    @ApiOperation({ summary: 'Eliminar un comprobante de banco' })
    deleteComprobante(
        @AppHeaders() h: HeaderParamsDto,
        @Param('ideTeincb', ParseIntPipe) ideTeincb: number,
    ) {
        return this.saveService.deleteComprobante(ideTeincb, h);
    }
}
