import { IsString, IsNotEmpty, Matches } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class RucDto extends QueryOptionsDto {

    @IsString()
    @IsNotEmpty()
    @Matches(
        /^\d{13}$/g, {
        message: 'RUC no válido'
    })
    ruc: string;



}
