import { QueryOptionsDto } from '../../../common/dto/query-options.dto';
import { ParamQuery } from '../interfaces/paramQuery';

export class Query {
  query: string;
  params?: ParamQuery[];
  dto: QueryOptionsDto;
  audit: boolean = false;

  constructor() {
    this.params = [];
  }

  addIntParam(index: number, value: number) {
    const intValue = Number(value);
    if (value === null || value === undefined || Number.isNaN(intValue)) {
      throw new Error(`Invalid integer param at index ${index}: ${value}`);
    }
    this.params.push({ index, value: parseInt(String(intValue), 10) });
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
    return this.params.map((p) => p.value);
  }

  setAudit(isAudit: boolean) {
    this.audit = isAudit;
  }
}
