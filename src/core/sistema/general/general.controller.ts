import { Body, Controller, Post } from '@nestjs/common';
import { GeneralService } from './general.service';
import { ServiceDto } from '../../../common/dto/service.dto';
import { CantonesDto } from './dto/cantones.dto';
import { CedulaDto } from './dto/cedula.dto';
import { RucDto } from './dto/ruc.dto';
import { GeneralLdService } from './general-ld.service';

@Controller('sistema/general')
export class GeneralController {
  constructor(private readonly service: GeneralService,
    private readonly serviceLd: GeneralLdService) { }


  @Post('getListDataPeriodos')
  // @Auth()
  getListDataPeriodos(
    @Body() dtoIn: ServiceDto
  ) {
    return this.serviceLd.getListDataPeriodos(dtoIn);
  }


  @Post('getListDataProvincias')
  // @Auth()
  getListDataProvincias(
    @Body() dtoIn: ServiceDto
  ) {
    return this.serviceLd.getListDataProvincias(dtoIn);
  }

  @Post('getListDataCantones')
  // @Auth()
  getListDataCantones(
    @Body() dtoIn: CantonesDto
  ) {
    return this.serviceLd.getListDataCantones(dtoIn);
  }


  @Post('getListDataTitulosPersona')
  // @Auth()
  getListDataTitulosPersona(
    @Body() dtoIn: ServiceDto
  ) {
    return this.serviceLd.getListDataTitulosPersona(dtoIn);
  }

  @Post('getListDataTiposDireccion')
  // @Auth()
  getListDataTiposDireccion(
    @Body() dtoIn: ServiceDto
  ) {
    return this.serviceLd.getListDataTiposDireccion(dtoIn);
  }

  @Post('getListDataTiposIdentificacion')
  // @Auth()
  getListDataTiposIdentificacion(
    @Body() dtoIn: ServiceDto
  ) {
    return this.serviceLd.getListDataTiposIdentificacion(dtoIn);
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
