import { IsArray, IsInt, IsNotEmpty } from 'class-validator';

/** Totales por cuenta contable (referencia_cndcc) de un conjunto de asientos - Mayorizar/Resumen */
export class ResumenCuentasMayorizacionDto {
    @IsArray()
    @IsInt({ each: true })
    @IsNotEmpty()
    ide_cnccc: number[];
}
