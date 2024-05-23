import { IsInt, IsOptional, IsPositive, IsString } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';
import { PartialType } from '@nestjs/mapped-types';

export class CreateFolderDto extends PartialType(ServiceDto) {


    @IsString()
    folderName: string;

    @IsInt()
    @IsPositive()
    @IsOptional()
    sis_ide_arch?: number;

    @IsString()
    path: string;
}
