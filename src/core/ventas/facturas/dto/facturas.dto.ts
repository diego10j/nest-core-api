import { IsDateString, IsInt, IsOptional, IsPositive } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';

export class FacturasDto extends ServiceDto {

    @IsDateString()
    fechaInicio: Date;

    @IsDateString()
    fechaFin: Date;

    @IsInt()
    @IsPositive()
    @IsOptional()
    ide_ccdaf?: number;

    @IsInt()
    @IsPositive()
    @IsOptional()
    ide_sresc?: number;

    @IsInt()
    @IsPositive()
    @IsOptional()
    ide_ccefa?: number;
}
