import { PartialType } from '@nestjs/mapped-types';
import { IsInt, IsOptional, IsPositive, IsString } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class CreateFolderDto extends PartialType(QueryOptionsDto) {
  @IsString()
  folderName: string;

  @IsInt()
  @IsPositive()
  @IsOptional()
  sis_ide_arch?: number;

  @IsInt()
  @IsPositive()
  @IsOptional()
  ide_inarti?: number;
}
