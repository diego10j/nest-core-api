import { Type } from 'class-transformer';
import { IsInt, IsPositive, Min } from 'class-validator';


export class PaginationDto {

    @IsPositive()
    @Type(() => Number) // enableImplicitConversions: true
    @Min(1)
    pageSize: number;

    @IsInt()
    @Min(0)
    pageIndex: number = 0;


}