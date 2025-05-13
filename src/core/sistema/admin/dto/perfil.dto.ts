import { IsInt,   } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';



export class PerfilDto extends ServiceDto {

    @IsInt()
    ide_sist: number;

}