import { ClassConstructor } from "class-transformer";
import { SqlUtil } from './sql-util';
export declare class UtilitarioService {
    readonly SQL_UTIL: SqlUtil;
    validarDTO: <T extends ClassConstructor<any>>(dto: T, obj: Object) => Promise<void>;
}
