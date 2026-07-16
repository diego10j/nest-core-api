import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional } from 'class-validator';

export class SaveUsuarioPuntoVentaDto {
    @IsBoolean()
    @IsNotEmpty()
    isUpdate: boolean;

    @IsInt()
    @IsOptional()
    @Transform(({ value }) => value ?? null)
    ide_vgupvt?: number | null;

    @IsInt()
    @IsNotEmpty()
    ide_vgpos: number;

    @IsInt()
    @IsNotEmpty()
    ide_usua: number;
}
