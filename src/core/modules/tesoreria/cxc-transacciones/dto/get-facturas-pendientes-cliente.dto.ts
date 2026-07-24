import { IsInt, IsNotEmpty } from 'class-validator';

export class GetFacturasPendientesClienteDto {

    /** FK → gen_persona (cliente) */
    @IsInt()
    @IsNotEmpty()
    ideGeper: number;
}
