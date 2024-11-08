import { IsBoolean, IsNotEmpty } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';

export class SaveClienteDto extends ServiceDto {

    @IsBoolean()
    isUpdate: boolean;

    @IsNotEmpty()
    data: Record<string, any>; 

}