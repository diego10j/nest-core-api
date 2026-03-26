import { ArrayNotEmpty, IsArray, IsDateString, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class TopProductosDto extends QueryOptionsDto {
  @IsDateString()
  fechaInicio: string;

  @IsDateString()
  fechaFin: string;

  @IsNumber()
  @IsOptional()
  limit?: number;

  @IsNumber()
  @IsOptional()
  ide_inbod?: number;



  @ArrayNotEmpty()
  @IsNotEmpty({ each: true })
  @IsArray()
  @IsOptional()
  ide_sucu?: number[];

}
