import { IsDateString, IsInt, IsOptional, IsPositive } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';

export class ComprobantesInvDto extends ServiceDto {

    @IsDateString()
    fechaInicio: string;

    @IsDateString()
    fechaFin: string;

    @IsInt()
    @IsPositive()
    @IsOptional()
    ide_inbod?: number;   // bodega

    @IsInt()
    @IsPositive()
    @IsOptional()
    ide_inepi?: number;  // estado

}
