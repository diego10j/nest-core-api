import { IsBoolean, IsInt, IsOptional } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class GetCuentasBancoDto extends QueryOptionsDto {
    @IsInt()
    @IsOptional()
    ideTeban?: number;

    @IsBoolean()
    @IsOptional()
    hacePagos?: boolean;

    @IsBoolean()
    @IsOptional()
    haceCheque?: boolean;
}
