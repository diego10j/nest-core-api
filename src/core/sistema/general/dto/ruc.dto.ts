import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';

export class RucDto extends ServiceDto {

    @IsString()
    @Length(13, 13, { message: 'El RUC debe tener 13 caracteres.' })
    ruc: string;

    @IsBoolean()
    @IsOptional()
    isSas?: boolean = false;

}
