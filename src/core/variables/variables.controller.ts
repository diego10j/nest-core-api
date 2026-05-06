import { Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { GetVariableDto } from './dto/get-variable.dto';
import { VariablesService } from './variables.service';

@ApiTags('Sistema-Variables')
@Controller('sistema/variables')
export class VariablesController {
  constructor(private readonly service: VariablesService) {}

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
}
