import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

import { ModulosSistemaService } from './modulos-sistema.service';
import { SaveModuloDto } from './dto/save-modulo.dto';
import { GetVariableDto } from './dto/get-variable.dto';
import { VariablesService } from './variables.service';

@ApiTags('Sistema-Variables')
@Controller('sistema/variables')
export class VariablesController {
  constructor(
    private readonly service: VariablesService,
    private readonly modulosService: ModulosSistemaService,
  ) {}

  @Get('getVariable')
  @ApiOperation({ summary: 'Obtener valor de una variable del sistema' })
  // @Auth()
  getMovimientosBodega(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetVariableDto) {
    return this.service.getVariable({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getVariableEmpresa')
  @ApiOperation({ summary: 'Obtener valor de una variable del sistema a nivel de empresa' })
  // @Auth()
  getVariableEmpresa(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetVariableDto) {
    return this.service.getVariableEmpresa({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('updateVariables')
  @ApiOperation({ summary: 'Recargar variables del sistema desde base de datos' })
  //@Auth()
  updateVariables(@AppHeaders() headersParams: HeaderParamsDto) {
    return this.service.updateVariables(headersParams);
  }

  @Get('getModulosSistema')
  @ApiOperation({ summary: 'Obtener listado de modulos del sistema' })
  // @Auth()
  getModulosSistema() {
    return this.service.getModulosSistema();
  }

  @Get('getVariablesModulo')
  @ApiOperation({ summary: 'Obtener variables de parametrizacion filtradas por modulo' })
  // @Auth()
  getVariablesModulo(@Query('ideModu') ideModu: number) {
    return this.service.getVariablesModulo(ideModu);
  }

  @Get('getListDataModulo')
  @ApiOperation({ summary: 'Obtener listado de modulos para dropdown' })
  // @Auth()
  getListDataModulo(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.modulosService.getListData({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTableQueryModulo')
  @ApiOperation({ summary: 'Obtener registros de modulos con paginacion' })
  // @Auth()
  getTableQueryModulo(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.modulosService.getTableQuery({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('saveModulo')
  @ApiOperation({ summary: 'Guardar o actualizar un modulo del sistema' })
  // @Auth()
  saveModulo(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SaveModuloDto) {
    return this.modulosService.save({
      ...headersParams,
      ...dtoIn,
    });
  }
}
