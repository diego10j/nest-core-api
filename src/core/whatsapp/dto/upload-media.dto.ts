import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { TelefonoWebDto } from '../web/dto/telefono-web.dto';

export class UploadMediaDto extends TelefonoWebDto {


    @IsBoolean()
    @IsOptional()
    emitSocket: boolean = true;  // true emite mensajes por socket a clientes conectados

    @IsString()
    @IsOptional()
    caption?: string;


    @IsString()
    @IsOptional()
    type?: string | 'image' | 'video' | 'document' | 'audio' | 'sticker';


    @IsString()
    @IsOptional()
    fileName?: string;

}
