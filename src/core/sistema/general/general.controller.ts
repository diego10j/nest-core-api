import { Query, Controller, Get } from '@nestjs/common';
import { GeneralService } from './general.service';
import { QueryOptionsDto } from '../../../common/dto/query-options.dto';
import { CantonesDto } from './dto/cantones.dto';
import { CedulaDto } from './dto/cedula.dto';
import { RucDto } from './dto/ruc.dto';
import { GeneralLdService } from './general-ld.service';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

@Controller('sistema/general')
export class GeneralController {
  constructor(private readonly service: GeneralService,
    private readonly serviceLd: GeneralLdService) { }


  @Get('getListDataPeriodos')
  // @Auth()
  getListDataPeriodos(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: QueryOptionsDto
  ) {
    return this.serviceLd.getListDataPeriodos({
      ...headersParams,
      ...dtoIn
  });
  }


  @Get('getListDataProvincias')
  // @Auth()
  getListDataProvincias(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: QueryOptionsDto
  ) {
    return this.serviceLd.getListDataProvincias({
      ...headersParams,
      ...dtoIn
  });
  }

  @Get('getListDataCantones')
  // @Auth()
  getListDataCantones(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: CantonesDto
  ) {
    return this.serviceLd.getListDataCantones({
      ...headersParams,
      ...dtoIn
  });
  }


  @Get('getListDataTitulosPersona')
  // @Auth()
  getListDataTitulosPersona(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: QueryOptionsDto
  ) {
    return this.serviceLd.getListDataTitulosPersona({
      ...headersParams,
      ...dtoIn
  });
  }

  @Get('getListDataTiposDireccion')
  // @Auth()
  getListDataTiposDireccion(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: QueryOptionsDto
  ) {
    return this.serviceLd.getListDataTiposDireccion({
      ...headersParams,
      ...dtoIn
  });
  }

  @Get('getListDataTiposIdentificacion')
  // @Auth()
  getListDataTiposIdentificacion(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: QueryOptionsDto
  ) {
    return this.serviceLd.getListDataTiposIdentificacion({
      ...headersParams,
      ...dtoIn
  });
  }



  // ================================= VALIDATIONS

  @Get('validateCedula')
  // @Auth()
  validateCedula(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: CedulaDto
  ) {
    return this.service.validateCedula(dtoIn.cedula);
  }

  @Get('validateRuc')
  // @Auth()
  validateRuc(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: RucDto
  ) {
    return this.service.validateRuc(dtoIn);
  }



}
