import { IsInt, IsNotEmpty } from 'class-validator';

export class CrearFacturaCxpImportDto {
    @IsInt()
    @IsNotEmpty()
    ide_imcaim: number;
}
