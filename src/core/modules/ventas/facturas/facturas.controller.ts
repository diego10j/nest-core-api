import { Body, Controller, Delete, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { ArrayIdeDto } from 'src/common/dto/array-ide.dto';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { FacturasDto } from './dto/facturas.dto';
import { GetFacturaDto } from './dto/get-factura.dto';
import { GetInitDataDto, GetProductoDetalleDto } from './dto/get-init-data.dto';
import { PagosFacturasDto } from './dto/get-pagos-facturas.dto';
import { EnviosFacturasDto } from './dto/get-envios-facturas.dto';
import { UtilidadVentasDto } from './dto/get-util-ventas';
import { PuntosEmisionFacturasDto } from './dto/pto-emision-fac.dto';
import { ResumenDiarioFacturasDto } from './dto/resumen-diario-facturas.dto';
import { SaveFacturaDto } from './dto/save-factura.dto';
import { FacturasSaveService } from './facturas-save.service';
import { FacturasService } from './facturas.service';
import { Auth } from 'src/core/auth';

@ApiTags('Ventas-Facturas')
@Controller('ventas/facturas')
export class FacturasController {
  constructor(
    private readonly service: FacturasService,
    private readonly saveService: FacturasSaveService,
  ) { }

  @Get('getPuntosEmisionFacturas')
  @ApiOperation({ summary: 'Obtener puntos de emisión habilitados para facturas' })
  @Auth()
  getPuntosEmisionFacturas(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: PuntosEmisionFacturasDto) {
    return this.service.getPuntosEmisionFacturas({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTableQueryPuntosEmisionFacturas')
  @ApiOperation({ summary: 'Consulta tabla de puntos de emisión para facturas' })
  @Auth()
  getTableQueryPuntosEmisionFacturas(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: PuntosEmisionFacturasDto,
  ) {
    return this.service.getTableQueryPuntosEmisionFacturas({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getFacturas')
  @ApiOperation({ summary: 'Listar facturas por período y filtros' })
  @Auth()
  getFacturas(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: FacturasDto) {
    return this.service.getFacturas({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getFacturasAnuladas')
  @ApiOperation({ summary: 'Listar facturas anuladas por período' })
  @Auth()
  getFacturasAnuladas(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: FacturasDto) {
    return this.service.getFacturasAnuladas({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getFacturasConNotasCredito')
  @ApiOperation({ summary: 'Listar facturas que tienen notas de crédito asociadas' })
  @Auth()
  getFacturasConNotasCredito(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: FacturasDto) {
    return this.service.getFacturasConNotasCredito({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getUtilidadVentas')
  @ApiOperation({ summary: 'Obtener utilidad de ventas por período' })
  @Auth()
  getUtilidadVentas(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: UtilidadVentasDto) {
    return this.service.getUtilidadVentas({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getTotalFacturasPorEstado')
  @ApiOperation({ summary: 'Obtener totales de facturas agrupadas por estado' })
  @Auth()
  getTotalFacturasPorEstado(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: FacturasDto) {
    return this.service.getTotalFacturasPorEstado({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getFacturasPorCobrar')
  @ApiOperation({ summary: 'Listar facturas pendientes de cobro' })
  @Auth()
  getFacturasPorCobrar(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: FacturasDto) {
    return this.service.getFacturasPorCobrar({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getReportePagosFacturas')
  @ApiOperation({ summary: 'Listar facturas con detalle de pagos en JSON, agrupadas por factura' })
  getReportePagosFacturas(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: PagosFacturasDto) {
    return this.service.getReportePagosFacturas({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getReporteEnviosFacturas')
  @ApiOperation({ summary: 'Listar facturas con informacion de envio (transporte)' })
  getReporteEnviosFacturas(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: EnviosFacturasDto) {
    return this.service.getReporteEnviosFacturas({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getFacturaById')
  @ApiOperation({ summary: 'Obtener factura por ID' })
  @Auth()
  getFacturaById(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: GetFacturaDto) {
    return this.service.getFacturaById({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getSecuencialFactura')
  @ApiOperation({ summary: 'Obtener siguiente secuencial para un punto de emisión' })
  @Auth()
  getSecuencialFactura(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: GetFacturaDto,
  ) {
    return this.service.getSecuencialFactura({
      ...headersParams,
      ide_ccdaf: dtoIn.ide_cccfa,
    });
  }

  @Post('save')
  @ApiOperation({ summary: 'Crear o actualizar una factura' })
  save(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Body() dtoIn: SaveFacturaDto,
  ) {
    return this.saveService.save({ ...headersParams, ...dtoIn });
  }

  @Delete('delete')
  @ApiOperation({ summary: 'Eliminar una o varias facturas' })
  deleteFacturas(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Body() dtoIn: ArrayIdeDto,
  ) {
    return this.saveService.deleteFacturas({ ...headersParams, ...dtoIn });
  }

  @Get('getResumenDiarioFacturas')
  @ApiOperation({ summary: 'Obtener resumen diario de facturación' })
  @Auth()
  getResumenDiarioFacturas(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: ResumenDiarioFacturasDto,
  ) {
    return this.service.getResumenDiarioFacturas({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getFormularioNuevaFactura')
  @ApiOperation({ summary: 'Datos iniciales para el formulario de nueva factura (punto de emisión, IVA y formas de pago)' })
  @Auth()
  getFormularioNuevaFactura(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: GetInitDataDto,
  ) {
    return this.service.getFormularioNuevaFactura({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getProductoParaDetalle')
  @ApiOperation({ summary: 'Datos de un artículo para agregar al detalle de la factura (info, stock y último precio al cliente)' })
  @Auth()
  getProductoParaDetalle(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query() dtoIn: GetProductoDetalleDto,
  ) {
    return this.service.getProductoParaDetalle({
      ...headersParams,
      ...dtoIn,
    });
  }

  @Get('getCatalogos')
  @ApiOperation({ summary: 'Catálogos para formulario de guía de remisión (tipos de guía, camiones y formas de pago)' })
  @Auth()
  getCatalogos(@AppHeaders() headersParams: HeaderParamsDto) {
    return this.service.getCatalogos(headersParams);
  }

  @Get('getListDataFactura')
  @ApiOperation({ summary: 'Listados combinados para facturación: formas de pago (contado), días de crédito, vendedores, usuarios, tipos de guía y camiones' })
  @Auth()
  getListDataFactura(@AppHeaders() headersParams: HeaderParamsDto) {
    return this.service.getListDataFactura(headersParams);
  }

  @Get('getProformaParaFactura')
  @ApiOperation({ summary: 'Cargar datos de una proforma para pre-llenar el formulario de nueva factura' })
  @Auth()
  getProformaParaFactura(
    @AppHeaders() headersParams: HeaderParamsDto,
    @Query('numeroProforma') numeroProforma: string,
  ) {
    return this.service.getProformaParaFactura(headersParams, numeroProforma);
  }

}