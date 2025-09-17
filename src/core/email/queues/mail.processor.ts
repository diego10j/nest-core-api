import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { MailService } from '../services/mail.service';
import { MAIL_QUEUE } from '../config';


@Processor(MAIL_QUEUE)
export class MailProcessor {
    private readonly logger = new Logger(MailProcessor.name);

    constructor(private readonly mailService: MailService) { }

    @Process('send-mail')
    async handleSendMail(job: Job) {
        try {
            this.logger.log(`Procesando correo en cola: ${job.id}`);

            // Extraer datos del job
            const { destinatario, asunto, contenido, ide_corr, variables } = job.data;

            // Aquí iría la lógica real de envío usando nodemailer
            // Por ahora simulamos el envío
            this.logger.log(`Enviando correo a: ${destinatario}`);
            this.logger.log(`Asunto: ${asunto}`);

            // Simular envío exitoso
            await new Promise(resolve => setTimeout(resolve, 1000));

            this.logger.log(`Correo enviado exitosamente: ${job.id}`);

            return { success: true, jobId: job.id };
        } catch (error) {
            this.logger.error(`Error procesando correo ${job.id}: ${error.message}`);

            // Reintentar si no ha excedido el máximo de intentos
            if (job.attemptsMade < 3) {
                throw error; // Bull reintentará automáticamente
            }

            // Máximo de intentos alcanzado, marcar como fallido
            this.logger.error(`Correo ${job.id} falló después de 3 intentos`);
            return { success: false, error: error.message };
        }
    }

    @Process('process-queue')
    async handleProcessQueue(job: Job) {
        try {
            this.logger.log('Procesando cola de correos pendientes');
            await this.mailService.processMailQueue();
            return { success: true, processed: true };
        } catch (error) {
            this.logger.error(`Error procesando cola: ${error.message}`);
            throw error;
        }
    }
}