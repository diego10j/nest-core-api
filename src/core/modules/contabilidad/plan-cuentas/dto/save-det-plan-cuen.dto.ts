// tabla: con_det_plan_cuen
import { Type } from 'class-transformer';
import {
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsObject,
    IsOptional,
    IsString,
    MaxLength,
    ValidateNested,
} from 'class-validator';

import { SaveDto } from 'src/common/dto/save.dto';

export class ConDetPlanCuenDataDto {
    @IsNumber()
    @IsOptional()
    ide_cndpc?: number;

    @IsNumber()
    @IsOptional()
    ide_sucu?: number;

    /** Tipo de cuenta (activo, pasivo, patrimonio, etc.) */
    @IsInt()
    @IsOptional()
    ide_cntcu?: number;

    /** Plan de cuentas cabecera al que pertenece */
    @IsInt()
    @IsOptional()
    ide_cncpc?: number;

    /** Nivel del plan de cuentas */
    @IsInt()
    @IsOptional()
    ide_cnncu?: number;

    @IsNumber()
    @IsOptional()
    ide_empr?: number;

    /** Cuenta padre (para jerarquía) */
    @IsInt()
    @IsOptional()
    con_ide_cndpc?: number;

    @IsString()
    @IsOptional()
    @MaxLength(50)
    codig_recur_cndpc?: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(120)
    nombre_cndpc: string;

    /** PADRE o HIJO */
    @IsString()
    @IsOptional()
    @MaxLength(10)
    nivel_cndpc?: string;

    @IsString()
    @IsOptional()
    usuario_ingre?: string;
}

export class SaveDetPlanCuenDto extends SaveDto {
    @IsObject()
    @IsNotEmpty()
    @ValidateNested()
    @Type(() => ConDetPlanCuenDataDto)
    declare data: ConDetPlanCuenDataDto;
}
