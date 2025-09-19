import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { MailService } from './mail.service';

@Injectable()
export class QueueMonitorService {
    private readonly logger = new Logger(QueueMonitorService.name);

    constructor(
        @InjectQueue('mail-queue') private readonly mailQueue: Queue,
        private readonly mailService: MailService,
    ) { }

    // Monitorear la cola cada minuto
    @Cron(CronExpression.EVERY_MINUTE)
    async monitorQueue() {
        try {
            const stats = await this.mailService.processMailQueue();

            if (stats.waiting > 0 || stats.active > 0) {
                this.logger.log(`🔍 Monitoreo automático: ${stats.waiting} en espera, ${stats.active} activos`);
            }
        } catch (error) {
            this.logger.error(`Error en monitoreo automático: ${error.message}`);
        }
    }

    // Limpiar jobs completados cada hora
    @Cron(CronExpression.EVERY_HOUR)
    async cleanCompletedJobs() {
        try {
            await this.mailQueue.clean(3600000, 'completed'); // Limpiar jobs completados de más de 1 hora
            this.logger.log('🧹 Jobs completados limpiados automáticamente');
        } catch (error) {
            this.logger.error(`Error limpiando jobs: ${error.message}`);
        }
    }
}