import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsNotEmpty, ValidateNested } from 'class-validator';

import { DetalleTrnItemCxCDto } from './detalle-trn-item-cxc.dto';

/** Guardado tipo-diff (crear/actualizar/eliminar) del detalle completo de una cabecera de transacción CxC. */
export class SaveDetalleCabeceraTrnCxCDto {
    @IsInt()
    @IsNotEmpty()
    ide_ccctr: number;

    @IsInt()
    @IsNotEmpty()
    ide_geper: number;

    @IsArray()
    @ArrayMinSize(1, { message: 'La cabecera debe tener al menos una línea de detalle' })
    @ValidateNested({ each: true })
    @Type(() => DetalleTrnItemCxCDto)
    detalles: DetalleTrnItemCxCDto[];
}
