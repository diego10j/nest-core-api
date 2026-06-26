import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsPositive, IsString } from 'class-validator';

export class GetChatsDto {
  @IsInt()
  @IsPositive()
  @IsOptional()
  @Type(() => Number)
  limit?: number = 25;

  /** Cursor compuesto: fecha_msg_whcha del último chat visible (ISO string) */
  @IsString()
  @IsOptional()
  beforeDate?: string;

  /** Cursor compuesto: ide_whcha del último chat visible (tie-breaker) */
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  beforeId?: number;
}
