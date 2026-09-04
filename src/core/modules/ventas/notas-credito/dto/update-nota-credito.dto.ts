import { IsInt, IsNotEmpty } from 'class-validator';

import { SaveNotaCreditoDto } from './save-nota-credito.dto';

/**
 * Edición de una nota de crédito mientras su comprobante SRI sigue PENDIENTE (no
 * autorizada aún) — mismos campos que la creación, más el identificador de la NC a editar.
 */
export class UpdateNotaCreditoDto extends SaveNotaCreditoDto {
    @IsInt()
    @IsNotEmpty()
    ide_cpcno: number;
}
