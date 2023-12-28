import { IsDateString, IsInt, IsOptional, IsPositive } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';
import { PartialType } from '@nestjs/mapped-types';

export class SaldoInicialDto extends PartialType(ServiceDto) {

    @IsDateString()
    fecha: Date;

    @IsInt()
    @IsPositive()
    ide_inarti: number;

    @IsInt()
    @IsPositive()
    @IsOptional()
    ide_inbod?: number;

}
