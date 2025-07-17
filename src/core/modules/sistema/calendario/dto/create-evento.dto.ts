// create-calendario.dto.ts

import { PartialType } from '@nestjs/mapped-types';
import { EventoDto } from './evento.dto';

export class CreateEventoDto extends PartialType(EventoDto) {}
