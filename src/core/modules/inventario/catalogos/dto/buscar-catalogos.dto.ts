import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class BuscarCatalogosDto extends QueryOptionsDto {
    @IsString()
    @IsNotEmpty()
    @MinLength(2)
    @MaxLength(80)
    @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
    q: string;

    @IsInt()
    @IsOptional()
    @Transform(({ value }) => (value != null ? Number(value) : 0))
    ideEmpr?: number = 0;
}
