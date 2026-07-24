import { IsInt } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class AnticiposProveedorCxPDto extends QueryOptionsDto {

    /** FK → gen_persona (proveedor) */
    @IsInt()
    ide_geper: number;
}
