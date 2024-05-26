import { IsBoolean, IsString } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';
import { PartialType } from '@nestjs/mapped-types';

export class FavoriteFileDto extends PartialType(ServiceDto) {


    @IsBoolean()
    favorite: boolean;

    @IsString()
    id: string;

}
