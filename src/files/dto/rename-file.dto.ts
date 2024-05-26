import { IsInt, IsOptional, IsPositive, IsString } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';
import { PartialType } from '@nestjs/mapped-types';

export class RenameFileDto extends PartialType(ServiceDto) {


    @IsString()
    fileName: string;

    @IsString()
    id: string;

    @IsInt()
    @IsPositive()
    @IsOptional()
    sis_ide_arch?: number;

}
