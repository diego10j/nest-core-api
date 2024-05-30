import { Type } from 'class-transformer';
import { IsInt, IsPositive, Min } from 'class-validator';


export class PaginationDto {

    @IsPositive()
    @Type(() => Number) // enableImplicitConversions: true
    rows: number;

    @IsInt()
    @Min(0)
    @IsPositive()
    page: number = 1;


}