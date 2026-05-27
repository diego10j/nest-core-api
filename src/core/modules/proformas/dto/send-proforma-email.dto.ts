import { IsArray, IsEmail, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SendProformaEmailDto {
  @IsInt()
  @IsNotEmpty()
  ide_cccpr: number;

  @IsNotEmpty()
  @IsEmail({}, { each: true })
  destinatario: string | string[];

  @IsOptional()
  @IsEmail({}, { each: true })
  @IsArray()
  cc?: string[];
}
