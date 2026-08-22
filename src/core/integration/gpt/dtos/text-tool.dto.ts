import { IsString } from 'class-validator';

export class TextToolDto {
  @IsString()
  readonly prompt: string;
}
