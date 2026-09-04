import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { ArrayIdeDto } from 'src/common/dto/array-ide.dto';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { Auth } from 'src/core/auth';
import { AsientosAutomaticosService } from 'src/core/modules/contabilidad/asientos-automaticos.service';

import { GetNoContabilizadosDto } from '../facturas/dto/get-no-contabilizados.dto';

import { EnviarSriNotaCreditoDto } from './dto/enviar-sri-nota-credito.dto';
import { AnularNotaCreditoDto, SaveNotaCreditoDto } from './dto/save-nota-credito.dto';
import { NotasCreditoSaveService } from './notas-credito-save.service';
import { NotasCreditoService } from './notas-credito.service';

@ApiTags('Ventas - Notas de Crédito')
@Controller('ventas/notas-credito')
export class NotasCreditoController {
    constructor(
        private readonly saveService: NotasCreditoSaveService,
        private readonly service: NotasCreditoService,
        private readonly asientosService: AsientosAutomaticosService,
    ) { }

    @Get('getNotasNoContabilizadas')
    @Auth()
    @ApiOperation({ summary: 'Listar notas de crédito de VENTAS de un mes/período por estado de contabilización (Mayorizar)' })
    getNotasNoContabilizadas(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Query() dtoIn: GetNoContabilizadosDto,
    ) {
        return this.service.getNotasNoContabilizadas({ ...headersParams, ...dtoIn });
    }

    @Post('generarAsientosNotasCredito')
    @Auth()
    @ApiOperation({ summary: 'Generar el asiento contable de una o varias notas de crédito de VENTAS (Mayorizar)' })
    async generarAsientosNotasCredito(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: ArrayIdeDto,
    ) {
        const resultados = [];
        for (const ideCpcno of dtoIn.ide) {
            resultados.push(
                await this.asientosService.generarAsientoNotaCredito({
                    ...headersParams,
                    ide_cpcno: ideCpcno,
                }),
            );
        }
        return resultados;
    }

    @Post('generarAsientosNotasCreditoCosto')
    @Auth()
    @ApiOperation({ summary: 'Generar el asiento de reverso de costo de una o varias notas de crédito de VENTAS (Mayorizar)' })
    async generarAsientosNotasCreditoCosto(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: ArrayIdeDto,
    ) {
        const resultados = [];
        for (const ideCpcno of dtoIn.ide) {
            resultados.push(
                await this.asientosService.generarAsientoCostoNotaCredito({
                    ...headersParams,
                    ide_cpcno: ideCpcno,
                }),
            );
        }
        return resultados;
    }

    @Post('deshacerAsientosNotasCredito')
    @Auth()
    @ApiOperation({ summary: 'Deshacer el asiento contable (venta) automático de una o varias notas de crédito de VENTAS (Mayorizar)' })
    async deshacerAsientosNotasCredito(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: ArrayIdeDto,
    ) {
        const resultados = [];
        for (const ideCpcno of dtoIn.ide) {
            resultados.push(
                await this.asientosService.deshacerAsientoNotaCredito({
                    ...headersParams,
                    ide_cpcno: ideCpcno,
                }),
            );
        }
        return resultados;
    }

    @Post('deshacerAsientosNotasCreditoCosto')
    @Auth()
    @ApiOperation({ summary: 'Deshacer el asiento de reverso de costo automático de una o varias notas de crédito de VENTAS (Mayorizar)' })
    async deshacerAsientosNotasCreditoCosto(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: ArrayIdeDto,
    ) {
        const resultados = [];
        for (const ideCpcno of dtoIn.ide) {
            resultados.push(
                await this.asientosService.deshacerAsientoCostoNotaCredito({
                    ...headersParams,
                    ide_cpcno: ideCpcno,
                }),
            );
        }
        return resultados;
    }

    @Post('saveNotaCredito')
    @Auth()
    @ApiOperation({ summary: 'Crear una nota de crédito de venta (reversa una factura, genera comprobante SRI)' })
    saveNotaCredito(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: SaveNotaCreditoDto,
    ) {
        return this.saveService.saveNotaCredito({ ...headersParams, ...dtoIn });
    }

    @Post('enviarSRI')
    @Auth()
    @ApiOperation({ summary: 'Enviar bajo demanda una nota de crédito al SRI (firma + recepción + autorización + correo)' })
    enviarSRI(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: EnviarSriNotaCreditoDto,
    ) {
        return this.saveService.enviarSRI({ ...headersParams, ...dtoIn });
    }

    @Post('anularNotaCredito')
    @Auth()
    @ApiOperation({ summary: 'Anular una nota de crédito de venta' })
    anularNotaCredito(
        @AppHeaders() headersParams: HeaderParamsDto,
        @Body() dtoIn: AnularNotaCreditoDto,
    ) {
        return this.saveService.anularNotaCredito({ ...headersParams, ...dtoIn });
    }
}
