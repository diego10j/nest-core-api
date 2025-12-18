import { IsInt, } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class GetDetallesConteoDto extends QueryOptionsDto {

    @IsInt()
    ide_inccf: number;

}
