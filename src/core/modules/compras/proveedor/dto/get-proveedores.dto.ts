import { IsIn, IsOptional } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class GetProveedoresDto extends QueryOptionsDto {
    @IsIn(['true'])
    @IsOptional()
    activos?: 'true';
}
