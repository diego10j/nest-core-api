import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsNotEmpty, ValidateNested } from 'class-validator';

import { DetalleTrnItemDto } from './detalle-trn-item.dto';

/** Guardado tipo-diff (crear/actualizar/eliminar) del detalle completo de una cabecera de transacción CxP. */
export class SaveDetalleCabeceraTrnDto {
    @IsInt()
    @IsNotEmpty()
    ide_cpctr: number;

    @IsInt()
    @IsNotEmpty()
    ide_geper: number;

    @IsArray()
    @ArrayMinSize(1, { message: 'La cabecera debe tener al menos una línea de detalle' })
    @ValidateNested({ each: true })
    @Type(() => DetalleTrnItemDto)
    detalles: DetalleTrnItemDto[];
}
