import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class UuidDto {
  @ApiPropertyOptional({ description: 'UUID del registro', example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsUUID(4, { each: true })
  @IsOptional()
  uuid?: string;
}
