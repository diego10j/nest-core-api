import { IsInt} from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class ListaChatDto extends QueryOptionsDto {

    @IsInt()
    ide_whlis: number;

}
