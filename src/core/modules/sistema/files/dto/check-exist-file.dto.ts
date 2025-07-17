import { IsInt, IsOptional, IsPositive, IsString } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { PartialType } from '@nestjs/mapped-types';

export class CheckExistFileDto extends PartialType(QueryOptionsDto) {


    @IsString()
    fileName: string;

    @IsInt()
    @IsPositive()
    @IsOptional()
    sis_ide_arch?: number;

}
