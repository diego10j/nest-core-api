import { IsInt, IsPositive } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class CantonesDto extends QueryOptionsDto {


    @IsInt()
    ide_geprov: number;

}
