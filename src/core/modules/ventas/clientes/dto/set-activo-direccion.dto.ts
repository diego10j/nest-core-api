import { IsBoolean, IsInt, IsNotEmpty } from 'class-validator';

export class SetActivoDireccionDto {

    @IsInt()
    @IsNotEmpty()
    ide: number;

    @IsBoolean()
    @IsNotEmpty()
    activo: boolean;
}
