import { IsInt, IsOptional, IsString } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';

export class SearchChatDto extends ServiceDto {

    @IsString()
    texto: string;

    @IsInt()
    @IsOptional()
    lista?: number;

    @IsInt()
    @IsOptional()
    resultados?: number = 25;


}
