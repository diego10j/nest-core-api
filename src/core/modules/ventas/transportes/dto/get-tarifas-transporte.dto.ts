import { IsInt, IsNotEmpty } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class GetTarifasByTransporteDto extends QueryOptionsDto {
    @IsInt()
    @IsNotEmpty()
    ide_vgtra: number;
}
