import { IsBoolean, IsInt, IsNotEmpty } from 'class-validator';

export class IdPosPuntoVentaDto {
    @IsInt()
    @IsNotEmpty()
    ide_vgpos: number;
}

export class IdUsuarioPuntoVentaDto {
    @IsInt()
    @IsNotEmpty()
    ide_vgupvt: number;
}

export class SetActivoPosPuntoVentaDto {
    @IsInt()
    @IsNotEmpty()
    ide: number;

    @IsBoolean()
    @IsNotEmpty()
    activo: boolean;
}
