import { IsString } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';

export class BusquedaPorNombreDto extends ServiceDto {

    @IsString()
    nombre: string;

}
