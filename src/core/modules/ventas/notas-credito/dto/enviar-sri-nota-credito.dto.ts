import { IsInt, IsNotEmpty } from 'class-validator';

export class EnviarSriNotaCreditoDto {
    /** FK → cxp_cabecera_nota */
    @IsInt()
    @IsNotEmpty()
    ide_cpcno: number;
}
