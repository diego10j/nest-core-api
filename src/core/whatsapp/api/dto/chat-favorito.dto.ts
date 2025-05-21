import { IsBoolean} from 'class-validator';
import { TelefonoWebDto } from '../../web/dto/telefono-web.dto';

export class ChatFavoritoDto extends TelefonoWebDto{
 
      @IsBoolean()
      favorito: boolean;

}
