import { IsString } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';

export class ExistClienteDto extends ServiceDto {


    @IsString()
    identificacion: string;

}
