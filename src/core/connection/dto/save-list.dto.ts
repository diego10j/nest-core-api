import { IsBoolean, IsOptional, ValidateNested } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { PartialType } from '@nestjs/mapped-types';
import { ObjectQueryDto } from './object-query.dto';
import { Type } from 'class-transformer';


export class SaveListDto extends PartialType(QueryOptionsDto) {

    @ValidateNested({ each: true })
    @Type(() => ObjectQueryDto)
    listQuery: ObjectQueryDto[];

    @IsBoolean()
    @IsOptional()
    audit?: boolean = false;

}