import { IsString, Length } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class CedulaDto extends QueryOptionsDto {

    @IsString()
    @Length(10, 10, { message: 'La cédula debe tener 10 caracteres.' })
    cedula: string;

}
