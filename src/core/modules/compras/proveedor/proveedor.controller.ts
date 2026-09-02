import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { SaveDto } from 'src/common/dto/save.dto';
import { SearchDto } from 'src/common/dto/search.dto';
import { UuidDto } from 'src/common/dto/uuid.dto';
import { Auth } from 'src/core/auth';

import { ComprasMensualesProveedorDto } from './dto/compras-mensuales-proveedor.dto';
import { SetCuentaContableProveedorDto } from './dto/cuenta-contable-proveedor.dto';
import { DeleteCabeceraTrnDto } from './dto/delete-cabecera-trn.dto';
import { GetCtaBancoProveedorDto } from './dto/get-cta-banco-proveedor.dto';
import { GetProveedoresDto } from './dto/get-proveedores.dto';
import { IdProveedorDto } from './dto/id-proveedor.dto';
import { IdeCpctrDto } from './dto/ide-cpctr.dto';
import { MoverDetalleTrnDto } from './dto/mover-detalle-trn.dto';
import { SaveCtaBancoProveedorDto } from './dto/save-cta-banco-proveedor.dto';
import { SaveDetalleCabeceraTrnDto } from './dto/save-detalle-cabecera-trn.dto';
import { SaveTrnProveedorDto } from './dto/save-trn-proveedor.dto';
import { SearchAsientoProveedorDto } from './dto/search-asiento-proveedor.dto';
import { SearchCabeceraTrnDto } from './dto/search-cabecera-trn.dto';
import { SearchDocumentoCxPDto } from './dto/search-documento-cxp.dto';
import { SearchLibroBancoProveedorDto } from './dto/search-libro-banco-proveedor.dto';
import { TrnProveedorDto } from './dto/trn-proveedor.dto';
import { ProveedorSaveService } from './proveedor-save.service';
import { ProveedorService } from './proveedor.service';

@ApiTags('Compras-Proveedores')
@ApiBearerAuth('BearerAuth')
@Controller('compras/proveedores')
export class ProveedorController {
  constructor(
    private readonly service: ProveedorService,
    private readonly saveService: ProveedorSaveService,
  ) { }

  @Get('searchProveedor')
  @ApiOperation({ summary: 'Buscar proveedores por nombre o identificación (autocomplete)' })
  @ApiResponse({ status: 200, description: 'Resultados de búsqueda' })
  searchProveedor(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: SearchDto) {
    return this.service.searchProveedor({ ...headersParams, ...dtoIn });
  }

  @Get('getProveedores')
  @ApiOperation({ summary: 'Listar proveedores con filtros y paginación' })
  @ApiResponse({ status: 200, description: 'Lista paginada de proveedores' })
  getProveedores(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetProveedoresDto) {
    return this.service.getProveedores({ ...headersParams, ...dtoIn });
  }

  @Get('getSaldo')
  @ApiOperation({ summary: 'Obtener saldo actual de un proveedor' })
  @ApiResponse({ status: 200, description: 'Saldo actual del proveedor' })
  getSaldo(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdProveedorDto) {
    return this.service.getSaldo({ ...headersParams, ...dtoIn });
  }

  @Get('getProveedorByUuid')
  @ApiOperation({ summary: 'Obtener proveedor por UUID' })
  @ApiResponse({ status: 200, description: 'Datos del proveedor' })
  getProveedorByUuid(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: UuidDto) {
    return this.service.getProveedorByUuid({ ...headersParams, ...dtoIn });
  }

  @Get('getTrnProveedor')
  @ApiOperation({ summary: 'Obtener transacciones y KPIs de un proveedor por período' })
  @ApiResponse({ status: 200, description: 'Transacciones y KPIs del proveedor' })
  getTrnProveedor(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TrnProveedorDto) {
    return this.service.getTrnProveedor({ ...headersParams, ...dtoIn });
  }

  @Get('getKpiTrnProveedor')
  @ApiOperation({ summary: 'Obtener KPIs de transacciones de un proveedor por período' })
  @ApiResponse({ status: 200, description: 'KPIs de transacciones del proveedor' })
  getKpiTrnProveedor(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TrnProveedorDto) {
    return this.service.getKpiTrnProveedor({ ...headersParams, ...dtoIn });
  }

  @Get('getDireccionesProveedor')
  @ApiOperation({ summary: 'Obtener direcciones registradas de un proveedor' })
  @ApiResponse({ status: 200, description: 'Direcciones del proveedor' })
  getDireccionesProveedor(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdProveedorDto) {
    return this.service.getDireccionesProveedor({ ...headersParams, ...dtoIn });
  }

  @Get('getProductosProveedor')
  @ApiOperation({ summary: 'Listar productos comprados a un proveedor' })
  @ApiResponse({ status: 200, description: 'Productos del proveedor' })
  getProductosProveedor(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdProveedorDto) {
    return this.service.getProductosProveedor({ ...headersParams, ...dtoIn });
  }

  @Get('getCuentaContableProveedor')
  @ApiOperation({ summary: 'Obtener la cuenta contable configurada del proveedor (CUENTA POR PAGAR)' })
  getCuentaContableProveedor(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdProveedorDto) {
    return this.service.getCuentaContableProveedor({ ...headersParams, ...dtoIn });
  }

  @Get('getMovimientosCuentaProveedor')
  @ApiOperation({ summary: 'Movimientos contables del proveedor con saldo inicial y saldo corrido' })
  getMovimientosCuentaProveedor(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TrnProveedorDto) {
    return this.service.getMovimientosCuentaProveedor({ ...headersParams, ...dtoIn });
  }

  @Get('getComprasMensualesProveedor')
  @ApiOperation({ summary: 'Totales de compras del proveedor por mes de un período (gráfico)' })
  getComprasMensualesProveedor(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: ComprasMensualesProveedorDto,
  ) {
    return this.service.getComprasMensualesProveedor({ ...headersParams, ...dtoIn });
  }

  @Get('getDetalleComprasProveedor')
  @ApiOperation({ summary: 'Detalle de compras del proveedor por rango de fechas (por artículo)' })
  getDetalleComprasProveedor(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TrnProveedorDto) {
    return this.service.getDetalleComprasProveedor({ ...headersParams, ...dtoIn });
  }

  @Get('getArbolProveedores')
  @ApiOperation({ summary: 'Estructura jerárquica de proveedores' })
  getArbolProveedores(@AppHeaders() headersParams: HeaderParamsDto) {
    return this.service.getArbolProveedores(headersParams);
  }

  @Get('getListDataAniosCompras')
  @ApiOperation({ summary: 'Combo de años con compras registradas' })
  getListDataAniosCompras(@AppHeaders() headersParams: HeaderParamsDto) {
    return this.service.getListDataAniosCompras(headersParams);
  }

  @Get('getListDataTiposTransaccionCxP')
  @ApiOperation({ summary: 'Combo de tipos de transacción CxP' })
  getListDataTiposTransaccionCxP(@AppHeaders() _h: HeaderParamsDto) {
    return this.service.getListDataTiposTransaccionCxP();
  }

  @Get('getListDataCuentasPorPagarProveedor')
  @ApiOperation({ summary: 'Combo de cuentas por pagar pendientes del proveedor' })
  getListDataCuentasPorPagarProveedor(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdProveedorDto) {
    return this.service.getListDataCuentasPorPagarProveedor({ ...headersParams, ...dtoIn });
  }

  // ─── MUTACIONES ───────────────────────────────────────────────────────────

  @Post('saveProveedor')
  @ApiOperation({ summary: 'Crear o actualizar un proveedor (crea la cuenta contable al insertar)' })
  saveProveedor(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SaveDto) {
    return this.saveService.saveProveedor({ ...headersParams, ...dtoIn });
  }

  @Post('setCuentaContableProveedor')
  @ApiOperation({ summary: 'Vincular la cuenta contable del proveedor (CUENTA POR PAGAR)' })
  setCuentaContableProveedor(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Body() dtoIn: SetCuentaContableProveedorDto,
  ) {
    return this.saveService.setCuentaContableProveedor({ ...headersParams, ...dtoIn });
  }

  @Post('saveTrnProveedor')
  @ApiOperation({ summary: 'Registrar una transacción manual de CxP del proveedor' })
  saveTrnProveedor(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SaveTrnProveedorDto) {
    return this.saveService.saveTrnProveedor({ ...headersParams, ...dtoIn });
  }

  @Get('getCtaBancoProveedor')
  @Auth()
  @ApiOperation({ summary: 'Listar cuentas bancarias de un proveedor' })
  @ApiResponse({ status: 200, description: 'Cuentas bancarias del proveedor' })
  getCtaBancoProveedor(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetCtaBancoProveedorDto) {
    return this.service.getCtaBancoProveedor({ ...headersParams, ...dtoIn });
  }

  @Get('getListDataCtaBancoProveedor')
  @Auth()
  @ApiOperation({ summary: 'Listar cuentas bancarias de un proveedor para combos' })
  @ApiResponse({ status: 200, description: 'Cuentas bancarias para combos' })
  getListDataCtaBancoProveedor(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetCtaBancoProveedorDto) {
    return this.service.getListDataCtaBancoProveedor({ ...headersParams, ...dtoIn });
  }

  @Post('saveCtaBancoProveedor')
  @Auth()
  @ApiOperation({ summary: 'Crear o actualizar cuenta bancaria de un proveedor' })
  @ApiResponse({ status: 200, description: 'Cuenta bancaria guardada' })
  saveCtaBancoProveedor(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SaveCtaBancoProveedorDto) {
    return this.saveService.saveCtaBancoProveedor({ ...headersParams, ...dtoIn });
  }

  // ─── EDITAR TRANSACCIONES CXP ──────────────────────────────────────────────

  @Get('getCabecerasTrnProveedor')
  @Auth()
  @ApiOperation({ summary: 'Cabeceras de transacción CxP de un proveedor por período, con cuadre' })
  getCabecerasTrnProveedor(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: TrnProveedorDto) {
    return this.service.getCabecerasTrnProveedor({ ...headersParams, ...dtoIn });
  }

  @Get('getDetalleCabeceraTrn')
  @Auth()
  @ApiOperation({ summary: 'Cabecera + detalle completo de una transacción CxP' })
  getDetalleCabeceraTrn(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: IdeCpctrDto) {
    return this.service.getDetalleCabeceraTrn({ ...headersParams, ...dtoIn });
  }

  @Get('searchDocumentoProveedor')
  @Auth()
  @ApiOperation({ summary: 'Buscar facturas o notas de crédito de compra de un proveedor (autocomplete)' })
  searchDocumentoProveedor(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: SearchDocumentoCxPDto) {
    return this.service.searchDocumentoProveedor({ ...headersParams, ...dtoIn });
  }

  @Get('searchAsientoProveedor')
  @Auth()
  @ApiOperation({ summary: 'Buscar asientos contables de un proveedor (autocomplete)' })
  searchAsientoProveedor(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: SearchAsientoProveedorDto) {
    return this.service.searchAsientoProveedor({ ...headersParams, ...dtoIn });
  }

  @Get('searchLibroBancoProveedor')
  @Auth()
  @ApiOperation({ summary: 'Buscar movimientos de libro de bancos ya vinculados a un proveedor (autocomplete)' })
  searchLibroBancoProveedor(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: SearchLibroBancoProveedorDto,
  ) {
    return this.service.searchLibroBancoProveedor({ ...headersParams, ...dtoIn });
  }

  @Get('searchCabeceraTrnProveedor')
  @Auth()
  @ApiOperation({ summary: 'Buscar cabeceras de transacción CxP de un proveedor (para reasignar detalle)' })
  searchCabeceraTrnProveedor(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: SearchCabeceraTrnDto) {
    return this.service.searchCabeceraTrnProveedor({ ...headersParams, ...dtoIn });
  }

  @Post('saveDetalleCabeceraTrn')
  @Auth()
  @ApiOperation({ summary: 'Guardar (diff: crear/actualizar/eliminar) el detalle de una cabecera de transacción CxP' })
  saveDetalleCabeceraTrn(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: SaveDetalleCabeceraTrnDto) {
    return this.saveService.saveDetalleCabeceraTrn({ ...headersParams, ...dtoIn });
  }

  @Post('moverDetalleTrn')
  @Auth()
  @ApiOperation({ summary: 'Reasignar una línea de detalle CxP a otra cabecera del mismo proveedor' })
  moverDetalleTrn(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: MoverDetalleTrnDto) {
    return this.saveService.moverDetalleTrn({ ...headersParams, ...dtoIn });
  }

  @Post('deleteCabeceraTrn')
  @Auth()
  @ApiOperation({ summary: 'Eliminar una cabecera de transacción CxP (solo si no tiene detalle asociado)' })
  deleteCabeceraTrn(@AppHeaders() headersParams: HeaderParamsDto, @Body() dtoIn: DeleteCabeceraTrnDto) {
    return this.saveService.deleteCabeceraTrn({ ...headersParams, ...dtoIn });
  }
}

