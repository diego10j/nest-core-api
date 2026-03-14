import { IsInt } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class GetProformaDto extends QueryOptionsDto {
    @IsInt()
    ide_cccpr: number;
}
