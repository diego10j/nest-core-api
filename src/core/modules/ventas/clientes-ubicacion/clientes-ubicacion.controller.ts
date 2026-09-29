import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { Auth } from 'src/core/auth';

import { ClientesUbicacionService } from './clientes-ubicacion.service';
import { GetClientesUbicacionDto } from './dto/get-clientes-ubicacion.dto';

@ApiTags('Ventas-ClientesUbicacion')
@Controller('ventas/clientes-ubicacion')
export class ClientesUbicacionController {
  constructor(private readonly service: ClientesUbicacionService) {}

  @Get('getDashboardUbicacion')
  @ApiOperation({
    summary:
      'Dashboard de clientes por ubicación: totales, clientes por provincia (mapa) y transportes por provincia del cliente',
  })
  @Auth()
  getDashboardUbicacion(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetClientesUbicacionDto) {
    return this.service.getDashboardUbicacion({ ...headersParams, ...dtoIn });
  }

  @Get('getDashboardGeo')
  @ApiOperation({
    summary:
      'Dashboard de coordenadas GPS de clientes: cobertura, calidad de los datos, distancia a la empresa y más lejanos',
  })
  @Auth()
  getDashboardGeo(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetClientesUbicacionDto) {
    return this.service.getDashboardGeo({ ...headersParams, ...dtoIn });
  }

  @Get('getPuntosClientes')
  @ApiOperation({ summary: 'Clientes con coordenadas válidas (un punto por cliente) para el mapa, máximo 8000' })
  @Auth()
  getPuntosClientes(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetClientesUbicacionDto) {
    return this.service.getPuntosClientes({ ...headersParams, ...dtoIn });
  }

  @Get('getDireccionesGeo')
  @ApiOperation({ summary: 'Direcciones de clientes con su GPS y la validación de las coordenadas (DataTableQuery)' })
  @Auth()
  getDireccionesGeo(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetClientesUbicacionDto) {
    return this.service.getDireccionesGeo({ ...headersParams, ...dtoIn });
  }

  @Get('getCantonesUbicacion')
  @ApiOperation({ summary: 'Clientes y facturado por cantón (DataTableQuery), opcionalmente de una provincia' })
  @Auth()
  getCantonesUbicacion(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetClientesUbicacionDto) {
    return this.service.getCantonesUbicacion({ ...headersParams, ...dtoIn });
  }

  @Get('getClientesUbicacion')
  @ApiOperation({ summary: 'Clientes con su ubicación y lo facturado en el período (DataTableQuery)' })
  @Auth()
  getClientesUbicacion(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetClientesUbicacionDto) {
    return this.service.getClientesUbicacion({ ...headersParams, ...dtoIn });
  }
}
