import * as Handlebars from 'handlebars';

/**
 * Helper Handlebars: {{formatDate fecha}}
 *
 * Convierte cualquier valor de fecha (Date, string ISO, timestamp) a formato legible en español.
 * Ejemplo de salida: "martes, 19 de mayo de 2026"
 *
 * Registro en NestJS (main.ts o módulo donde configures Handlebars):
 *
 *   import { registerHelpers } from './helpers/handlebars.helpers';
 *   registerHelpers();
 *
 * O directamente en el módulo de mailer si usas @nestjs-modules/mailer:
 *   HandlebarsAdapter → options.helpers
 */
export function registerHelpers(hbs: typeof Handlebars = Handlebars): void {
    hbs.registerHelper('formatDate', (value: unknown): string => {
        if (!value) return '';

        const date = value instanceof Date ? value : new Date(value as string);

        if (isNaN(date.getTime())) return String(value);

        return date.toLocaleDateString('es-EC', {
            weekday: 'long',   // martes
            day: 'numeric', // 19
            month: 'long',   // mayo
            year: 'numeric', // 2026
            timeZone: 'America/Guayaquil',
        });
    });

    /**
     * Helper adicional: {{capitalizeWords texto}}
     * Convierte "juan pérez" → "Juan Pérez"
     * Útil si el nombre del vendedor viene en minúsculas desde la BD.
     * (El CSS text-transform:capitalize ya lo hace visualmente,
     *  pero este helper lo aplica al valor real si lo necesitas en PDF u otros usos.)
     */
    hbs.registerHelper('capitalizeWords', (value: unknown): string => {
        if (!value || typeof value !== 'string') return '';
        return value
            .toLowerCase()
            .replace(/(?:^|\s)\S/g, (char) => char.toUpperCase());
    });

    /**
     * Helper: {{whatsappNumber telefono}}
     * Convierte un telefono local a formato internacional para wa.me.
     * Ejemplo: 0991234567 -> 593991234567
     */
    hbs.registerHelper('whatsappNumber', (value: unknown): string => {
        if (!value) return '';

        const digits = String(value).replace(/\D/g, '');
        if (!digits) return '';
        if (digits.startsWith('593')) return digits;

        return `593${digits.replace(/^0+/, '')}`;
    });
}