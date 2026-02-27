// tabla: con_cab_plan_cuen
import { Type } from 'class-transformer';
import {
    IsBoolean,
    IsDateString,
    IsNotEmpty,
    IsNumber,
    IsObject,
    IsOptional,
    IsString,
    MaxLength,
    ValidateNested,
} from 'class-validator';

import { SaveDto } from 'src/common/dto/save.dto';

export class ConCabPlanCuenDataDto {
    @IsNumber()
    @IsOptional()
    ide_cncpc?: number;

    @IsNumber()
    @IsOptional()
    ide_empr?: number;

    @IsNumber()
    @IsOptional()
    ide_sucu?: number;

    @IsString()
    @IsNotEmpty()
    @MaxLength(30)
    nombre_cncpc: string;

    @IsDateString()
    @IsOptional()
    fecha_inici_cncpc?: string;

    @IsDateString()
    @IsOptional()
    fecha_final_cncpc?: string;

    @IsString()
    @IsOptional()
    @MaxLength(100)
    observacion_cncpc?: string;

    @IsString()
    @IsOptional()
    @MaxLength(50)
    mascara_cncpc?: string;

    @IsBoolean()
    @IsOptional()
    activo_cncpc?: boolean;
}

export class SaveCabPlanCuenDto extends SaveDto {
    @IsObject()
    @IsNotEmpty()
    @ValidateNested()
    @Type(() => ConCabPlanCuenDataDto)
    declare data: ConCabPlanCuenDataDto;
}
