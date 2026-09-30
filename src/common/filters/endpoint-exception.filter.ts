import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Filtro GLOBAL de excepciones HTTP: deja la respuesta de error exactamente como la genera Nest
 * (message, error, statusCode) y le AGREGA en qué endpoint ocurrió:
 *
 *   { "message": "...", "error": "Internal Server Error", "statusCode": 500,
 *     "endpoint": "api/tesoreria/conciliacion-bancaria/getConciliaciones", "method": "GET" }
 *
 * Funciona para todos los controllers sin tocarlos uno por uno. El endpoint se toma de la ruta solicitada SIN
 * el query string (puede traer datos del usuario). Los errores 5xx también se registran en el log con el
 * endpoint, que es lo que faltaba al leer el log del servidor.
 *
 * Se registra con `app.useGlobalFilters(...)` en main.ts, por lo que solo aplica al contexto HTTP (no toca a los
 * gateways de socket.io).
 */
@Catch()
export class EndpointExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger('Http');

    catch(exception: unknown, host: ArgumentsHost): void {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        const esHttp = exception instanceof HttpException;
        const status = esHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
        const cuerpo = esHttp
            ? exception.getResponse()
            : { statusCode: status, message: 'Internal server error' };
        const base: Record<string, unknown> = typeof cuerpo === 'string' ? { statusCode: status, message: cuerpo } : { ...cuerpo };

        const endpoint = (request.originalUrl ?? request.url ?? '').split('?')[0].replace(/^\/+/, '');

        if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
            const detalle = exception instanceof Error ? exception.stack ?? exception.message : String(exception);
            this.logger.error(`${request.method} /${endpoint} → ${status}: ${String(base.message)}`, esHttp ? undefined : detalle);
        }

        if (response.headersSent) return;
        response.status(status).json({ ...base, endpoint, method: request.method });
    }
}
