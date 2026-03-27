import { ArrayMinSize, ArrayNotEmpty, IsArray, IsInt, IsNumber } from 'class-validator';

export class CopiarPresentacionDto {
    /** Producto base origen del que se copian las presentaciones */
    @IsInt()
    ide_inarti: number;

    /** IDs de los productos destino que recibirán la configuración */
    @ArrayNotEmpty()
    @IsNumber({}, { each: true })
    @ArrayMinSize(1)
    @IsArray()
    values: number[];
}
