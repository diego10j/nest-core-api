import { IsInt, IsNotEmpty } from 'class-validator';

/** Elimina una cabecera de transacción CxP; el service valida que no tenga detalle asociado. */
export class DeleteCabeceraTrnDto {
    @IsInt()
    @IsNotEmpty()
    ide_cpctr: number;

    @IsInt()
    @IsNotEmpty()
    ide_geper: number;
}
