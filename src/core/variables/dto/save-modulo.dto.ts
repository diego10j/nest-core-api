import { IsNotEmpty, IsNumber, IsOptional, IsString, Matches } from 'class-validator';

export class SaveModuloDto {
  @IsOptional()
  @IsNumber()
  ide_modu?: number;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\S*$/, { message: 'nom_modu no debe contener espacios' })
  nom_modu: string;
}
