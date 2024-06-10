// update-calendario.dto.ts
import { PartialType, OmitType } from '@nestjs/mapped-types';
import { IsString } from 'class-validator';
import { EventoDto } from './evento.dto';

export class UpdateEventoDto extends PartialType(
    OmitType(EventoDto, ['id'] as const),
) {
    @IsString()
    id: string;
}
