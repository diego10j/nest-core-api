import { IsBoolean, IsNotEmpty } from 'class-validator';


export class SaveDto {

    @IsBoolean()
    isUpdate: boolean;

    @IsNotEmpty()
    data: Record<string, any>; 

}