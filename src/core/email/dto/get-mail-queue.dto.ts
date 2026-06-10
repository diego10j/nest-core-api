import { IsIn, IsOptional, IsString } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

const ESTADOS_VALIDOS = ['ENVIADO', 'ERROR', 'ENVIANDO', 'PENDIENTE', 'PROCESANDO', 'REINTENTANDO'] as const;

export class GetMailQueueDto extends QueryOptionsDto {
  @IsOptional()
  @IsString()
  remitente?: string;

  @IsOptional()
  @IsString()
  @IsIn(ESTADOS_VALIDOS)
  estado_coco?: string;
}
