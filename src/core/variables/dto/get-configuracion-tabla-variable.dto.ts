import { IsNotEmpty, IsString, Matches } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class GetConfiguracionTablaVariableDto extends QueryOptionsDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\S*$/, { message: 'nom_para no debe contener espacios' })
  nom_para: string;
}
