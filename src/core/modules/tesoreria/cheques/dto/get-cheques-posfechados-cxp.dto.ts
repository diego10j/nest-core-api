import { IsInt, IsOptional } from 'class-validator';

export class GetChequesPosfechadosCxPDto {

    /** FK → gen_persona: filtra los cheques posfechados de un proveedor */
    @IsInt()
    @IsOptional()
    ide_geper?: number;
}
