import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { SearchDto } from 'src/common/dto/search.dto';
import { UuidDto } from 'src/common/dto/uuid.dto';

import { GetProveedoresDto } from './dto/get-proveedores.dto';
import { IdProveedorDto } from './dto/id-proveedor.dto';
import { TrnProveedorDto } from './dto/trn-proveedor.dto';
import { ProveedorService } from './proveedor.service';

@ApiTags('Compras-Proveedores')
@ApiBearerAuth('BearerAuth')
@Controller('compras/proveedores')
export class ProveedorController {
  constructor(private readonly service: ProveedorService) {}

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
}
