import { ClassConstructor } from "class-transformer";
import { DateUtil, SqlUtil, StringUtil } from './helpers';
export declare class UtilService {
    readonly SQL_UTIL: SqlUtil;
    readonly STRING_UTIL: StringUtil;
    readonly DATE_UTIL: DateUtil;
    validateDTO: <T extends ClassConstructor<any>>(dto: T, obj: Object) => Promise<void>;
    isDefined(value: any): boolean;
    getGenericScreen(): string[];
}
