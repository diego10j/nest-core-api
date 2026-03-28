import { Type } from 'class-transformer';
import {
    IsArray,
    IsDateString,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsPositive,
    IsString,
    Min,
    ValidateNested,
} from 'class-validator';

export class IAjusteItem {
    /** Producto base al que pertenece la presentación */
    @IsInt()
    ide_inarti: number;

    /** Presentación (vínculo producto ↔ forma) que se va a ajustar */
    @IsInt()
    ide_inmpre: number;

    /**
     * Cantidad en unidades de presentación que DEBE QUEDAR como saldo final.
     * El servicio calcula la diferencia con el saldo actual y determina
     * si aplica un Ajuste Ingreso (+) o Ajuste Egreso (-).
     * Si saldo_final === saldo_actual el ítem se omite sin error.
     */
    @IsNumber({ maxDecimalPlaces: 3 })
    @Min(0)
    saldo_final: number;

    @IsOptional()
    @IsString()
    observacion_indmen?: string;
}

export class SaveAjusteMenudeoDto {
    /** Fecha del comprobante de ajuste */
    @IsDateString()
    fecha_incmen: string;

    /** Observación general del ajuste */
    @IsOptional()
    @IsString()
    observacion_incmen?: string;

    /**
     * Ítems a ajustar. Pueden pertenecer a varios productos.
     * Se genera un comprobante por cada combinación (producto, tipo de ajuste).
     */
    @IsArray()
    @IsNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => IAjusteItem)
    items: IAjusteItem[];
}
