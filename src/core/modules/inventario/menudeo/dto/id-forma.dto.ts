import { IsInt, IsPositive } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class IdFormaDto extends QueryOptionsDto {
    @IsInt()
    @IsPositive()
    ide_inmfor: number;
}
