import { IsInt, IsOptional, IsUUID } from 'class-validator';

export class GetNotaQuimiaDto {
  @IsOptional()
  @IsUUID()
  uuid?: string;

  @IsOptional()
  @IsInt()
  ide_cono?: number;
}
