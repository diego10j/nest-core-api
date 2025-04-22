import { IsNotEmpty, IsString } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';


export class GetUrlImgUserDto extends ServiceDto {

    @IsString()
    @IsNotEmpty()
    idContact: string;


}
