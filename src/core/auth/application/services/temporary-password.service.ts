import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { envs } from 'src/config/envs';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { BUILTIN_TEMPLATES } from 'src/core/email/config';
import { MailService } from 'src/core/email/services/mail.service';
import { TemplateService } from 'src/core/email/services/template.service';
import { generateTemporaryPassword, maskEmail } from 'src/util/helpers/password-util';

const APP_NAME = 'Pro-ERP';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface TemporaryCredentials {
  /** Contraseña en texto plano: solo debe usarse para hashearla y enviarla por correo */
  password: string;
  /** Envía el correo; lanza error si falla. Llamar ANTES de guardar la clave. */
  send: () => Promise<void>;
  /** Correo enmascarado para mostrar en la respuesta (j***@dominio.com) */
  maskedEmail: string;
}

/**
 * Prepara la contraseña temporal de un usuario y su correo de credenciales.
 *
 * Flujo seguro: primero se valida que el usuario tenga un correo válido, luego se envía el correo
 * y SOLO si el envío fue bien se guarda la clave nueva. Así nunca queda una clave cambiada que
 * nadie conoce (si el correo falla, la clave anterior sigue vigente).
 */
@Injectable()
export class TemporaryPasswordService {
  private readonly logger = new Logger(TemporaryPasswordService.name);

  constructor(
    private readonly dataSource: DataSourceService,
    private readonly mailService: MailService,
    private readonly templateService: TemplateService,
  ) {}

  async prepare(ideUsua: number, motivo: 'alta' | 'reseteo', enviadoPor = 'sistema'): Promise<TemporaryCredentials> {
    const query = new SelectQuery(
      `SELECT nom_usua, nick_usua, mail_usua, ide_empr FROM sis_usuario WHERE ide_usua = $1`,
    );
    query.addNumberParam(1, ideUsua);
    const usuario = await this.dataSource.createSingleQuery(query);

    if (!usuario) {
      throw new BadRequestException('Usuario no encontrado');
    }
    const email = String(usuario.mail_usua || '').trim();
    if (!EMAIL_REGEX.test(email)) {
      throw new BadRequestException(
        'El usuario no tiene un correo válido registrado: no se puede enviar la contraseña temporal. ' +
          'Registre el correo del usuario e intente de nuevo.',
      );
    }

    const password = generateTemporaryPassword();
    const asunto =
      motivo === 'alta' ? `Tus credenciales de acceso a ${APP_NAME}` : `Tu contraseña temporal de ${APP_NAME}`;

    const send = async () => {
      let html: string;
      try {
        html = await this.templateService.compileBuiltInTemplate(BUILTIN_TEMPLATES.CREDENCIALES_ACCESO, {
          title: asunto,
          appName: APP_NAME,
          nombre: usuario.nom_usua,
          usuario: usuario.nick_usua || email,
          password,
          loginUrl: envs.appLoginUrl,
          esNuevoUsuario: motivo === 'alta',
        });
        await this.mailService.sendMail({ destinatario: email, asunto, contenido: html }, usuario.ide_empr, enviadoPor);
      } catch (error) {
        // El mensaje del error nunca incluye la contraseña
        this.logger.error(`No se pudo enviar la contraseña temporal al usuario ${ideUsua}: ${error?.message}`);
        throw new InternalServerErrorException(
          'No se pudo enviar el correo con la contraseña temporal; no se modificó la contraseña del usuario.',
        );
      }
    };

    return { password, send, maskedEmail: maskEmail(email) };
  }
}
