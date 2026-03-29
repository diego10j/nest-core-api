import { Body, Controller, Delete, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

import { EtiquetasSaveService } from './etiquetas-save.service';
import { EtiquetasService } from './etiquetas.service';
import { IdEtiquetaDto } from './dto/id-etiqueta.dto';
import { IdProductoDto } from './dto/id-producto.dto';
import { IdProductoEtiquetaDto } from './dto/id-producto-etiqueta.dto';
import { TipoEtiquetaDto } from './dto/tipo-etiqueta.dto';
import { SaveEtiquetaDto } from './dto/save-etiqueta.dto';

@ApiTags('Inventario-Etiquetas')
@Controller('inventario/etiquetas')
export class EtiquetasController {
    constructor(
        private readonly service: EtiquetasService,
        private readonly saveService: EtiquetasSaveService,
    ) { }

    // ─────────────────────────────────────────────────────────────
    // CONSULTAS
    // ─────────────────────────────────────────────────────────────

    /**
     * Retorna todas las etiquetas configuradas de la empresa.
     */
    @Get('getEtiquetas')
    getEtiquetas(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: QueryOptionsDto,
    ) {
        return this.service.getEtiquetas({ ...headersParams, ...dtoIn });
    }

    /**
     * Retorna todas las etiquetas de un producto específico (todos los tipos).
     * Query param: ide_inarti
     */
    @Get('getEtiquetasByProducto')
    getEtiquetasByProducto(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: IdProductoDto,
    ) {
        return this.service.getEtiquetasByProducto({ ...headersParams, ...dtoIn });
    }

    /**
     * Retorna la etiqueta de un producto específico según tipo.
     * Query params: ide_inarti, tipo_ineta
     */
    @Get('getEtiquetaProducto')
    getEtiquetaProducto(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: IdProductoEtiquetaDto,
    ) {
        return this.service.getEtiquetaProducto({ ...headersParams, ...dtoIn });
    }

    /**
     * Retorna todas las etiquetas de un tipo específico.
     * Query param: tipo_ineta
     */
    @Get('getEtiquetasByTipo')
    getEtiquetasByTipo(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: TipoEtiquetaDto,
    ) {
        return this.service.getEtiquetasByTipo({ ...headersParams, ...dtoIn });
    }

    /**
     * Retorna los tipos de etiqueta disponibles en la empresa.
     */
    @Get('getTiposEtiqueta')
    getTiposEtiqueta(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: QueryOptionsDto,
    ) {
        return this.service.getTiposEtiqueta({ ...headersParams, ...dtoIn });
    }

    // ─────────────────────────────────────────────────────────────
    // SAVE
    // ─────────────────────────────────────────────────────────────

    /**
     * Crea o actualiza una etiqueta de producto.
     * isUpdate: false = INSERT, isUpdate: true = UPDATE
     */
    @Post('saveEtiqueta')
    saveEtiqueta(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: SaveEtiquetaDto,
    ) {
        return this.saveService.saveEtiqueta({ ...headersParams, ...dtoIn });
    }

    /**
     * Elimina una etiqueta.
     * Query param: ide_ineta
     */
    @Delete('deleteEtiqueta')
    deleteEtiqueta(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: IdEtiquetaDto,
    ) {
        return this.saveService.deleteEtiqueta({ ...headersParams, ...dtoIn });
    }
}
