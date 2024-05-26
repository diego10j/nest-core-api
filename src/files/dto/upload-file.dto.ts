import { IsOptional, IsString } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';
import { PartialType } from '@nestjs/mapped-types';

export class UploadFileDto extends PartialType(ServiceDto) {



    @IsString()
    @IsOptional()
    sis_ide_arch?: string;

}
