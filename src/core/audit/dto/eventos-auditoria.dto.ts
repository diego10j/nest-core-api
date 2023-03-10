import { IsDateString, IsInt, IsOptional, IsPositive } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';
import { PartialType } from '@nestjs/mapped-types';

export class EventosAuditoriaDto extends PartialType(ServiceDto) {

    @IsDateString()
    fechaInicio: Date;

    @IsDateString()
    fechaFin: Date;

    @IsInt()
    @IsPositive()
    @IsOptional()
    ide_usua?: number;
}