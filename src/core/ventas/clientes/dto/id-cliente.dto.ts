import { IsInt, IsPositive } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';

export class IdClienteDto extends ServiceDto {


    @IsInt()
    @IsPositive()
    ide_geper: number;

}
