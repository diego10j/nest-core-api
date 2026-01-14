import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { SearchDto } from 'src/common/dto/search.dto';
import { UuidDto } from 'src/common/dto/uuid.dto';

import { QueryOptionsDto } from '../../../../common/dto/query-options.dto';
import { SaveDto } from '../../../../common/dto/save.dto';

import { ClientesService } from './clientes.service';
import { ExistClienteDto } from './dto/exist-client.dto';
import { IdClienteDto } from './dto/id-cliente.dto';
import { TrnClienteDto } from './dto/trn-cliente.dto';
import { ValidaWhatsAppCliente } from './dto/valida-whatsapp-cliente.dto';
import { VentasMensualesClienteDto } from './dto/ventas-mensuales.dto';

@Controller('ventas/clientes')
export class ClientesController {
  constructor(private readonly service: ClientesService) {}

  @Get('getCliente')
  // @Auth()
  getCliente(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: UuidDto) {
    return this.service.getCliente({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getClientes')
  // @Auth()
  getClientes(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.getClientes({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getSaldosClientes')
  // @Auth()
  getSaldosClientes(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.getSaldosClientes({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTrnCliente')
  // @Auth()
  getTrnCliente(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TrnClienteDto) {
    return this.service.getTrnCliente({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getDetalleVentasCliente')
  // @Auth()
  getDetalleVentasCliente(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TrnClienteDto) {
    return this.service.getDetalleVentasCliente({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getSaldo')
  // @Auth()
  getSaldo(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdClienteDto) {
    return this.service.getSaldo({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getProductosCliente')
  // @Auth()
  getProductosCliente(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdClienteDto) {
    return this.service.getProductosCliente({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getVentasMensuales')
  // @Auth()
  getVentasMensuales(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: VentasMensualesClienteDto) {
    return this.service.getVentasMensuales({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('save')
  // @Auth()
  save(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SaveDto) {
    return this.service.save({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getVentasConUtilidad')
  // @Auth()
  getVentasConUtilidad(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TrnClienteDto) {
    return this.service.getVentasConUtilidad({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getDireccionesCliente')
  // @Auth()
  getDireccionesCliente(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdClienteDto) {
    return this.service.getDireccionesCliente({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getContactosCliente')
  // @Auth()
  getContactosCliente(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdClienteDto) {
    return this.service.getContactosCliente({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('searchCliente')
  // @Auth()
  searchCliente(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: SearchDto) {
    return this.service.searchCliente({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('existCliente')
  // @Auth()
  existCliente(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: ExistClienteDto) {
    return this.service.existCliente({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('validarWhatsAppCliente')
  // @Auth()
  validarWhatsAppCliente(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: ValidaWhatsAppCliente) {
    return this.service.validarWhatsAppCliente({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('actualizarVendedorClientesInactivos')
  // @Auth()
  actualizarVendedorClientesInactivos(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Body() dtoIn: { ideVgvenDefault?: number },
  ) {
    return this.service.actualizarVendedorClientesInactivos({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getSegumientoClientes')
  // @Auth()
  getSegumientoClientes(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.getSegumientoClientes({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getClientesAContactar')
  // @Auth()
  getClientesAContactar(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.getClientesAContactar({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getHistoricoVendedoresCliente')
  // @Auth()
  getHistoricoVendedoresCliente(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdClienteDto) {
    return this.service.getHistoricoVendedoresCliente({
      ...headersParams,
      ...dtoIn,
    });
  }
}
