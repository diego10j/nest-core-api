import { IsBoolean, IsNotEmpty } from 'class-validator';


export class SaveClienteDto {

    @IsBoolean()
    isUpdate: boolean;

    @IsNotEmpty()
    data: Record<string, any>; 

}