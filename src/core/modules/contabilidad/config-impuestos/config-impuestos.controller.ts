import { Body, Controller, Delete, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { ArrayIdeDto } from 'src/common/dto/array-ide.dto';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { ConfigImpuestosService } from './config-impuestos.service';
import {
    GetCabeceImpuesDto,
    GetDetallImpuesDto,
    GetVigencImpuesDto,
    SaveCabeceImpuesDto,
    SaveConImpuestoDto,
    SaveDetallImpuesDto,
    SaveTipoContribuDto,
    SaveVigencImpuesDto,
} from './dto/config-impuestos.dto';

/**
 * Mantenimiento de configuración de impuestos/retenciones (con_impuesto → con_cabece_impues →
 * con_vigenc_impues → con_detall_impues, + con_tipo_contribu). Reemplaza el mantenimiento por
 * SQL directo que se usaba hasta ahora - las tablas ya existían y ya son consumidas por el
 * motor de sugerencia de retenciones en compras/ventas.
 */
@ApiTags('Contabilidad-ConfigImpuestos')
@Controller('contabilidad/config-impuestos')
export class ConfigImpuestosController {
    constructor(private readonly service: ConfigImpuestosService) { }

    // ── con_impuesto ────────────────────────────────────────────────────
    @Get('getConImpuestos')
    @ApiOperation({ summary: 'Listar los impuestos raíz (IVA, Renta)' })
    getConImpuestos(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.service.getConImpuestos(headersParams);
    }

    @Post('saveConImpuesto')
    @ApiOperation({ summary: 'Crear o actualizar un impuesto' })
    saveConImpuesto(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SaveConImpuestoDto) {
        return this.service.saveConImpuesto({ ...headersParams, ...dtoIn });
    }

    @Delete('deleteConImpuesto')
    @ApiOperation({ summary: 'Eliminar uno o varios impuestos' })
    deleteConImpuesto(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: ArrayIdeDto) {
        return this.service.deleteConImpuesto({ ...headersParams, ...dtoIn });
    }

    // ── con_cabece_impues (casillero) ───────────────────────────────────
    @Get('getCabeceImpues')
    @ApiOperation({ summary: 'Listar casilleros de retención (opcionalmente filtrados por impuesto)' })
    getCabeceImpues(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetCabeceImpuesDto) {
        return this.service.getCabeceImpues({ ...headersParams, ...dtoIn });
    }

    @Get('getListDataCabeceImpues')
    @ApiOperation({ summary: 'Combo de casilleros de retención' })
    getListDataCabeceImpues(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.service.getListDataCabeceImpues(headersParams);
    }

    @Post('saveCabeceImpues')
    @ApiOperation({ summary: 'Crear o actualizar un casillero de retención' })
    saveCabeceImpues(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SaveCabeceImpuesDto) {
        return this.service.saveCabeceImpues({ ...headersParams, ...dtoIn });
    }

    @Delete('deleteCabeceImpues')
    @ApiOperation({ summary: 'Eliminar uno o varios casilleros de retención' })
    deleteCabeceImpues(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: ArrayIdeDto) {
        return this.service.deleteCabeceImpues({ ...headersParams, ...dtoIn });
    }

    // ── con_vigenc_impues (vigencia) ────────────────────────────────────
    @Get('getVigencImpues')
    @ApiOperation({ summary: 'Listar vigencias de un casillero de retención' })
    getVigencImpues(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetVigencImpuesDto) {
        return this.service.getVigencImpues({ ...headersParams, ...dtoIn });
    }

    @Post('saveVigencImpues')
    @ApiOperation({ summary: 'Crear o actualizar una vigencia (valida que no se solape con otra vigencia activa)' })
    saveVigencImpues(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SaveVigencImpuesDto) {
        return this.service.saveVigencImpues({ ...headersParams, ...dtoIn });
    }

    @Delete('deleteVigencImpues')
    @ApiOperation({ summary: 'Eliminar una o varias vigencias' })
    deleteVigencImpues(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: ArrayIdeDto) {
        return this.service.deleteVigencImpues({ ...headersParams, ...dtoIn });
    }

    // ── con_detall_impues (% por tipo documento + tipo contribuyente) ──
    @Get('getDetallImpues')
    @ApiOperation({ summary: 'Listar el detalle de porcentajes de una vigencia' })
    getDetallImpues(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetDetallImpuesDto) {
        return this.service.getDetallImpues({ ...headersParams, ...dtoIn });
    }

    @Post('saveDetallImpues')
    @ApiOperation({ summary: 'Crear o actualizar un porcentaje (valida que la combinación tipo doc + tipo contribuyente sea única en la vigencia)' })
    saveDetallImpues(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SaveDetallImpuesDto) {
        return this.service.saveDetallImpues({ ...headersParams, ...dtoIn });
    }

    @Delete('deleteDetallImpues')
    @ApiOperation({ summary: 'Eliminar uno o varios porcentajes' })
    deleteDetallImpues(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: ArrayIdeDto) {
        return this.service.deleteDetallImpues({ ...headersParams, ...dtoIn });
    }

    // ── con_tipo_contribu ────────────────────────────────────────────────
    @Get('getTipoContribu')
    @ApiOperation({ summary: 'Listar los tipos de contribuyente' })
    getTipoContribu(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.service.getTipoContribu(headersParams);
    }

    @Get('getListDataTipoContribu')
    @ApiOperation({ summary: 'Combo de tipos de contribuyente' })
    getListDataTipoContribu(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.service.getListDataTipoContribu(headersParams);
    }

    @Post('saveTipoContribu')
    @ApiOperation({ summary: 'Crear o actualizar un tipo de contribuyente' })
    saveTipoContribu(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SaveTipoContribuDto) {
        return this.service.saveTipoContribu({ ...headersParams, ...dtoIn });
    }

    @Delete('deleteTipoContribu')
    @ApiOperation({ summary: 'Eliminar uno o varios tipos de contribuyente (bloqueado si están en uso por proveedores/clientes)' })
    deleteTipoContribu(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: ArrayIdeDto) {
        return this.service.deleteTipoContribu({ ...headersParams, ...dtoIn });
    }

    // ── combos de apoyo ─────────────────────────────────────────────────
    @Get('getListDataConImpuesto')
    @ApiOperation({ summary: 'Combo de impuestos (con_impuesto)' })
    getListDataConImpuesto(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.service.getListDataConImpuesto(headersParams);
    }

    @Get('getListDataTipoDocumento')
    @ApiOperation({ summary: 'Combo de tipos de documento (con_tipo_document)' })
    getListDataTipoDocumento(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.service.getListDataTipoDocumento(headersParams);
    }
}
