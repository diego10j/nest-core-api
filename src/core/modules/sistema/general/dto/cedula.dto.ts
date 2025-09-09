import { IsString, IsNotEmpty, Matches } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class CedulaDto extends QueryOptionsDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{10}$/g, {
    message: 'Cédula no válida',
  })
  cedula: string;
}
