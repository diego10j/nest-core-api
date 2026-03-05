import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

import {
    EmailAttachmentOptions,
    IEmailProvider,
    SendEmailOptions,
    SendEmailResult,
} from './email-provider.interface';

/**
 * Implementación del proveedor de email usando Resend (https://resend.com).
 *
 * Principios aplicados:
 *  - SRP: única responsabilidad → comunicación HTTP con la API de Resend.
 *  - OCP: se puede sustituir por otro proveedor sin modificar los consumidores.
 *  - DIP: los consumidores dependen de IEmailProvider, no de esta clase.
 *
 * La API Key se pasa en cada llamada a `send()` porque el sistema soporta
 * múltiples cuentas por empresa (almacenadas en sis_correo.clave_corr).
 * Se cachean instancias de Resend por API Key para evitar re-instanciaciones
 * innecesarias sin sacrificar aislamiento entre cuentas.
 */
@Injectable()
export class ResendEmailProvider implements IEmailProvider {
    private readonly logger = new Logger(ResendEmailProvider.name);

    /** Caché de clientes Resend indexada por API Key */
    private readonly clientCache = new Map<string, Resend>();

    // ──────────────────────────────────────────────
    // IEmailProvider
    // ──────────────────────────────────────────────

    async send(options: SendEmailOptions, apiKey: string): Promise<SendEmailResult> {
        this.validarApiKey(apiKey);

        const client = this.obtenerCliente(apiKey);

        const { data, error } = await client.emails.send({
            from: this.formatearFrom(options.from.name, options.from.address),
            to: this.normalizarDestinatarios(options.to),
            subject: options.subject,
            html: options.html,
            ...(options.attachments?.length ? { attachments: this.mapearAdjuntos(options.attachments) } : {}),
        });

        if (error) {
            this.logger.error(`Resend API error: ${error.message}`);
            throw new Error(`Error al enviar correo via Resend: ${error.message}`);
        }

        this.logger.log(`✅ Correo enviado via Resend. ID: ${data?.id}`);

        return {
            messageId: data?.id ?? '',
            success: true,
        };
    }

    // ──────────────────────────────────────────────
    // Métodos privados de soporte
    // ──────────────────────────────────────────────

    /**
     * Devuelve un cliente Resend desde caché o crea uno nuevo.
     * Principio de eficiencia: evita re-instanciar para la misma API Key.
     */
    private obtenerCliente(apiKey: string): Resend {
        if (!this.clientCache.has(apiKey)) {
            this.clientCache.set(apiKey, new Resend(apiKey));
            this.logger.debug('Nuevo cliente Resend creado y almacenado en caché');
        }
        return this.clientCache.get(apiKey)!;
    }

    /** Formatea el campo "from" según el estándar RFC 5322: "Nombre <email>" */
    private formatearFrom(nombre: string, email: string): string {
        return nombre ? `${nombre} <${email}>` : email;
    }

    /** Normaliza destinatarios a siempre ser un array */
    private normalizarDestinatarios(to: string | string[]): string[] {
        if (Array.isArray(to)) return to.filter(Boolean);
        // Soporte para string con múltiples emails separados por coma
        return to
            .split(',')
            .map((e) => e.trim())
            .filter(Boolean);
    }

    /**
     * Convierte adjuntos al formato que espera el SDK de Resend.
     * Resend acepta content como: Buffer | base64 string | ArrayBuffer
     */
    private mapearAdjuntos(adjuntos: EmailAttachmentOptions[]) {
        return adjuntos.map((adj) => ({
            filename: adj.filename,
            content: adj.content,
            ...(adj.contentType ? { type: adj.contentType } : {}),
        }));
    }

    /** Validación defensiva de la API Key antes de llamar a Resend */
    private validarApiKey(apiKey: string): void {
        if (!apiKey || apiKey.trim() === '') {
            throw new Error(
                'API Key de Resend no configurada. ' +
                'Configura clave_corr en la cuenta de correo (sis_correo) con una Resend API Key válida (re_...).',
            );
        }
        if (!apiKey.startsWith('re_')) {
            this.logger.warn(
                'La clave_corr no tiene el prefijo "re_" esperado para Resend. Verifica la configuración de la cuenta.',
            );
        }
    }
}
