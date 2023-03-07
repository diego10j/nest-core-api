import { Injectable, BadRequestException } from '@nestjs/common';
import { validate } from 'class-validator';
import { ClassConstructor, plainToClass } from "class-transformer";
import { DateUtil, SqlUtil, StringUtil } from './helpers';

@Injectable()
export class UtilService {

    readonly SQL_UTIL: SqlUtil = new SqlUtil();
    readonly STRING_UTIL: StringUtil = new StringUtil();
    readonly DATE_UTIL: DateUtil = new DateUtil();

    /**
     * Valida que un objeto cumpla la estructura de la clase DTO
     */
    validateDTO = async <T extends ClassConstructor<any>>(
        dto: T,
        obj: Object
    ) => {
        // tranform the literal object to class object
        const objInstance = plainToClass(dto, obj);
        // validating and check the errors, throw the errors if exist
        const errors = await validate(objInstance);
        // errors is an array of validation errors
        if (errors.length > 0) {
            throw new BadRequestException(
                `${errors}`
            );
        }
    };

    /**
     * Verifica si un valor esta definido
     * @param value 
     * @returns 
     */
    isDefined(value): boolean {
        return typeof value !== "undefined" && value !== null;
    }

}
