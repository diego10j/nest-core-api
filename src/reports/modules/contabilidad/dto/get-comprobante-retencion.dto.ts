import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty } from 'class-validator';

export class GetComprobanteRetencionDto {
    @Type(() => Number)
    @IsInt()
    @IsNotEmpty()
    ide_cncre: number;
}
