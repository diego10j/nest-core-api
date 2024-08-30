import { IsBoolean, IsOptional } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';

export class PuntosEmisionFacturasDto extends ServiceDto {

    @IsBoolean()
    @IsOptional()
    filterSucu?: boolean = true;

}
