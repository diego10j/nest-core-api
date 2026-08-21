import { IsUUID } from 'class-validator';

export class ArticuloUuidDto {
  @IsUUID()
  uuid: string;
}
