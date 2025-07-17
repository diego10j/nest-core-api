import {  IsOptional, IsString } from 'class-validator';

export class GetVariableDto  {

    @IsString()
    @IsOptional()
    name?: string;

}