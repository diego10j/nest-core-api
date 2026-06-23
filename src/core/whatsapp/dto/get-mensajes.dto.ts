import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsPositive, IsString } from 'class-validator';

export class GetMensajesDto {
  @IsInt()
  @IsNotEmpty()
  @Type(() => Number)
  chatId: number;

  @IsInt()
  @IsPositive()
  @IsOptional()
  @Type(() => Number)
  limit?: number = 100;

  @IsString()
  @IsOptional()
  beforeId?: string;
}
