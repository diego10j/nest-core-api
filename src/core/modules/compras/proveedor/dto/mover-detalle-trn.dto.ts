import { IsInt, IsNotEmpty } from 'class-validator';

/** Reasigna una línea de cxp_detall_transa a otra cabecera del mismo proveedor. */
export class MoverDetalleTrnDto {
    @IsInt()
    @IsNotEmpty()
    ide_cpdtr: number;

    @IsInt()
    @IsNotEmpty()
    ide_cpctr_destino: number;

    @IsInt()
    @IsNotEmpty()
    ide_geper: number;
}
