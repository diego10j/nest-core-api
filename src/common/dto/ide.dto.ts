
import { IsInt } from 'class-validator';
import { ServiceDto } from './service.dto';


export class IdeDto extends ServiceDto {

    @IsInt()
    ide: number;

}
