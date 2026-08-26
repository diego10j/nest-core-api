import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { RangoFechasDto } from 'src/common/dto/rango-fechas.dto';
import { Auth } from 'src/core/auth';

import { TopRutasDto } from './dto/top-rutas.dto';
import { TopTransportistasDto } from './dto/top-transportistas.dto';
import { TransportesDiariaDto } from './dto/transportes-diaria.dto';
import { TransportesMensualDto } from './dto/transportes-mensual.dto';
import { TransportesBiService } from './transportes-bi.service';

@ApiTags('Transportes-DataBI')
@Controller('ventas/transportes/data-bi')
export class TransportesBiController {
  constructor(private readonly service: TransportesBiService) {}

  @Get('getKPIsEnvios')
  @ApiOperation({ summary: 'Obtener KPIs principales de envíos (total, entregados, % a tiempo, flete)' })
  @Auth()
  getKPIsEnvios(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
    return this.service.getKPIsEnvios({ ...headersParams, ...dtoIn });
  }

  @Get('getVariacionDiariaEnvios')
  @ApiOperation({ summary: 'Obtener variación diaria de envíos' })
  @Auth()
  getVariacionDiariaEnvios(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TransportesDiariaDto) {
    return this.service.getVariacionDiariaEnvios({ ...headersParams, ...dtoIn });
  }

  @Get('getEnviosMensuales')
  @ApiOperation({ summary: 'Obtener envíos mensuales en un año (volumen y tiempo de entrega)' })
  @Auth()
  getEnviosMensuales(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TransportesMensualDto) {
    return this.service.getEnviosMensuales({ ...headersParams, ...dtoIn });
  }

  @Get('getEnviosPorTransportista')
  @ApiOperation({ summary: 'Obtener top de transportistas por número de envíos en un período' })
  @Auth()
  getEnviosPorTransportista(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TopTransportistasDto) {
    return this.service.getEnviosPorTransportista({ ...headersParams, ...dtoIn });
  }

  @Get('getEnviosPorEstado')
  @ApiOperation({ summary: 'Obtener distribución de envíos por estado de envío' })
  @Auth()
  getEnviosPorEstado(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
    return this.service.getEnviosPorEstado({ ...headersParams, ...dtoIn });
  }

  @Get('getEnviosPorRuta')
  @ApiOperation({ summary: 'Obtener top de rutas por número de paradas en un período' })
  @Auth()
  getEnviosPorRuta(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TopRutasDto) {
    return this.service.getEnviosPorRuta({ ...headersParams, ...dtoIn });
  }

  @Get('getResumenEnviosPeriodos')
  @ApiOperation({ summary: 'Obtener resumen comparativo de envíos por año' })
  @Auth()
  getResumenEnviosPeriodos(@AppHeaders() headersParams: HeaderParamsDto) {
    return this.service.getResumenEnviosPeriodos(headersParams);
  }
}
