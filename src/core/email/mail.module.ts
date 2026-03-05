import { Global, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { CampaignController } from './controllers/campaign.controller';
import { MailController } from './controllers/mail.controller';
import { TemplateController } from './controllers/template.controller';
import { EMAIL_PROVIDER_TOKEN } from './providers/email-provider.interface';
import { ResendEmailProvider } from './providers/resend-email.provider';
import { AdjuntoCorreoService } from './services/adjunto.service';
import { CampaignService } from './services/campaign.service';
import { MailService } from './services/mail.service';
import { TemplateService } from './services/template.service';
import { TestMailService } from './services/test-mail.service';

/**
 * Módulo de correo electrónico con Resend como proveedor.
 *
 * Sin Bull: Resend gestiona la cola de entrega y reintentos de transporte.
 * CampaignService usa @Cron para procesar campañas pendientes.
 * El TOKEN EMAIL_PROVIDER_TOKEN permite intercambiar cualquier IEmailProvider
 * sin acoplar el módulo a Resend (principio DIP).
 */
@Global()
@Module({
  imports: [
    ScheduleModule.forRoot(), // Necesario para @Cron en CampaignService
  ],
  controllers: [MailController, CampaignController, TemplateController],
  providers: [
    // Proveedor de envío (Resend) — intercambiable vía TOKEN
    {
      provide: EMAIL_PROVIDER_TOKEN,
      useClass: ResendEmailProvider,
    },
    MailService,
    TestMailService,
    CampaignService,
    TemplateService,
    AdjuntoCorreoService,
  ],
  exports: [MailService, CampaignService, TemplateService, TestMailService],
})
export class MailModule {}
