import { IsInt,   } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';



export class PerfilDto extends QueryOptionsDto {

    @IsInt()
    ide_sist: number;

}