import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

import { ActualizarVariableDto } from './dto/actualizar-variable.dto';
import { GetConfiguracionTablaVariableDto } from './dto/get-configuracion-tabla-variable.dto';
import { GetVariableDto } from './dto/get-variable.dto';
import { GetVariablesModuloDto } from './dto/get-variables-modulo.dto';
import { SaveModuloDto } from './dto/save-modulo.dto';
import { SaveVariableDto } from './dto/save-variable.dto';
import { ModulosSistemaService } from './modulos-sistema.service';
import { VariablesService } from './variables.service';

@ApiTags('Sistema-Variables')
@Controller('sistema/variables')
export class VariablesController {
  constructor(
    private readonly service: VariablesService,
    private readonly modulosService: ModulosSistemaService,
  ) { }

  @Get('getVariable')
  @ApiOperation({ summary: 'Obtener valor de una variable del sistema (texto plano)' })
  // @Auth()
  getVariable(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetVariableDto) {
    return this.service.getVariable({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getVariableDetail')
  @ApiOperation({ summary: 'Obtener detalle completo de una variable: valor, descripcion, scope, cache' })
  // @Auth()
  getVariableDetail(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetVariableDto) {
    return this.service.getVariableDetail({
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

  @Post('saveVariable')
  @ApiOperation({ summary: 'Guardar o actualizar una variable del sistema' })
  // @Auth()
  saveVariable(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SaveVariableDto) {
    return this.service.saveVariable({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('actualizarVariable')
  @ApiOperation({ summary: 'Actualizar valor de variable por nombre (global o por empresa)' })
  // @Auth()
  actualizarVariable(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: ActualizarVariableDto) {
    return this.service.actualizarVariable({
      ...headersParams,
      ...dtoIn,
    });
  }

    @Get('getModulosSistema')
    @ApiOperation({ summary: 'Obtener listado de modulos del sistema' })
    // @Auth()
    getModulosSistema(@AppHeaders() _h: HeaderParamsDto) {
        return this.service.getModulosSistema();
    }

  @Get('getVariablesModulo')
  @ApiOperation({ summary: 'Obtener variables de parametrizacion filtradas por modulo' })
  // @Auth()
  getVariablesModulo(@AppHeaders() headersParams: HeaderParamsDto, @Query() dto: GetVariablesModuloDto) {
    return this.service.getVariablesModulo({
      ...headersParams,
      ...dto,
    });
  }

  @Get('getConfiguracionTablaVariable')
  @ApiOperation({ summary: 'Obtener registros de tabla de referencia configurada en una variable' })
  // @Auth()
  getConfiguracionTablaVariable(@AppHeaders() headersParams: HeaderParamsDto, @Query() dto: GetConfiguracionTablaVariableDto) {
    return this.service.getConfiguracionTablaVariable({
      ...headersParams,
      ...dto,
    });
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
