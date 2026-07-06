import { Body, Controller, Delete, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { SearchDto } from 'src/common/dto/search.dto';
import { UuidDto } from 'src/common/dto/uuid.dto';

import { QueryOptionsDto } from '../../../../common/dto/query-options.dto';
import { SaveDto } from '../../../../common/dto/save.dto';

import { ClientesSaveService } from './clientes-save.service';
import { ClientesService } from './clientes.service';
import { ExistClienteDto } from './dto/exist-client.dto';
import { GetClientesDto } from './dto/get-clientes.dto';
import { GetSaldosClientesDto } from './dto/get-saldos-clientes.dto';
import { IdClienteDto } from './dto/id-cliente.dto';
import { SaveDireccionPersonaDto } from './dto/save-direccion-persona.dto';
import { SetActivoDireccionDto } from './dto/set-activo-direccion.dto';
import { TrnClienteDto } from './dto/trn-cliente.dto';
import { ValidaWhatsAppCliente } from './dto/valida-whatsapp-cliente.dto';
import { VentasMensualesClienteDto } from './dto/ventas-mensuales.dto';

@ApiTags('Ventas-Clientes')
@ApiBearerAuth('BearerAuth')
@Controller('ventas/clientes')
export class ClientesController {
  constructor(
    private readonly service: ClientesService,
    private readonly saveService: ClientesSaveService,
  ) { }

  @Get('getCliente')
  @ApiOperation({ summary: 'Obtener cliente por UUID' })
  @ApiResponse({ status: 200, description: 'Datos del cliente' })
  getCliente(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: UuidDto) {
    return this.service.getCliente({ ...headersParams, ...dtoIn });
  }

  @Get('getClientes')
  @ApiOperation({ summary: 'Listar clientes con filtros y paginación' })
  @ApiResponse({ status: 200, description: 'Lista paginada de clientes' })
  getClientes(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetClientesDto) {
    return this.service.getClientes({ ...headersParams, ...dtoIn });
  }

  @Get('getSaldosClientes')
  @ApiOperation({ summary: 'Obtener saldos pendientes de clientes' })
  @ApiResponse({ status: 200, description: 'Lista de saldos pendientes' })
  getSaldosClientes(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetSaldosClientesDto) {

    return this.service.getSaldosClientes({ ...headersParams, ...dtoIn });

  }

  @Get('getTrnCliente')
  @ApiOperation({ summary: 'Obtener transacciones de un cliente por período' })
  @ApiResponse({ status: 200, description: 'Transacciones del cliente' })
  getTrnCliente(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TrnClienteDto) {
    return this.service.getTrnCliente({ ...headersParams, ...dtoIn });
  }

  @Get('getDetalleVentasCliente')
  @ApiOperation({ summary: 'Obtener detalle de ventas de un cliente por período' })
  @ApiResponse({ status: 200, description: 'Detalle de ventas' })
  getDetalleVentasCliente(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TrnClienteDto) {
    return this.service.getDetalleVentasCliente({ ...headersParams, ...dtoIn });
  }

  @Get('getSaldo')
  @ApiOperation({ summary: 'Obtener saldo actual de un cliente' })
  @ApiResponse({ status: 200, description: 'Saldo actual del cliente' })
  getSaldo(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdClienteDto) {
    return this.service.getSaldo({ ...headersParams, ...dtoIn });
  }

  @Get('getProductosCliente')
  @ApiOperation({ summary: 'Listar productos comprados por un cliente' })
  @ApiResponse({ status: 200, description: 'Productos comprados' })
  getProductosCliente(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdClienteDto) {
    return this.service.getProductosCliente({ ...headersParams, ...dtoIn });
  }

  @Get('getVentasMensuales')
  @ApiOperation({ summary: 'Obtener ventas mensuales de un cliente' })
  @ApiResponse({ status: 200, description: 'Ventas mensuales' })
  getVentasMensuales(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: VentasMensualesClienteDto) {
    return this.service.getVentasMensuales({ ...headersParams, ...dtoIn });
  }

  @Post('save')
  @ApiOperation({ summary: 'Crear o actualizar un cliente' })
  @ApiResponse({ status: 200, description: 'Cliente guardado exitosamente' })
  save(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SaveDto) {
    return this.service.save({ ...headersParams, ...dtoIn });
  }

  @Get('getKpiTrnCliente')
  @ApiOperation({ summary: 'Obtener KPIs de transacciones de un cliente por período' })
  @ApiResponse({ status: 200, description: 'KPIs de transacciones' })
  getKpiTrnCliente(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TrnClienteDto) {
    return this.service.getKpiTrnCliente({ ...headersParams, ...dtoIn });
  }

  @Get('getKpiProductosCliente')
  @ApiOperation({ summary: 'Obtener KPIs de productos comprados por un cliente' })
  @ApiResponse({ status: 200, description: 'KPIs de productos del cliente' })
  getKpiProductosCliente(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdClienteDto) {
    return this.service.getKpiProductosCliente({ ...headersParams, ...dtoIn });
  }

  @Get('getVentasConUtilidad')
  @ApiOperation({ summary: 'Obtener ventas con cálculo de utilidad por cliente' })
  @ApiResponse({ status: 200, description: 'Ventas con utilidad' })
  getVentasConUtilidad(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TrnClienteDto) {
    return this.service.getVentasConUtilidad({ ...headersParams, ...dtoIn });
  }

  @Get('getDireccionesCliente')
  @ApiOperation({ summary: 'Obtener direcciones registradas de un cliente' })
  @ApiResponse({ status: 200, description: 'Direcciones del cliente' })
  getDireccionesCliente(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdClienteDto) {
    return this.service.getDireccionesCliente({ ...headersParams, ...dtoIn });
  }

  @Get('getContactosCliente')
  @ApiOperation({ summary: 'Obtener contactos registrados de un cliente' })
  @ApiResponse({ status: 200, description: 'Contactos del cliente' })
  getContactosCliente(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdClienteDto) {
    return this.service.getContactosCliente({ ...headersParams, ...dtoIn });
  }

  @Get('searchCliente')
  @ApiOperation({ summary: 'Buscar clientes por nombre o identificación (autocomplete)' })
  @ApiResponse({ status: 200, description: 'Resultados de búsqueda' })
  searchCliente(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: SearchDto) {
    return this.service.searchCliente({ ...headersParams, ...dtoIn });
  }

  @Get('existCliente')
  @ApiOperation({ summary: 'Verificar si existe un cliente por identificación' })
  @ApiResponse({ status: 200, description: 'Resultado de verificación' })
  existCliente(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: ExistClienteDto) {
    return this.service.existCliente({ ...headersParams, ...dtoIn });
  }

  @Get('validarWhatsAppCliente')
  @ApiOperation({ summary: 'Validar número de WhatsApp del cliente' })
  @ApiResponse({ status: 200, description: 'Validación de WhatsApp' })
  validarWhatsAppCliente(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: ValidaWhatsAppCliente) {
    return this.service.validarWhatsAppCliente({ ...headersParams, ...dtoIn });
  }

  @Post('actualizarVendedorClientesInactivos')
  @ApiOperation({ summary: 'Actualizar vendedor asignado en clientes inactivos' })
  @ApiResponse({ status: 200, description: 'Vendedores actualizados' })
  actualizarVendedorClientesInactivos(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: { ideVgvenDefault?: number }) {
    return this.service.actualizarVendedorClientesInactivos({ ...headersParams, ...dtoIn });
  }

  @Get('getSegumientoClientes')
  @ApiOperation({ summary: 'Obtener tabla de seguimiento de clientes' })
  @ApiResponse({ status: 200, description: 'Tabla de seguimiento' })
  getSegumientoClientes(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.getSegumientoClientes({ ...headersParams, ...dtoIn });
  }

  @Get('getClientesAContactar')
  @ApiOperation({ summary: 'Listar clientes pendientes de contacto' })
  @ApiResponse({ status: 200, description: 'Clientes pendientes' })
  getClientesAContactar(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: QueryOptionsDto) {
    return this.service.getClientesAContactar({ ...headersParams, ...dtoIn });
  }

  @Get('getHistoricoVendedoresCliente')
  @ApiOperation({ summary: 'Obtener historial de vendedores asignados a un cliente' })
  @ApiResponse({ status: 200, description: 'Historial de vendedores' })
  getHistoricoVendedoresCliente(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdClienteDto) {
    return this.service.getHistoricoVendedoresCliente({ ...headersParams, ...dtoIn });
  }

  @Post('saveDireccionPersona')
  @ApiOperation({ summary: 'Crear o actualizar una dirección o contacto de cliente' })
  @ApiResponse({ status: 200, description: 'Dirección/contacto guardado exitosamente' })
  saveDireccionPersona(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SaveDireccionPersonaDto) {
    return this.saveService.saveDireccionPersona({ ...headersParams, ...dtoIn });
  }

  @Post('setActivoDireccionPersona')
  @ApiOperation({ summary: 'Activar o desactivar una dirección o contacto' })
  @ApiResponse({ status: 200, description: 'Estado actualizado exitosamente' })
  setActivoDireccionPersona(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SetActivoDireccionDto) {
    return this.saveService.setActivoDireccionPersona({ ...headersParams, ...dtoIn });
  }

  @Delete('deleteDireccionPersona')
  @ApiOperation({ summary: 'Eliminar una dirección o contacto de cliente' })
  @ApiResponse({ status: 200, description: 'Dirección/contacto eliminado exitosamente' })
  deleteDireccionPersona(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SetActivoDireccionDto) {
    return this.saveService.deleteDireccionPersona({ ...headersParams, ...dtoIn });
  }
}
