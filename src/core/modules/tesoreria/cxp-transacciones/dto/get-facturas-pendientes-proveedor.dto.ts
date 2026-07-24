import { IsInt, IsNotEmpty } from 'class-validator';

export class GetFacturasPendientesProveedorDto {

    /** FK → gen_persona (proveedor) */
    @IsInt()
    @IsNotEmpty()
    ideGeper: number;
}
