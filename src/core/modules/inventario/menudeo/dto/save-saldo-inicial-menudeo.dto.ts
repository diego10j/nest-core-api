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

export class ISaldoInicialItem {
    /** Producto base */
    @IsInt()
    ide_inarti: number;

    /** Presentación (vínculo producto ↔ forma) */
    @IsInt()
    ide_inmpre: number;

    /** Cantidad en unidades de la presentación (ej: botellas, fundas) */
    @IsNumber({ maxDecimalPlaces: 3 })
    @Min(0.001)
    cantidad_indmen: number;

    /** Cantidad en unidades base del producto (ej: litros, kg) que representa este saldo */
    @IsNumber({ maxDecimalPlaces: 6 })
    @Min(0.000001)
    cant_base_indmen: number;

    @IsOptional()
    @IsString()
    observacion_indmen?: string;
}

export class SaveSaldoInicialMenudeoDto {
    /** Fecha del comprobante de saldo inicial */
    @IsDateString()
    fecha_incmen: string;

    /** Observación general para todos los comprobantes generados */
    @IsOptional()
    @IsString()
    observacion_incmen?: string;

    /** Ítems de saldo inicial. Pueden pertenecer a varios productos;
     *  se crea un comprobante por cada producto distinto. */
    @IsArray()
    @IsNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => ISaldoInicialItem)
    items: ISaldoInicialItem[];
}


// {
//   "fecha_incmen": "2026-03-27",
//   "observacion_incmen": "Ingreso saldos iniciales",
//   "items": [
//     { "ide_inarti": 10, "ide_inmpre": 5, "cantidad_indmen": 24, "cant_base_indmen": 0.33 },
//     { "ide_inarti": 10, "ide_inmpre": 6, "cantidad_indmen": 12, "cant_base_indmen": 1.0 },
//     { "ide_inarti": 15, "ide_inmpre": 9, "cantidad_indmen": 50, "cant_base_indmen": 0.5 }
//   ]
// }



// {
//   "fecha_incmen": "2026-03-27",
//   "observacion_incmen": "Regularización de inventario",
//   "items": [
//     { "ide_inarti": 10, "ide_inmpre": 5, "saldo_final": 10 },
//     { "ide_inarti": 10, "ide_inmpre": 6, "saldo_final": 10 },
//     { "ide_inarti": 15, "ide_inmpre": 9, "saldo_final": 0 }
//   ]
// }