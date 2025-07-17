import { IsInt, IsNumber, IsOptional, IsPositive } from 'class-validator';


export class PrecioVentaProductoDto {

    @IsInt()
    ide_inarti: number;

    @IsNumber()
    cantidad: number;

    @IsInt()
    @IsOptional()
    ide_cndfp?: number;

    @IsNumber()
    @IsOptional()
    @IsPositive()
    precio_compra?: number;

}
