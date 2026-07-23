import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePerfilUsuarioDto {
  @IsString()
  @IsOptional()
  @MaxLength(200)
  nom_usua?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  avatar_usua?: string;
}
