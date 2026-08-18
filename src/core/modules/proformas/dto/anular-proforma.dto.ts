import { IsInt, IsNotEmpty } from 'class-validator';

export class AnularProformaDto {
  @IsInt()
  @IsNotEmpty()
  ide_cccpr: number;
}
