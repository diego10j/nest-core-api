import { IsIn, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class OrderByDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\S*$/, { message: 'column no debe contener espacios' })
  column: string;

  @IsIn(['ASC', 'DESC']) // Solo permite estos valores
  @IsOptional()
  @IsString()
  direction?: 'ASC' | 'DESC' = 'ASC';
}
