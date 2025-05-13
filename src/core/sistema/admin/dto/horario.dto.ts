import { IsInt } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';



export class HorarioDto extends ServiceDto {

    @IsInt()
    ide_tihor: number;

}