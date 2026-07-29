import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty } from 'class-validator';

export class GetGuiaRemisionDto {
    @Type(() => Number)
    @IsInt()
    @IsNotEmpty()
    ide_ccgui: number;
}
