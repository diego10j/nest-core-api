import { IsInt, IsNotEmpty, Min } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class ComprasMensualesProveedorDto extends QueryOptionsDto {
    /** FK → gen_persona (proveedor) */
    @IsInt()
    @IsNotEmpty()
    ide_geper: number;

    /** Año del período (ej. 2026) */
    @IsInt()
    @Min(2000)
    periodo: number;
}
