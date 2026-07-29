import { IsInt, IsNotEmpty } from 'class-validator';

export class EnviarSriDocumentoCxPDto {
    /** FK → cxp_cabece_factur (debe ser una Liquidación de Compra electrónica) */
    @IsInt()
    @IsNotEmpty()
    ide_cpcfa: number;
}
