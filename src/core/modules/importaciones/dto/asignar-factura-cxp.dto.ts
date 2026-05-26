import { IsInt, IsNotEmpty } from 'class-validator';

export class AsignarFacturaCxpDto {
    @IsInt()
    @IsNotEmpty()
    ide_imcaim: number;

    @IsInt()
    @IsNotEmpty()
    ide_cpcfa: number;
}
