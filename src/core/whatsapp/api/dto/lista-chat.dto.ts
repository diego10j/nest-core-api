import { IsInt} from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';

export class ListaChatDto extends ServiceDto {

    @IsInt()
    ide_whlis: number;

}
