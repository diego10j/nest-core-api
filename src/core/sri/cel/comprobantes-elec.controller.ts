import { Body, Controller, Post } from '@nestjs/common';
import { ComprobantesElecService } from './comprobantes-elec.service';
import { ClaveAccesoDto } from './dto/clave-acceso.dto';

@Controller('sri/cel')
export class ComprobantesElecController {
    constructor(private readonly service: ComprobantesElecService) { }


    @Post('getComprobantePorClaveAcceso')
    // @Auth()
    getCliente(
        @Body() dtoIn: ClaveAccesoDto
    ) {
        return this.service.getComprobantePorClaveAcceso(dtoIn);
    }


}