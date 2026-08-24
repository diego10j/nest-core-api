import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SaveBancoDto {
    @IsInt()
    @IsOptional()
    ideTeban?: number;

    @IsString()
    @IsNotEmpty()
    nombreTeban: string;

    @IsString()
    @IsOptional()
    contactoTeban?: string;

    @IsString()
    @IsOptional()
    telefonoTeban?: string;

    @IsString()
    @IsOptional()
    fotoTeban?: string;

    @IsString()
    @IsOptional()
    colorTeban?: string;

    @IsBoolean()
    @IsOptional()
    esTarjetaTeban?: boolean;

    /**
     * FK → gen_persona: proveedor/procesador de tarjeta (ej. Bendo) por defecto para las
     * cuentas de este banco - se usa cuando la cuenta puntual no tiene su propio
     * ideGeperComisionTecba. Solo aplica cuando esTarjetaTeban = true.
     */
    @IsInt()
    @IsOptional()
    ideGeperComisionTeban?: number;

    /**
     * FK → tes_cuenta_banco: cuenta destino de acreditación por defecto para las cuentas de
     * este banco - se usa cuando la cuenta puntual no tiene su propio
     * ideTecbaDestinoAcredit. Solo aplica cuando esTarjetaTeban = true.
     */
    @IsInt()
    @IsOptional()
    ideTecbaDestinoAcreditTeban?: number;
}
