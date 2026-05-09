import { Body, Controller, Delete, Get, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { ArrayIdeDto } from 'src/common/dto/array-ide.dto';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import {
    AnularComprobanteDto,
    GetComprobanteByIdDto,
    GetComprobantesDto,
    ReversarComprobanteDto,
    SaveComprobanteDto,
} from './dto/comprobante-contabilidad.dto';
import { ComprobanteContabilidadService } from './comprobante-contabilidad.service';

@ApiTags('Contabilidad-Comprobante')
@Controller('contabilidad/comprobante')
export class ComprobanteContabilidadController {
    constructor(private readonly service: ComprobanteContabilidadService) { }

    @Get('getListDataTipoComprobante')
    @ApiOperation({ summary: 'Lista tipos de comprobante para Select/Autocomplete' })
    getListDataTipoComprobante(
        @AppHeaders() headersParams: HeaderParamsDto,
    ) {
        return this.service.getListDataTipoComprobante(headersParams);
    }

    /**
     * Lista todos los comprobantes contables en un rango de fechas con paginación y filtros.
     */
    @Get('getComprobantes')
    @ApiOperation({ summary: 'Listar comprobantes contables por rango de fechas' })
    getComprobantes(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetComprobantesDto,
    ) {
        return this.service.getComprobantes({ ...headersParams, ...dtoIn });
    }

    /**
     * Retorna el comprobante completo (cabecera + detalle) por su ID.
     */
    @Get('getComprobanteById')
    @ApiOperation({ summary: 'Obtener comprobante contable por ID (cabecera + detalle)' })
    getComprobanteById(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetComprobanteByIdDto,
    ) {
        return this.service.getComprobanteById({ ...headersParams, ...dtoIn });
    }

    /**
     * Retorna solo la cabecera del comprobante por su ID.
     */
    @Get('getComprobanteCabeceraById')
    @ApiOperation({ summary: 'Obtener cabecera del comprobante contable por ID' })
    getComprobanteCabeceraById(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetComprobanteByIdDto,
    ) {
        return this.service.getComprobanteCabeceraById({ ...headersParams, ...dtoIn });
    }

    /**
     * Retorna solo el detalle del comprobante por su ID de cabecera.
     */
    @Get('getComprobanteDetalleById')
    @ApiOperation({ summary: 'Obtener detalle del comprobante contable por ID de cabecera' })
    getComprobanteDetalleById(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetComprobanteByIdDto,
    ) {
        return this.service.getComprobanteDetalleById({ ...headersParams, ...dtoIn });
    }

    /**
     * Crea o actualiza un comprobante contable (cabecera + detalles).
     */
    @Post('save')
    @ApiOperation({ summary: 'Crear o actualizar comprobante contable' })
    save(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: SaveComprobanteDto,
    ) {
        return this.service.save({ ...headersParams, ...dtoIn });
    }

    /**
     * Anula un comprobante contable.
     */
    @Put('anular')
    @ApiOperation({ summary: 'Anular un comprobante contable' })
    anular(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: AnularComprobanteDto,
    ) {
        return this.service.anular({ ...headersParams, ...dtoIn });
    }

    /**
     * Reversa un comprobante contable: crea uno nuevo con DEBE/HABER invertidos.
     */
    @Post('reversar')
    @ApiOperation({ summary: 'Reversar un comprobante contable' })
    reversar(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: ReversarComprobanteDto,
    ) {
        return this.service.reversar({ ...headersParams, ...dtoIn });
    }

    /**
     * Elimina uno o varios comprobantes contables.
     */
    @Delete('delete')
    @ApiOperation({ summary: 'Eliminar uno o varios comprobantes contables' })
    deleteComprobantes(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: ArrayIdeDto,
    ) {
        return this.service.deleteComprobantes({ ...headersParams, ...dtoIn });
    }
}
