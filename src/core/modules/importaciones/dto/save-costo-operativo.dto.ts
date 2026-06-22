import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNotEmpty, IsNumber, ValidateNested } from 'class-validator';

export class CostoOperativoItemDto {
    @IsInt()
    @IsNotEmpty()
    ide_imdet: number;

    @IsNumber()
    costo_operativo_total_imdet: number;
}

export class SaveCostoOperativoDto {
    @IsInt()
    @IsNotEmpty()
    ide_imcaim: number;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CostoOperativoItemDto)
    @IsNotEmpty()
    items: CostoOperativoItemDto[];
}
