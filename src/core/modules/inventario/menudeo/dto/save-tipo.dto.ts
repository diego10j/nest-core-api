import { Type } from 'class-transformer';
import {
    IsBoolean,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsObject,
    IsOptional,
    IsPositive,
    IsString,
    ValidateNested,
} from 'class-validator';

// ─────────────────────────────────────────────────────────────
// TIPO COMPROBANTE MENUDEO
// ─────────────────────────────────────────────────────────────

export class InvMenTipoComp {
    @IsOptional()
    @IsInt()
    @IsPositive()
    ide_inmtc?: number;

    @IsInt()
    @IsPositive()
    ide_empr: number;

    @IsNotEmpty()
    @IsString()
    nombre_inmtc: string;

    @IsIn([1, -1])
    signo_inmtc: number;

    @IsBoolean()
    activo_inmtc: boolean;
}

export class SaveTipoCompDto {
    @IsNotEmpty()
    @IsObject()
    @ValidateNested()
    @Type(() => InvMenTipoComp)
    data: InvMenTipoComp;

    @IsBoolean()
    isUpdate: boolean;
}

// ─────────────────────────────────────────────────────────────
// TIPO TRANSACCIÓN MENUDEO
// ─────────────────────────────────────────────────────────────

export class InvMenTipoTran {
    @IsOptional()
    @IsInt()
    @IsPositive()
    ide_inmtt?: number;

    @IsInt()
    @IsPositive()
    ide_inmtc: number;

    @IsInt()
    @IsPositive()
    ide_empr: number;

    @IsOptional()
    @IsInt()
    @IsPositive()
    ide_intti?: number;

    @IsNotEmpty()
    @IsString()
    nombre_inmtt: string;

    @IsNotEmpty()
    @IsString()
    sigla_inmtt: string;

    @IsBoolean()
    genera_egreso_base_inmtt: boolean;

    @IsBoolean()
    genera_egreso_insumo_inmtt: boolean;

    @IsBoolean()
    activo_inmtt: boolean;
}

export class SaveTipoTranDto {
    @IsNotEmpty()
    @IsObject()
    @ValidateNested()
    @Type(() => InvMenTipoTran)
    data: InvMenTipoTran;

    @IsBoolean()
    isUpdate: boolean;
}
