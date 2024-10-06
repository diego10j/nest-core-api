import { IsString } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';

export class ContentProductDto extends ServiceDto {
  @IsString()
  readonly product: string;

}
