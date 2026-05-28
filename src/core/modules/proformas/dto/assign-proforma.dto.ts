import { IsInt, IsNotEmpty } from 'class-validator';

export class AssignProformaDto {
  @IsInt()
  @IsNotEmpty()
  ide_cccpr: number;

  @IsInt()
  @IsNotEmpty()
  ide_usua: number;
}
