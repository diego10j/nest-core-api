import { IsString, IsNotEmpty, Matches } from 'class-validator';

export class RucDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{13}$/g, {
    message: 'RUC no válido',
  })
  ruc: string;
}
