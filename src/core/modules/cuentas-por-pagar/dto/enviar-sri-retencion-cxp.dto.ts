import { IsInt, IsNotEmpty } from 'class-validator';

export class EnviarSriRetencionCxPDto {
    /** FK → con_cabece_retenc */
    @IsInt()
    @IsNotEmpty()
    ide_cncre: number;
}
