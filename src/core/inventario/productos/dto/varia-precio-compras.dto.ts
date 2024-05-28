import { IsDateString, IsInt, IsPositive } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';
import { PartialType } from '@nestjs/mapped-types';

export class VariacionPreciosComprasDto extends PartialType(ServiceDto) {

    @IsDateString()
    fechaInicio: Date;

    @IsDateString()
    fechaFin: Date;

    @IsInt()
    @IsPositive()
    ide_inarti: number;

}
