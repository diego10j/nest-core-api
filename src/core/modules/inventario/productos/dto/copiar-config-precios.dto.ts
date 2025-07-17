import { ArrayMinSize, ArrayNotEmpty, IsArray,  IsInt, IsNotEmpty, IsNumber } from 'class-validator';


export class CopiarConfigPreciosVentaDto {

    @IsInt()
    ide_inarti: number;


    @ArrayNotEmpty()
    @IsNumber({}, { each: true })
    @ArrayMinSize(1)
    @IsArray()
    values: number[];

}
