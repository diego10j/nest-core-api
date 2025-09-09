import { IsOptional, IsUUID } from 'class-validator';

export class UuidDto {
  @IsUUID(4, { each: true })
  @IsOptional()
  uuid?: string;
}
