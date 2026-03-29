import { IsNotEmpty, IsString } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class TipoEtiquetaDto extends QueryOptionsDto {
    @IsNotEmpty()
    @IsString()
    tipo_ineta: string;
}
