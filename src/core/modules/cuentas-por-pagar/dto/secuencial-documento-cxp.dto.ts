import { IsInt, IsNotEmpty } from 'class-validator';

export class SecuencialDocumentoCxPDto {

    /** Tipo de documento CxP (con_tipo_document.ide_cntdo) del que se sugiere el siguiente
     * número de documento (MAX(numero_cpcfa) + 1 del mismo tipo, paridad con la sugerencia
     * ya usada para Liquidación de Compra física) */
    @IsInt()
    @IsNotEmpty()
    ide_cntdo: number;
}
