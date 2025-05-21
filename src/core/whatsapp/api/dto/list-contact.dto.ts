import { IsArray} from 'class-validator';
import { TelefonoWebDto } from '../../web/dto/telefono-web.dto';

export class ListContactDto extends TelefonoWebDto {

    @IsArray()
    listas: number[];

}
