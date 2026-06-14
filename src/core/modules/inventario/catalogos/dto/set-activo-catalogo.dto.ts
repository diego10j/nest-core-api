import { IsBoolean, IsInt, IsNotEmpty } from 'class-validator';

export class SetActivoCatalogoDto {
    @IsInt()
    @IsNotEmpty()
    ide: number;

    @IsBoolean()
    @IsNotEmpty()
    activo: boolean;
}
