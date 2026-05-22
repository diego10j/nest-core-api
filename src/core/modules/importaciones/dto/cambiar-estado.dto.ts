import { IsInt } from 'class-validator';

export class CambiarEstadoDto {

    @IsInt()
    ide_imcaim: number;

    @IsInt()
    ide_imesor_nuevo: number;

    observacion?: string;
}
