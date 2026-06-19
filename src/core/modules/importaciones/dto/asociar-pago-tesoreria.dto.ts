import { IsInt, IsNotEmpty } from 'class-validator';

export class AsociarPagoTesoreriaDto {
    @IsInt()
    @IsNotEmpty()
    ide_imcoim: number;

    @IsInt()
    @IsNotEmpty()
    ide_teccba: number;
}
