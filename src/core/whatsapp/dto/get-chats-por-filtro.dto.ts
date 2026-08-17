import { IsIn, IsOptional } from 'class-validator';

import { GetChatsDto } from './get-chats.dto';

export class GetChatsPorFiltroDto extends GetChatsDto {
  @IsIn(['todos', 'bot', 'asesor', 'sin_asignar', 'asignado_a_mi'])
  @IsOptional()
  filtro?: string = 'todos';
}
