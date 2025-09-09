import { IsInt, IsOptional, IsPositive, IsString } from 'class-validator';

export class GetChatsDto {
  // WEB
  @IsInt()
  @IsPositive()
  @IsOptional()
  limit?: number = 25;

  @IsString()
  @IsOptional()
  beforeId?: string;
}
