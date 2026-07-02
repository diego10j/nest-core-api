import { IsEnum, IsOptional } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

import { BotState } from '../interfaces/bot-state.enum';

export class BotSessionQueryDto extends QueryOptionsDto {
  // BotSessionService.getSessions() interpola este valor directo en el SQL (sin
  // parametrizar) — se valida contra el enum acá para que solo puedan llegar valores
  // conocidos, sin comillas ni caracteres especiales (evita inyección SQL).
  @IsEnum(BotState)
  @IsOptional()
  estado?: BotState;
}
