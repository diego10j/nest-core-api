import { IsString, IsNotEmpty, Matches } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';

export class RucDto extends ServiceDto {

    @IsString()
    @IsNotEmpty()
    @Matches(
        /^\d{13}$/g, {
        message: 'RUC no válido'
    })
    ruc: string;



}
