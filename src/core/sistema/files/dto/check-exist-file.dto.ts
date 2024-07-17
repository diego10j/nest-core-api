import { IsInt, IsOptional, IsPositive, IsString } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';
import { PartialType } from '@nestjs/mapped-types';

export class CheckExistFileDto extends PartialType(ServiceDto) {


    @IsString()
    fileName: string;

    @IsInt()
    @IsPositive()
    @IsOptional()
    sis_ide_arch?: number;

}
