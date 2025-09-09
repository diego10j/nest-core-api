import { IsInt, IsOptional, IsString } from 'class-validator';

export class SearchChatDto {
  @IsString()
  texto: string;

  @IsInt()
  @IsOptional()
  lista?: number;

  @IsInt()
  @IsOptional()
  resultados?: number = 25;
}
