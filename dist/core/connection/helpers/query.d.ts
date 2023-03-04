import { ParamQuery } from "../interfaces/paramQuery";
export declare class Query {
    query: string;
    params?: ParamQuery[];
    constructor();
    addIntParam(index: number, value: number): void;
    addNumberParam(index: number, value: number): void;
    addStringParam(index: number, value: string): void;
    addBooleanParam(index: number, value: boolean): void;
    addArrayStringParam(index: number, value: string[]): void;
    addArrayNumberParam(index: number, value: number[]): void;
    addParam(index: number, value: any): void;
    get paramValues(): any[];
}
