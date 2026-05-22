import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { SearchDto } from 'src/common/dto/search.dto';

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
}
