import { IsIn, IsInt, IsString } from 'class-validator';

export enum EstadoItem {
    PENDIENTE = 'PENDIENTE',
    CONTADO = 'CONTADO',
    VALIDADO = 'VALIDADO',
    AJUSTADO = 'AJUSTADO',
    REVISION = 'REVISION',
    RECONTADO = 'RECONTADO'
}

export class UpdateEstadoDetalleConteoDto {

    @IsInt()
    ide_indcf: number;

    @IsString()
    @IsIn(Object.values(EstadoItem))
    estado_item_indcf: string;

}

