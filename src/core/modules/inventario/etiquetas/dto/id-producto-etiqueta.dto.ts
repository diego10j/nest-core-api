import { IsInt, IsPositive, IsNotEmpty, IsString } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class IdProductoEtiquetaDto extends QueryOptionsDto {
    @IsInt()
    @IsPositive()
    ide_inarti: number;

    @IsNotEmpty()
    @IsString()
    tipo_ineta: string;
}
