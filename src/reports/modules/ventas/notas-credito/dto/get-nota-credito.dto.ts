import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty } from 'class-validator';

export class GetNotaCreditoDto {
    @Type(() => Number)
    @IsInt()
    @IsNotEmpty()
    ide_cpcno: number;
}
