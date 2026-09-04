import { IsInt, IsNotEmpty } from 'class-validator';

/** Elimina una cabecera de transacción CxC; el service valida que no tenga detalle asociado. */
export class DeleteCabeceraTrnCxCDto {
    @IsInt()
    @IsNotEmpty()
    ide_ccctr: number;

    @IsInt()
    @IsNotEmpty()
    ide_geper: number;
}
