import { IsInt, IsPositive } from 'class-validator';


export class PrecioVentaProductoDto {

    @IsInt()
    @IsPositive()
    ide_inarti: number;

    @IsInt()
    @IsPositive()
    cantidad: number;

}
