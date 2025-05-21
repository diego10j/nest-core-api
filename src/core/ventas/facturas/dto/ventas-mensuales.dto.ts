import { IsInt, IsPositive } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { PartialType } from '@nestjs/mapped-types';

export class VentasMensualesDto extends PartialType(QueryOptionsDto) {

    @IsInt()
    @IsPositive()
    periodo: number;

}
