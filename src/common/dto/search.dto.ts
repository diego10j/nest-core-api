
import { IsInt, IsString } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';

export class SearchDto extends ServiceDto {

    @IsString()
    value: string;

    @IsInt()
    limit?: number = 25;

}
