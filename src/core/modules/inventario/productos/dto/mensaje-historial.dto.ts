import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class MensajeHistorialDto {
  @IsIn(['user', 'assistant'])
  role: 'user' | 'assistant';

  @IsString()
  @IsNotEmpty()
  contenido: string;
}
