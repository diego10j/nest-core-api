import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { TesoreriaLdService } from './tesoreria-ld.service';
import { TesoreriaService } from './tesoreria.service';

@ApiTags('Tesoreria')
@Controller('tesoreria')
export class TesoreriaController {
    constructor(
        private readonly service: TesoreriaService,
        private readonly serviceLd: TesoreriaLdService,
    ) { }

    // ─── CUENTAS BANCARIAS ────────────────────────────────────────────────────

    @Get('getCuentasBancoPagos')
    @ApiOperation({ summary: 'Listar cuentas bancarias habilitadas para pagos' })
    getCuentasBancoPagos(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.service.getCuentasBancoPagos(headersParams);
    }

    @Get('getCuentasBanco')
    @ApiOperation({ summary: 'Listar todas las cuentas bancarias de la empresa' })
    getCuentasBanco(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.service.getCuentasBanco(headersParams);
    }

    @Get('getCuentasBancoCheques')
    @ApiOperation({ summary: 'Listar cuentas bancarias habilitadas para emisión de cheques' })
    getCuentasBancoCheques(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.service.getCuentasBancoCheques(headersParams);
    }

    // ─── TIPOS DE TRANSACCIÓN BANCARIA ────────────────────────────────────────

    @Get('getListDataTiposTranBanc')
    @ApiOperation({ summary: 'Listar todos los tipos de transacción bancaria' })
    getListDataTiposTranBanc(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.serviceLd.getListDataTiposTranBanc(headersParams);
    }

    @Get('getListDataTiposTranBancIngreso')
    @ApiOperation({ summary: 'Listar tipos de transacción bancaria de ingreso' })
    getListDataTiposTranBancIngreso(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.serviceLd.getListDataTiposTranBancIngreso(headersParams);
    }

    @Get('getListDataTiposTranBancEgreso')
    @ApiOperation({ summary: 'Listar tipos de transacción bancaria de egreso' })
    getListDataTiposTranBancEgreso(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.serviceLd.getListDataTiposTranBancEgreso(headersParams);
    }
}
