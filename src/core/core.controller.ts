import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { SearchTableDto } from 'src/common/dto/search-table.dto';

import {
  TableQueryDto,
  SaveListDto,
  UniqueDto,
  DeleteDto,
  SeqTableDto,
  ListDataValuesDto,
  FindByUuidDto,
  FindByIdDto,
  UpdateColumnsDto,
} from './connection/dto';
import { ColumnsTableDto } from './connection/dto/columns-table.dto';
import { TreeDto } from './connection/dto/tree-dto';
import { CoreService } from './core.service';

@ApiTags('Core')
@Controller('core')
export class CoreController {
  constructor(private readonly service: CoreService) { }

  @Get('getListDataValues')
  @ApiOperation({ summary: 'Obtener valores de lista (combo) desde una tabla de catálogo' })
  //@Auth()
  getListDataValues(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: ListDataValuesDto) {
    return this.service.getListDataValues({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTableQueryByUuid')
  @ApiOperation({ summary: 'Obtener registro de tabla por UUID' })
  //@Auth()
  getTableQueryByUuid(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: FindByUuidDto) {
    return this.service.getTableQueryByUuid({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTableQueryById')
  @ApiOperation({ summary: 'Obtener registro de tabla por ID' })
  //@Auth()
  getTableQueryById(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: FindByIdDto) {
    return this.service.getTableQueryById({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTableQuery')
  @ApiOperation({ summary: 'Obtener datos de tabla genérica con filtros y paginación' })
  //@Auth()
  getTableQuery(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TableQueryDto) {
    return this.service.getTableQuery({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('save')
  @ApiOperation({ summary: 'Crear o actualizar registro en una tabla genérica' })
  //@Auth()
  save(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SaveListDto) {
    return this.service.save({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('isUnique')
  @ApiOperation({ summary: 'Verificar si un valor es único en una columna de tabla' })
  //@Auth()
  isUnique(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: UniqueDto) {
    return this.service.isUnique({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('canDelete')
  @ApiOperation({ summary: 'Verificar si un registro puede eliminarse (sin dependencias)' })
  //@Auth()
  isDelete(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: DeleteDto) {
    return this.service.canDelete({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('getSeqTable')
  @ApiOperation({ summary: 'Obtener el siguiente valor de secuencia de una tabla' })
  //@Auth()
  getSeqTable(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SeqTableDto) {
    return this.service.getSeqTable({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('findByUuid')
  @ApiOperation({ summary: 'Buscar registro por UUID' })
  //@Auth()
  findByUuid(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: FindByUuidDto) {
    return this.service.findByUuid({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('findById')
  @ApiOperation({ summary: 'Buscar registro por ID' })
  //@Auth()
  findById(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: FindByIdDto) {
    return this.service.findById({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('search')
  @ApiOperation({ summary: 'Buscar registros en tabla por texto (autocomplete genérico)' })
  //@Auth()
  search(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: SearchTableDto) {
    return this.service.search({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTableColumns')
  @ApiOperation({ summary: 'Obtener metadatos de columnas de una tabla' })
  //@Auth()
  getTableColumns(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: ColumnsTableDto) {
    return this.service.getTableColumns({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('refreshTableColumns')
  @ApiOperation({ summary: 'Refrescar caché de metadatos de columnas de una tabla' })
  //@Auth()
  refreshTableColumns(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: ColumnsTableDto) {
    return this.service.refreshTableColumns({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('clearCacheRedis')
  @ApiOperation({ summary: 'Limpiar toda la caché Redis del servidor' })
  //@Auth()
  clearTableColumnsCache() {
    return this.service.clearCacheRedis();
  }

  @Get('getTreeModel')
  @ApiOperation({ summary: 'Obtener árbol jerárquico de una tabla con estructura padre-hijo' })
  //@Auth()
  getTreeModel(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TreeDto) {
    return this.service.getTreeModel({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('updateColumns')
  @ApiOperation({ summary: 'Actualizar columnas específicas de un registro de tabla' })
  //@Auth()
  updateColumns(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: UpdateColumnsDto) {
    return this.service.updateColumns({
      ...headersParams,
      ...dtoIn,
    });
  }
}
