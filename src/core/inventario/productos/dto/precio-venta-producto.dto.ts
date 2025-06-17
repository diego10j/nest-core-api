import { IsInt, IsOptional, IsPositive } from 'class-validator';


export class PrecioVentaProductoDto {

    @IsInt()
    @IsPositive()
    ide_inarti: number;

    @IsInt()
    @IsPositive()
    cantidad: number;

    @IsInt()
    @IsOptional()
    ide_cndfp?: number;

}
