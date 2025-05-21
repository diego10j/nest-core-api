import { IsInt, IsNotEmpty, IsOptional, IsPositive, IsString } from 'class-validator';
import { TelefonoWebDto } from '../web/dto/telefono-web.dto';

export class GetMensajesDto extends TelefonoWebDto{

    // WEB
    @IsString()
    @IsNotEmpty()
    chatId: string;

    @IsInt()
    @IsPositive()
    @IsOptional()
    limit?: number = 100;

    @IsString()
    @IsOptional()
    beforeId?: string;

}
