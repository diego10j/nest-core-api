import { IsInt, IsNotEmpty } from 'class-validator';

/** Reasigna una línea de cxc_detall_transa a otra cabecera del mismo cliente. */
export class MoverDetalleTrnCxCDto {
    @IsInt()
    @IsNotEmpty()
    ide_ccdtr: number;

    @IsInt()
    @IsNotEmpty()
    ide_ccctr_destino: number;

    @IsInt()
    @IsNotEmpty()
    ide_geper: number;
}
