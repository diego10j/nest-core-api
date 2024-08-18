import { IsBoolean, IsOptional, ValidateNested } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';
import { PartialType } from '@nestjs/mapped-types';
import { ObjectQueryDto } from './object-query.dto';
import { Type } from 'class-transformer';


export class SaveListDto extends PartialType(ServiceDto) {

    @ValidateNested({ each: true })
    @Type(() => ObjectQueryDto)
    listQuery: ObjectQueryDto[];

    @IsBoolean()
    @IsOptional()
    audit?: boolean = false;

}