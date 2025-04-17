import { Injectable } from '@nestjs/common';
import { DataSourceService } from '../../connection/datasource.service';
import { validateCedula, validateRUC } from 'src/util/helpers/validations/cedula-ruc';
import { RucDto } from './dto/ruc.dto';


@Injectable()
export class GeneralService {

    constructor(private readonly dataSource: DataSourceService) { }



    /**
    * Valida cédula
    * @returns 
    */
    validateCedula(id: string) {
        const valid = validateCedula(id);
        const message = valid === true ? 'Cédula válida' : 'Cédula no válida';
        return {
            valid,
            message
        }
    }

    /**
    * Valida RUC
    * @returns 
    */
    validateRuc(dtoIn: RucDto) {
        const result = validateRUC(dtoIn.ruc, dtoIn.isSas);
        const message = result.isValid === true ? `${result.type} válido` : 'RUC no válido'
        return {
            valid: result.isValid,
            message
        }
    }

}
