import { IsInt, IsString } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';

export class FindChatDto extends ServiceDto {

    @IsString()
    texto: string;

    @IsInt()
    resultados: number = 50;
}
