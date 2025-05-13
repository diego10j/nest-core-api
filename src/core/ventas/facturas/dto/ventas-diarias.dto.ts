import { IsDateString } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';
import { PartialType } from '@nestjs/mapped-types';

export class VentasDiariasDto extends PartialType(ServiceDto) {

    @IsDateString()
    fecha: string;

}
