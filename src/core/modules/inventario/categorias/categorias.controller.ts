import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { CategoriasService } from './categorias.service';
import { DeleteEtiquetaCategoriaDto } from './dto/delete-etiqueta-categoria.dto';
import { GetEtiquetasCategoriaDto } from './dto/get-etiquetas-categoria.dto';
import { SaveEtiquetasCategoriaDto } from './dto/save-etiquetas-categoria.dto';

@ApiTags('Inventario-Categorias')
@Controller('inventario/categorias')
export class CategoriasController {
  constructor(private readonly categorias: CategoriasService) { }

  @Get('getEtiquetasByCategoria')
  @ApiOperation({ summary: 'Obtener etiquetas de una categoría' })
  getEtiquetasByCategoria(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: GetEtiquetasCategoriaDto,
  ) {
    return this.categorias.getEtiquetasByCategoria({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('saveEtiquetasCategoria')
  @ApiOperation({ summary: 'Guardar etiquetas de una categoría' })
  saveEtiquetasCategoria(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Body() dtoIn: SaveEtiquetasCategoriaDto,
  ) {
    return this.categorias.saveEtiquetasCategoria({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('deleteEtiquetaCategoria')
  @ApiOperation({ summary: 'Eliminar una etiqueta de una categoría' })
  deleteEtiquetaCategoria(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Body() dtoIn: DeleteEtiquetaCategoriaDto,
  ) {
    return this.categorias.deleteEtiquetaCategoria({
      ...headersParams,
      ...dtoIn,
    });
  }
}
