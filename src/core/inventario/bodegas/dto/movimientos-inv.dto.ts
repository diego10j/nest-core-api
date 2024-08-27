import { IsDateString, IsInt, IsOptional, IsPositive } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';

export class MovimientosInvDto extends ServiceDto {

    @IsDateString()
    fechaInicio: Date;

    @IsDateString()
    fechaFin: Date;

    @IsInt()
    @IsPositive()
    @IsOptional()
    ide_inbod?: number;


}
