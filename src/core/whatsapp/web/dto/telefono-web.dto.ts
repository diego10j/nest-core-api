import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class TelefonoWebDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^(0\d{9}|593\d{9}|\+593\d{9}|\+\d{10,12})$/, {
    message: 'Número de teléfono no válido. Formatos aceptados: 0983113543, 593983113543, +593983113543, +8698524444',
  })
  telefono: string;
}
