import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class FilterDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\S*$/, { message: 'column no debe contener espacios' })
  column: string;

  @IsString()
  @IsOptional()
  operator?: string = 'ILIKE';

  @IsNotEmpty()
  value: any;
}
