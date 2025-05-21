
import { IsInt, IsString } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class SearchDto extends QueryOptionsDto {

    @IsString()
    value: string;

    @IsInt()
    limit?: number = 25;

}
