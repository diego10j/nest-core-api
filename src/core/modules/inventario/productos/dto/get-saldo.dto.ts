import { ValidateIf, IsInt, IsOptional, IsUUID } from 'class-validator';

export class GetSaldoProductoDto {
    @ValidateIf(o => o.uuid === undefined)
    @IsInt()
    @IsOptional()
    ide_inarti?: number;

    @ValidateIf(o => o.ide_inarti === undefined)
    @IsUUID(4)
    @IsOptional()
    uuid?: string;
}
