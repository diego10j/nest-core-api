import { IsBoolean, IsInt, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class GetCatalogosDto extends QueryOptionsDto {
    @IsOptional()
    @IsBoolean()
    @Transform(({ value }) => value === 'true' || value === true)
    soloActivos?: boolean;

    @IsInt()
    @IsOptional()
    @Transform(({ value }) => (value != null ? Number(value) : 0))
    ideEmpr?: number = 0;
}
