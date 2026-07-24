import { ArrayNotEmpty, IsArray, IsInt } from 'class-validator';

export class GenerarAsientosComprasDto {
    /** Documentos CxP (ide_cpcfa) a contabilizar */
    @IsArray()
    @ArrayNotEmpty()
    @IsInt({ each: true })
    ide: number[];
}
