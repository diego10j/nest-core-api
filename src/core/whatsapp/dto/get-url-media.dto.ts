import { IsNotEmpty, IsString } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';

export class GetUrlArchivoDto extends ServiceDto {

    @IsString()
    @IsNotEmpty()
    id: string;

}
