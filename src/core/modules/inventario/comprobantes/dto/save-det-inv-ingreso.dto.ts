import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsObject,
  ValidateNested,
  IsNumber,
  IsOptional,
  Min,
  IsInt,
  IsPositive,
  IsBoolean,
  IsString,
} from 'class-validator';

export class IDetInvIngresoDto {
  @IsInt()
  @IsPositive()
  ide_indci: number;

  @IsBoolean()
  verifica_indci: boolean;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @IsOptional()
  peso_verifica_inlot?: number;

  @IsString()
  @IsOptional()
  foto_verifica_indci?: string;

  @IsString()
  @IsOptional()
  observ_verifica_indci?: string;
}

export class SaveDetInvIngresoDtoDto {
  @IsNotEmpty()
  @IsObject()
  @ValidateNested()
  @Type(() => IDetInvIngresoDto)
  data: IDetInvIngresoDto;
}
