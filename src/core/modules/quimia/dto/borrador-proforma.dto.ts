import { IsUUID } from 'class-validator';

export class BorradorProformaDto {
  @IsUUID()
  uuid: string;
}
