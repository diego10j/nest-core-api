import { IsInt } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class GetFacturaDto extends QueryOptionsDto {
    @IsInt()
    ide_cccfa: number;
}
