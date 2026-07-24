import { IsInt, IsNotEmpty } from 'class-validator';

export class SetCuentaContableProveedorDto {
    /** FK → gen_persona (proveedor) */
    @IsInt()
    @IsNotEmpty()
    ide_geper: number;

    /** FK → con_det_plan_cuen (cuenta contable a vincular) */
    @IsInt()
    @IsNotEmpty()
    ide_cndpc: number;
}
