import { IsInt, IsOptional, IsUUID } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class IdProveedorDto extends QueryOptionsDto {
  @IsInt()
  @IsOptional()
  ide_geper?: number;

  @IsUUID('4')
  @IsOptional()
  uuid?: string;
}
