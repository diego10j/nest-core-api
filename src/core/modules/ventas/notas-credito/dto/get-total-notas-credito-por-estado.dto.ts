import { IsDateString } from 'class-validator';

/** Conteo de notas de crédito de venta por estado SRI (tabs de notas-credito-list.tsx). */
export class GetTotalNotasCreditoPorEstadoDto {
    @IsDateString()
    fechaInicio: string;

    @IsDateString()
    fechaFin: string;
}
