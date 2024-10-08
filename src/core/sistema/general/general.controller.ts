import { Body, Controller, Post } from '@nestjs/common';
import { GeneralService } from './general.service';
import { ServiceDto } from '../../../common/dto/service.dto';
import { CantonesDto } from './dto/cantones.dto';
import { CedulaDto } from './dto/cedula.dto';
import { RucDto } from './dto/ruc.dto';

@Controller('sistema/general')
export class GeneralController {
  constructor(private readonly service: GeneralService) { }


  @Post('getListDataPeriodos')
  // @Auth()
  getListDataPeriodos(
    @Body() dtoIn: ServiceDto
  ) {
    return this.service.getListDataPeriodos(dtoIn);
  }


  @Post('getListDataProvincias')
  // @Auth()
  getListDataProvincias(
    @Body() dtoIn: ServiceDto
  ) {
    return this.service.getListDataProvincias(dtoIn);
  }

  @Post('getListDataCantones')
  // @Auth()
  getListDataCantones(
    @Body() dtoIn: CantonesDto
  ) {
    return this.service.getListDataCantones(dtoIn);
  }


  @Post('getListDataTitulosPersona')
  // @Auth()
  getListDataTitulosPersona(
    @Body() dtoIn: ServiceDto
  ) {
    return this.service.getListDataTitulosPersona(dtoIn);
  }

  @Post('getListDataTiposDireccion')
  // @Auth()
  getListDataTiposDireccion(
    @Body() dtoIn: ServiceDto
  ) {
    return this.service.getListDataTiposDireccion(dtoIn);
  }



  // ================================= VALIDATIONS

  @Post('validateCedula')
  // @Auth()
  validateCedula(
    @Body() dtoIn: CedulaDto
  ) {
    return this.service.validateCedula(dtoIn.cedula);
  }

  @Post('validateRuc')
  // @Auth()
  validateRuc(
    @Body() dtoIn: RucDto
  ) {
    return this.service.validateRuc(dtoIn);
  }



}
