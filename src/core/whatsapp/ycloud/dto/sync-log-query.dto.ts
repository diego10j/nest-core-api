import { IsOptional, IsString } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class SyncLogQueryDto extends QueryOptionsDto {
  @IsString()
  @IsOptional()
  estado_sync?: string;

  @IsString()
  @IsOptional()
  tipo_operacion?: string;

  @IsString()
  @IsOptional()
  fechaDesde?: string;

  @IsString()
  @IsOptional()
  fechaHasta?: string;
}
