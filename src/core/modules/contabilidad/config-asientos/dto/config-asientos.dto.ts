import { IsArray, IsBoolean, IsInt, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class SaveCabConfAsieDto {
    @IsBoolean()
    @IsNotEmpty()
    isUpdate: boolean;

    @IsObject()
    @IsNotEmpty()
    data: {
        ide_cncca?: number;
        nombre_cncca: string;
        observacion_cncca?: string;
    };

    /** Debe enviarse en true para editar un registro cuyo nombre está en la lista protegida */
    @IsBoolean()
    @IsOptional()
    confirmar_protegido?: boolean;
}

export class DeleteCabConfAsieDto {
    @IsArray()
    @IsInt({ each: true })
    @IsNotEmpty()
    ide: number[];

    /** Debe enviarse en true para eliminar un registro cuyo nombre está en la lista protegida */
    @IsBoolean()
    @IsOptional()
    confirmar_protegido?: boolean;
}

export class GetCabConfAsieDto {
    @IsString()
    @IsOptional()
    value?: string;
}
