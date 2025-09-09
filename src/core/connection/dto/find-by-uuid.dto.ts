import { IsString, IsNotEmpty, IsUUID, IsOptional, Matches } from 'class-validator';

export class FindByUuidDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\S*$/, { message: 'module no debe contener espacios' })
  module: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\S*$/, { message: 'tableName no debe contener espacios' })
  tableName: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\S*$/, { message: 'primaryKey no debe contener espacios' })
  primaryKey: string;

  @IsUUID(4, { each: true })
  @IsOptional()
  uuid?: string;

  @IsString()
  @IsOptional()
  columns?: string;
}
