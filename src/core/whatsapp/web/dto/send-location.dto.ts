import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

import { TelefonoWebDto } from './telefono-web.dto';

export class EnviarUbicacionDto extends TelefonoWebDto {
  @IsBoolean()
  @IsOptional()
  emitSocket: boolean = true; // true emite mensajes por socket a clientes conectados

  @IsNumber(
    { maxDecimalPlaces: 8 },
    {
      message: 'latitude debe ser un número con hasta 8 decimales',
    },
  )
  latitude: number;

  @IsNumber(
    { maxDecimalPlaces: 8 },
    {
      message: 'longitude debe ser un número con hasta 8 decimales',
    },
  )
  longitude: number;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  address?: string;
}
