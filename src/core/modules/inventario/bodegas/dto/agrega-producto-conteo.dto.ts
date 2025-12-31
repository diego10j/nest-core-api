import { IsInt } from 'class-validator';


export class AgregaProductoConteoDto {

    @IsInt()
    ide_inccf: number;

    @IsInt()
    ide_inarti: number;

}
