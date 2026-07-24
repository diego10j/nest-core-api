import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { Auth } from 'src/core/auth';

import { AnularRetencionCxPDto, IdDocumentoCxPDto, SaveRetencionCxPDto } from './dto/save-retencion-cxp.dto';
import { RetencionesCxPSaveService } from './retenciones-cxp-save.service';
import { RetencionesCxPService } from './retenciones-cxp.service';

@ApiTags('CuentasPorPagar - Retenciones')
@Controller('cuentas-por-pagar/retenciones')
export class RetencionesCxPController {
    constructor(
        private readonly service: RetencionesCxPService,
        private readonly saveService: RetencionesCxPSaveService,
    ) { }

    @Get('getRetencionDocumento')
    @Auth()
    @ApiOperation({ summary: 'Obtener el comprobante de retención de un documento CxP' })
    getRetencionDocumento(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: IdDocumentoCxPDto,
    ) {
        return this.service.getRetencionDocumento({ ...headersParams, ...dtoIn });
    }

    @Get('getDatosNuevaRetencion')
    @Auth()
    @ApiOperation({ summary: 'Datos y sugerencia de detalles para crear la retención de un documento CxP' })
    getDatosNuevaRetencion(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: IdDocumentoCxPDto,
    ) {
        return this.service.getDatosNuevaRetencion({ ...headersParams, ...dtoIn });
    }

    @Get('getListDataImpuestosRetencion')
    @Auth()
    @ApiOperation({ summary: 'Combo de impuestos de retención' })
    getListDataImpuestosRetencion(@AppHeaders() _h: HeaderParamsDto) {
        return this.service.getListDataImpuestosRetencion();
    }

    @Get('getPuntosEmisionRetencion')
    @Auth()
    @ApiOperation({ summary: 'Puntos de emisión de comprobantes de retención' })
    getPuntosEmisionRetencion(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.service.getPuntosEmisionRetencion(headersParams);
    }

    @Post('saveRetencion')
    @Auth()
    @ApiOperation({ summary: 'Crear el comprobante de retención de un documento CxP' })
    saveRetencion(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: SaveRetencionCxPDto,
    ) {
        return this.saveService.saveRetencion({ ...headersParams, ...dtoIn });
    }

    @Post('anularRetencion')
    @Auth()
    @ApiOperation({ summary: 'Anular un comprobante de retención' })
    anularRetencion(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: AnularRetencionCxPDto,
    ) {
        return this.saveService.anularRetencion({ ...headersParams, ...dtoIn });
    }
}
