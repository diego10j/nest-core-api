import { Controller, Get, Query } from '@nestjs/common';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { RangoFechasDto } from 'src/common/dto/rango-fechas.dto';

import { CuentasPorCobrarService } from './cuentas-por-cobrar.service';


@Controller('cuentas-por-cobrar')
export class CuentasPorCobrarController {
    constructor(private readonly service: CuentasPorCobrarService) { }

    @Get('getCuentasPorCobrar')
    // @Auth()
    getCuentasPorCobrar(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
        return this.service.getCuentasPorCobrar({
            ...headersParams,
            ...dtoIn,
        });
    }

    @Get('getClientesPagoDestiempo')
    // @Auth()
    getClientesPagoDestiempo(@AppHeaders() headersParams: HeaderParamsDto, @Query() dtoIn: RangoFechasDto) {
        return this.service.getClientesPagoDestiempo({
            ...headersParams,
            ...dtoIn,
        });
    }


}