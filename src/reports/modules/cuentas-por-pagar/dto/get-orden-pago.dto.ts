import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty } from 'class-validator';

export class GetOrdenPagoDto {
    @Type(() => Number)
    @IsInt()
    @IsNotEmpty()
    ide_cpcop: number;
}
