import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty } from 'class-validator';

export class GetLiquidacionCompraDto {
    @Type(() => Number)
    @IsInt()
    @IsNotEmpty()
    ide_cpcfa: number;
}
