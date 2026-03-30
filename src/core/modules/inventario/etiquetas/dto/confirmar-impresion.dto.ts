import { IsInt, IsPositive, IsNotEmpty, IsString } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class ConfirmarImpresionDto extends QueryOptionsDto {
    @IsInt()
    @IsPositive()
    ide_inarti: number;

    @IsNotEmpty()
    @IsString()
    tipo_ineta: string;

    @IsInt()
    cantidad?: number = 1;
}
