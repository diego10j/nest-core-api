import { IsString } from 'class-validator';

export class ExistClienteDto {
  @IsString()
  identificacion: string;
}
