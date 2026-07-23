import { Query, Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { Auth } from 'src/core/auth';

import { QueryOptionsDto } from '../../../../common/dto/query-options.dto';

import { CantonesDto } from './dto/cantones.dto';
import { CedulaDto } from './dto/cedula.dto';
import { RucDto } from './dto/ruc.dto';
import { GeneralLdService } from './general-ld.service';
import { GeneralService } from './general.service';

@ApiTags('Sistema-General')
@Controller('sistema/general')
export class GeneralController {
  constructor(
    private readonly service: GeneralService,
    private readonly serviceLd: GeneralLdService,
  ) { }

  @Get('getListDataPeriodos')
  @ApiOperation({ summary: 'Obtener listado de períodos para selector' })
  @Auth()
  getListDataPeriodos(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.serviceLd.getListDataPeriodos({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getListDataProvincias')
  @ApiOperation({ summary: 'Obtener listado de provincias para selector' })
  @Auth()
  getListDataProvincias(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.serviceLd.getListDataProvincias({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getListDataCantones')
  @ApiOperation({ summary: 'Obtener listado de cantones de una provincia para selector' })
  @Auth()
  getListDataCantones(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: CantonesDto) {
    return this.serviceLd.getListDataCantones({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getListDataTitulosPersona')
  @ApiOperation({ summary: 'Obtener listado de títulos de persona (Sr., Sra., etc.) para selector' })
  @Auth()
  getListDataTitulosPersona(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.serviceLd.getListDataTitulosPersona({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getListDataTiposDireccion')
  @ApiOperation({ summary: 'Obtener listado de tipos de dirección para selector' })
  @Auth()
  getListDataTiposDireccion(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.serviceLd.getListDataTiposDireccion({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getListDataTiposIdentificacion')
  @ApiOperation({ summary: 'Obtener listado de tipos de identificación (cédula, RUC, pasaporte) para selector' })
  @Auth()
  getListDataTiposIdentificacion(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.serviceLd.getListDataTiposIdentificacion({
      ...headersParams,
      ...dtoIn,
    });
  }

  // ================================= VALIDATIONS

  @Get('validateCedula')
  @ApiOperation({ summary: 'Validar número de cédula ecuatoriana' })
  @Auth()
  validateCedula(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: CedulaDto) {
    return this.service.validateCedula(dtoIn.cedula);
  }

  @Get('validateRuc')
  @ApiOperation({ summary: 'Validar número de RUC ecuatoriano' })
  @Auth()
  validateRuc(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RucDto) {
    return this.service.validateRuc(dtoIn);
  }
}
