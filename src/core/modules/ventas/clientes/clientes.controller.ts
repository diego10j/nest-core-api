import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
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
import { GetClientesDto } from './dto/get-clientes.dto';

@ApiTags('Ventas-Clientes')
@Controller('ventas/clientes')
export class ClientesController {
  constructor(private readonly service: ClientesService) { }

  @Get('getCliente')
  @ApiOperation({ summary: 'Obtener cliente por UUID' })
  // @Auth()
  getCliente(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: UuidDto) {
    return this.service.getCliente({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getClientes')
  @ApiOperation({ summary: 'Listar clientes con filtros y paginación' })
  // @Auth()
  getClientes(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetClientesDto) {
    return this.service.getClientes({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getSaldosClientes')
  @ApiOperation({ summary: 'Obtener saldos pendientes de clientes' })
  // @Auth()
  getSaldosClientes(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.getSaldosClientes({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTrnCliente')
  @ApiOperation({ summary: 'Obtener transacciones de un cliente por período' })
  // @Auth()
  getTrnCliente(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TrnClienteDto) {
    return this.service.getTrnCliente({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getDetalleVentasCliente')
  @ApiOperation({ summary: 'Obtener detalle de ventas de un cliente por período' })
  // @Auth()
  getDetalleVentasCliente(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TrnClienteDto) {
    return this.service.getDetalleVentasCliente({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getSaldo')
  @ApiOperation({ summary: 'Obtener saldo actual de un cliente' })
  // @Auth()
  getSaldo(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdClienteDto) {
    return this.service.getSaldo({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getProductosCliente')
  @ApiOperation({ summary: 'Listar productos comprados por un cliente' })
  // @Auth()
  getProductosCliente(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdClienteDto) {
    return this.service.getProductosCliente({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getVentasMensuales')
  @ApiOperation({ summary: 'Obtener ventas mensuales de un cliente' })
  // @Auth()
  getVentasMensuales(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: VentasMensualesClienteDto) {
    return this.service.getVentasMensuales({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('save')
  @ApiOperation({ summary: 'Crear o actualizar un cliente' })
  // @Auth()
  save(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SaveDto) {
    return this.service.save({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getVentasConUtilidad')
  @ApiOperation({ summary: 'Obtener ventas con cálculo de utilidad por cliente' })
  // @Auth()
  getVentasConUtilidad(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TrnClienteDto) {
    return this.service.getVentasConUtilidad({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getDireccionesCliente')
  @ApiOperation({ summary: 'Obtener direcciones registradas de un cliente' })
  // @Auth()
  getDireccionesCliente(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdClienteDto) {
    return this.service.getDireccionesCliente({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getContactosCliente')
  @ApiOperation({ summary: 'Obtener contactos registrados de un cliente' })
  // @Auth()
  getContactosCliente(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdClienteDto) {
    return this.service.getContactosCliente({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('searchCliente')
  @ApiOperation({ summary: 'Buscar clientes por nombre o identificación (autocomplete)' })
  // @Auth()
  searchCliente(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: SearchDto) {
    return this.service.searchCliente({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('existCliente')
  @ApiOperation({ summary: 'Verificar si existe un cliente por identificación' })
  // @Auth()
  existCliente(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: ExistClienteDto) {
    return this.service.existCliente({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('validarWhatsAppCliente')
  @ApiOperation({ summary: 'Validar número de WhatsApp del cliente' })
  // @Auth()
  validarWhatsAppCliente(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: ValidaWhatsAppCliente) {
    return this.service.validarWhatsAppCliente({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Post('actualizarVendedorClientesInactivos')
  @ApiOperation({ summary: 'Actualizar vendedor asignado en clientes inactivos' })
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
  @ApiOperation({ summary: 'Obtener tabla de seguimiento de clientes' })
  // @Auth()
  getSegumientoClientes(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.getSegumientoClientes({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getClientesAContactar')
  @ApiOperation({ summary: 'Listar clientes pendientes de contacto' })
  // @Auth()
  getClientesAContactar(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.getClientesAContactar({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getHistoricoVendedoresCliente')
  @ApiOperation({ summary: 'Obtener historial de vendedores asignados a un cliente' })
  // @Auth()
  getHistoricoVendedoresCliente(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdClienteDto) {
    return this.service.getHistoricoVendedoresCliente({
      ...headersParams,
      ...dtoIn,
    });
  }
}
