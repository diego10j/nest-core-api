import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class ContactIdWebDto {
  @IsNotEmpty({ message: 'El contactId no puede estar vacío' })
  @IsString({ message: 'El contactId debe ser una cadena de texto' })
  @Matches(/^(\d+@c\.us|[\d+]+@s\.whatsapp\.net|group\.[a-zA-Z0-9-]+@g\.us|[\d+]+@lid\.whatsapp\.net)$/, {
    message:
      'Formato de contactId no válido. Debe ser un número con @c.us, un ID de grupo (@g.us) o un ID de lista (@lid.whatsapp.net)',
  })
  contactId: string;
}
