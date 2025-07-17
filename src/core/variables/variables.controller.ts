import { Controller, Get, Post, Query } from '@nestjs/common';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { GetVariableDto } from './dto/get-variable.dto';
import { VariablesService } from './variables.service';



@Controller('sistema/variables')
export class VariablesController {
  constructor(private readonly service: VariablesService) { }




  @Get('getVariable')
  // @Auth()
  getMovimientosBodega(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: GetVariableDto
  ) {
    return this.service.getVariable({
      ...headersParams,
      ...dtoIn
    });
  }


  @Get('getVariableEmpresa')
  // @Auth()
  getVariableEmpresa(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: GetVariableDto
  ) {
    return this.service.getVariableEmpresa({
      ...headersParams,
      ...dtoIn
    });
  }


  
  @Post('updateVariables')
  //@Auth()
  updateVariables(
    @AppHeaders() headersParams: HeaderParamsDto
  ) {
    return this.service.updateVariables(headersParams);
  }


}