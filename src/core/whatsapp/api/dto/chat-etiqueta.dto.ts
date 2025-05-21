import { IsNumber } from 'class-validator';
import { TelefonoWebDto } from '../../web/dto/telefono-web.dto';

export class ChatEtiquetaDto extends TelefonoWebDto {

    @IsNumber()
    etiqueta: boolean;

}
