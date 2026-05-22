import { IsArray, IsInt, IsNotEmpty, IsNumber, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class DistribucionItemDto {
    @IsInt()
    @IsNotEmpty()
    ide_imdet: number;

    @IsNumber()
    monto_imdico: number;
}

export class SaveDistribucionCostoDto {
    @IsInt()
    @IsNotEmpty()
    ide_imcoim: number;

    @IsString()
    @IsNotEmpty()
    metodo: 'valor_fob' | 'peso' | 'volumen' | 'cantidad' | 'manual';

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DistribucionItemDto)
    @IsNotEmpty()
    items: DistribucionItemDto[];
}
