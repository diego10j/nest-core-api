import { IsInt, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class GetCatalogoByPathDto extends QueryOptionsDto {
    @IsString()
    @IsOptional()
    @Transform(({ value }) => value || null)
    path?: string;

    @IsInt()
    @IsOptional()
    @Transform(({ value }) => (value != null ? Number(value) : 0))
    ideEmpr?: number = 0;
}
