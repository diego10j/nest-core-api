import { IsDateString, IsInt} from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class TrnClienteDto extends QueryOptionsDto {

    @IsDateString()
    fechaInicio: string;

    @IsDateString()
    fechaFin: string;

    @IsInt()
    ide_geper: number;

}
