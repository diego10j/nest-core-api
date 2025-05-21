import { IsString, IsNotEmpty, IsOptional, Matches } from 'class-validator';

export class RadialBarDto  {

    @IsString()
    @IsNotEmpty()
    @Matches(/^\S*$/, { message: 'tableLabel no debe contener espacios' })
    tableLabel: string;

    @IsString()
    @IsNotEmpty()
    @Matches(/^\S*$/, { message: 'tableValue no debe contener espacios' })
    tableValue: string;

    @IsString()
    @IsNotEmpty()
    @Matches(/^\S*$/, { message: 'primaryKey no debe contener espacios' })
    primaryKey: string;

    @IsString()
    @IsNotEmpty()
    @Matches(/^\S*$/, { message: 'columnLabel no debe contener espacios' })
    columnLabel: string;

    @IsString()
    @IsOptional()
    conditionLabel?: string;


}
