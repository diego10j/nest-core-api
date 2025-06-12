import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsPositive, IsString, Min } from 'class-validator';



export class PaginationDto {

    @IsPositive()
    @Type(() => Number) // enableImplicitConversions: true
    @Min(1)
    pageSize: number;

    @IsInt()
    @Min(0)
    pageIndex: number = 0;

    @IsIn(['true', 'false']) // Solo permite estos valores
    @IsOptional()
    lastPage?: 'true' | 'false' = 'false';


}