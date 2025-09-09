import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsString } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class FavoriteFileDto extends PartialType(QueryOptionsDto) {
  @IsBoolean()
  favorite: boolean;

  @IsString()
  id: string;
}
