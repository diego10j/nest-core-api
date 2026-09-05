import { IsInt, IsNotEmpty, IsOptional } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

/** Anticipos de un proveedor con saldo disponible (para elegir cuál aplicar al completar una
 * factura, o al liquidar manualmente). Sin ide_geper, lista todos (tabla de control). */
export class GetAnticiposProveedorDto extends QueryOptionsDto {
    @IsInt()
    @IsOptional()
    ide_geper?: number;
}

export class IdAnticipoProveedorDto {
    @IsInt()
    @IsNotEmpty()
    ide_teanp: number;
}
