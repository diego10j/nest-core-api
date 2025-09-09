import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class RucDto extends QueryOptionsDto {
  @IsString()
  @Length(13, 13, { message: 'El RUC debe tener 13 caracteres.' })
  ruc: string;

  @IsBoolean()
  @IsOptional()
  isSas?: boolean = false;
}
