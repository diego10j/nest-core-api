import { ArrayNotEmpty, IsArray, IsInt, IsNotEmpty, IsOptional } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';
import { PartialType } from '@nestjs/mapped-types';

export class DeleteAuditoriaDto extends PartialType(ServiceDto) {


    @IsOptional()
    @ArrayNotEmpty()
    @IsInt({ each: true })
    @IsNotEmpty({ each: true })
    @IsArray()
    ide_auac?: number[];
}