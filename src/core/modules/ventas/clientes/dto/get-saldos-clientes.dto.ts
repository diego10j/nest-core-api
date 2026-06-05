import { IsIn, IsOptional } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class GetSaldosClientesDto extends QueryOptionsDto {
    @IsIn(['true', 'false'])
    @IsOptional()
    conDiferencias?: 'true' | 'false';
}
