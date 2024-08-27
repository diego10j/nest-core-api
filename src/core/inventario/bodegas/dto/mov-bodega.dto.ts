import { IsDateString, IsInt, IsPositive } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';

export class MovimientosBodegaDto extends ServiceDto {

    @IsDateString()
    fechaInicio: Date;

    @IsDateString()
    fechaFin: Date;

    @IsInt()
    @IsPositive()
    ide_inbod: number;

}
