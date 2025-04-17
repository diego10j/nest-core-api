import { IsInt, IsNotEmpty, IsOptional, IsPositive, IsString } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';

export class GetMessagesWebDto extends ServiceDto {

    @IsString()
    @IsNotEmpty()
    chatId: string;

    @IsInt()
    @IsPositive()
    @IsOptional()
    limit?:number = 100;

    @IsString()
    @IsOptional()
    beforeId?: string;


}
