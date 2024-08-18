import { ParamQuery } from "../interfaces/paramQuery";
import { ServiceDto } from '../../../common/dto/service.dto';

export class Query {

    query: string;
    params?: ParamQuery[];
    dto: ServiceDto;
    audit: boolean = true;

    constructor() {
        this.params = [];
    }

    addIntParam(index: number, value: number) {
        this.params.push({ index: index, value: parseInt(value.toString()) });
    }

    addNumberParam(index: number, value: number) {
        this.params.push({ index, value });
    }

    addStringParam(index: number, value: string) {
        this.params.push({ index, value });
    }

    addBooleanParam(index: number, value: boolean) {
        this.params.push({ index, value });
    }

    addArrayStringParam(index: number, value: string[]) {
        this.params.push({ index, value });
    }

    addArrayNumberParam(index: number, value: number[]) {
        this.params.push({ index, value });
    }

    addParam(index: number, value: any) {
        this.params.push({ index, value });
    }

    addDateParam(index: number, value: Date) {
        this.params.push({ index, value });
    }

    get paramValues() {
        return this.params.map(p => p.value);;
    }

    setAudit(audit: boolean = true) {
        this.audit = audit;
    }
}


