import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

import { SavePosPuntoVentaDto } from './dto/save-pos-punto-venta.dto';
import { SaveUsuarioPuntoVentaDto } from './dto/save-usuario-punto-venta.dto';
import { IdPosPuntoVentaDto, IdUsuarioPuntoVentaDto, SetActivoPosPuntoVentaDto } from './dto/set-activo-pos-punto-venta.dto';
import { PosPuntoVentaSaveService } from './pos-punto-venta-save.service';
import { PosPuntoVentaService } from './pos-punto-venta.service';

@ApiTags('Ventas-PuntoVenta-POS')
@Controller('ventas/pos-punto-venta')
export class PosPuntoVentaController {
    constructor(
        private readonly service: PosPuntoVentaService,
        private readonly saveService: PosPuntoVentaSaveService,
    ) {}

    @Get('getConfigPOS')
    @ApiOperation({ summary: 'Obtener configuración de impresora POS por usuario' })
    getConfigPOS(
        @AppHeaders() _h: HeaderParamsDto,
        @Query('ide_usua') ide_usua: string,
    ) {
        return this.service.getConfigPOS(Number(ide_usua));
    }

    @Get('getTableQueryPosPuntoVenta')
    @ApiOperation({ summary: 'DataTable de puntos de venta POS con paginación y filtros' })
    getTableQueryPosPuntoVenta(
        @AppHeaders() h: HeaderParamsDto,
        @Query() dtoIn: QueryOptionsDto,
    ) {
        return this.service.getTableQueryPosPuntoVenta({ ...h, ...dtoIn });
    }

    @Get('getListDataPosPuntoVenta')
    @ApiOperation({ summary: 'Combo de puntos de venta POS activos' })
    getListDataPosPuntoVenta(@AppHeaders() h: HeaderParamsDto) {
        return this.service.getListDataPosPuntoVenta(h);
    }

    @Get('getTableQueryUsuarioPuntoVenta')
    @ApiOperation({ summary: 'DataTable de usuarios asignados a puntos de venta POS' })
    getTableQueryUsuarioPuntoVenta(
        @AppHeaders() h: HeaderParamsDto,
        @Query() dtoIn: QueryOptionsDto,
    ) {
        return this.service.getTableQueryUsuarioPuntoVenta({ ...h, ...dtoIn });
    }

    @Get('getListDataUsuarioPuntoVenta')
    @ApiOperation({ summary: 'Combo de asignaciones usuario-punto de venta activas' })
    getListDataUsuarioPuntoVenta(@AppHeaders() h: HeaderParamsDto) {
        return this.service.getListDataUsuarioPuntoVenta(h);
    }

    @Post('savePosPuntoVenta')
    @ApiOperation({ summary: 'Crear o actualizar un punto de venta POS' })
    savePosPuntoVenta(
        @AppHeaders() h: HeaderParamsDto,
        @Body() dtoIn: SavePosPuntoVentaDto,
    ) {
        return this.saveService.savePosPuntoVenta({ ...h, ...dtoIn });
    }

    @Post('saveUsuarioPuntoVenta')
    @ApiOperation({ summary: 'Crear o actualizar asignación usuario-punto de venta POS' })
    saveUsuarioPuntoVenta(
        @AppHeaders() h: HeaderParamsDto,
        @Body() dtoIn: SaveUsuarioPuntoVentaDto,
    ) {
        return this.saveService.saveUsuarioPuntoVenta({ ...h, ...dtoIn });
    }

    @Post('setActivoPosPuntoVenta')
    @ApiOperation({ summary: 'Activar o desactivar un punto de venta POS' })
    setActivoPosPuntoVenta(
        @AppHeaders() h: HeaderParamsDto,
        @Body() dtoIn: SetActivoPosPuntoVentaDto,
    ) {
        return this.saveService.setActivoPosPuntoVenta({ ...h, ...dtoIn });
    }

    @Post('setActivoUsuarioPuntoVenta')
    @ApiOperation({ summary: 'Activar o desactivar asignación usuario-punto de venta POS' })
    setActivoUsuarioPuntoVenta(
        @AppHeaders() h: HeaderParamsDto,
        @Body() dtoIn: SetActivoPosPuntoVentaDto,
    ) {
        return this.saveService.setActivoUsuarioPuntoVenta({ ...h, ...dtoIn });
    }

    @Post('deletePosPuntoVenta')
    @ApiOperation({ summary: 'Eliminar un punto de venta POS y sus asignaciones' })
    deletePosPuntoVenta(
        @AppHeaders() h: HeaderParamsDto,
        @Body() dtoIn: IdPosPuntoVentaDto,
    ) {
        return this.saveService.deletePosPuntoVenta({ ...h, ...dtoIn });
    }

    @Post('deleteUsuarioPuntoVenta')
    @ApiOperation({ summary: 'Eliminar una asignación usuario-punto de venta POS' })
    deleteUsuarioPuntoVenta(
        @AppHeaders() h: HeaderParamsDto,
        @Body() dtoIn: IdUsuarioPuntoVentaDto,
    ) {
        return this.saveService.deleteUsuarioPuntoVenta({ ...h, ...dtoIn });
    }
}
