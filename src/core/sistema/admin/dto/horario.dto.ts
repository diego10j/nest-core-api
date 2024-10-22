import { IsInt, IsPositive } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';



export class HorarioDto extends ServiceDto {

    @IsInt()
    @IsPositive()
    ide_tihor: number;

}