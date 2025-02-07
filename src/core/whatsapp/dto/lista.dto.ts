import { IsInt} from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';

export class ListaDto extends ServiceDto {

    @IsInt()
    ide_whlis: number;

}
