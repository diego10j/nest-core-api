import { PaginationDto } from './pagination.dto';
import { IsNotEmpty, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { OrderByDto } from './order-by.dto';
import { FilterDto } from './filter.dto';
import { GlobalFilterDto } from './global-filter.dto';


export class QueryOptionsDto {

    @IsOptional()
    @IsNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => PaginationDto)
    pagination?: PaginationDto;

    @IsOptional()
    @IsNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => GlobalFilterDto)
    globalFilter?: GlobalFilterDto;

    @IsOptional()
    @IsNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => OrderByDto)
    orderBy?: OrderByDto;

    @IsOptional()
    @IsNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => FilterDto)
    filters?: FilterDto[];

}
