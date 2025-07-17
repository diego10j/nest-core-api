import { IsBoolean, IsInt, IsOptional, IsString, IsDate, IsDateString } from 'class-validator';
import { IsAfterOrEqualTo, IsBeforeOrEqualTo } from 'src/common/decorators/date-validations.decorator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class EventoDto extends QueryOptionsDto {

  @IsInt()
  ide_cale: number;

  @IsString()
  id: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsDateString()
  @IsBeforeOrEqualTo('fecha_fin_cale', {
    message: 'Fecha Inicio debe ser menor o igual que la Fecha fin',
  })
  start: string;

  @IsDateString()
  @IsAfterOrEqualTo('fecha_inicio_cale', {
    message: 'Fecha fin debe ser mayor o igual que la Fecha inicio',
  })
  end: string;

  @IsOptional()
  @IsBoolean()
  allday?: boolean;

  @IsOptional()
  @IsString()
  color?: string;

  @IsInt()
  ide_usua: number;

  @IsOptional()
  @IsBoolean()
  publico_cale?: boolean;

  @IsOptional()
  @IsBoolean()
  notificar_cale?: boolean;

}
