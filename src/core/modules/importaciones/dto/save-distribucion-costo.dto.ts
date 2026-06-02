import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsNotEmpty, IsNumber, ValidateNested } from 'class-validator';

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

    @IsIn(['valor_fob', 'peso', 'volumen', 'cantidad', 'manual'])
    @IsNotEmpty()
    metodo: 'valor_fob' | 'peso' | 'volumen' | 'cantidad' | 'manual';

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DistribucionItemDto)
    @IsNotEmpty()
    items: DistribucionItemDto[];
}
