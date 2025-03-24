import { IsString, IsNotEmpty, Matches } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';

export class CedulaDto extends ServiceDto {

     @IsString()
     @IsNotEmpty()
     @Matches(
         /^\d{10}$/g, {
         message: 'Cédula no válida'
     })
     cedula: string;



}
