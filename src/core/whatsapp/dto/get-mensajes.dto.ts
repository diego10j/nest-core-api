import { IsInt, IsNotEmpty, IsOptional, IsPositive, IsString, Matches } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';

export class GetMensajesDto extends ServiceDto {

    // API
    @IsString()
    @IsNotEmpty()
    @Matches(/^\S*$/, { message: 'telefono no debe contener espacios' })
    telefono: string;


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
