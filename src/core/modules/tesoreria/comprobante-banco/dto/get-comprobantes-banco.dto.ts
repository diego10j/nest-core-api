import { IsIn, IsInt, IsOptional } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class GetComprobantesBancoDto extends QueryOptionsDto {
    @IsInt()
    @IsOptional()
    ideTeclb?: number;

    @IsIn(['enviada', 'recibida'])
    @IsOptional()
    tipoTrnsTeincb?: string;
}
