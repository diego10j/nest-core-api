import { ArrayNotEmpty, IsArray, IsString, IsNotEmpty, IsOptional, IsDateString } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';
import { PartialType } from '@nestjs/mapped-types';

export class DeleteAuditoriaDto extends PartialType(ServiceDto) {

    @IsDateString()
    fechaInicio: Date;

    @IsDateString()
    fechaFin: Date;

    @IsOptional()
    @ArrayNotEmpty()
    @IsString({ each: true })
    @IsNotEmpty({ each: true })
    @IsArray()
    ide_auac?: string[];
}