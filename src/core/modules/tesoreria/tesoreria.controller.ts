import { Controller, Get } from '@nestjs/common';
import { AppHeaders } from 'src/common/decorators/header-params.decorator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { TesoreriaLdService } from './tesoreria-ld.service';
import { TesoreriaService } from './tesoreria.service';

@Controller('tesoreria')
export class TesoreriaController {
    constructor(
        private readonly service: TesoreriaService,
        private readonly serviceLd: TesoreriaLdService,
    ) { }

    // ─── CUENTAS BANCARIAS ────────────────────────────────────────────────────

    @Get('getCuentasBancoPagos')
    getCuentasBancoPagos(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.service.getCuentasBancoPagos(headersParams);
    }

    @Get('getCuentasBanco')
    getCuentasBanco(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.service.getCuentasBanco(headersParams);
    }

    @Get('getCuentasBancoCheques')
    getCuentasBancoCheques(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.service.getCuentasBancoCheques(headersParams);
    }

    // ─── TIPOS DE TRANSACCIÓN BANCARIA ────────────────────────────────────────

    @Get('getListDataTiposTranBanc')
    getListDataTiposTranBanc(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.serviceLd.getListDataTiposTranBanc(headersParams);
    }

    @Get('getListDataTiposTranBancIngreso')
    getListDataTiposTranBancIngreso(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.serviceLd.getListDataTiposTranBancIngreso(headersParams);
    }

    @Get('getListDataTiposTranBancEgreso')
    getListDataTiposTranBancEgreso(@AppHeaders() headersParams: HeaderParamsDto) {
        return this.serviceLd.getListDataTiposTranBancEgreso(headersParams);
    }
}
