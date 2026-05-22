import { IsBoolean, IsInt, IsNotEmpty } from 'class-validator';

export class SetActivoDto {

    @IsInt()
    @IsNotEmpty()
    ide: number;

    @IsBoolean()
    @IsNotEmpty()
    activo: boolean;
}
