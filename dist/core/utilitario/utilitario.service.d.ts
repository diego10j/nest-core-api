import { ClassConstructor } from "class-transformer";
export declare class UtilitarioService {
    validatDTO: <T extends ClassConstructor<any>>(dto: T, obj: Object) => Promise<void>;
}
