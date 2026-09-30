declare const jest: any;
import { BadRequestException, HttpStatus, InternalServerErrorException, NotFoundException } from '@nestjs/common';

import { EndpointExceptionFilter } from './endpoint-exception.filter';

function ejecutar(exception: unknown, url = '/api/tesoreria/conciliacion-bancaria/getConciliaciones?anio=2026', method = 'GET') {
    const respuesta = {
        headersSent: false,
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
    };
    const host: any = {
        switchToHttp: () => ({ getResponse: () => respuesta, getRequest: () => ({ originalUrl: url, url, method }) }),
    };
    new EndpointExceptionFilter().catch(exception, host);
    return respuesta;
}

describe('EndpointExceptionFilter', () => {
    beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => undefined));
    afterEach(() => jest.restoreAllMocks());

    it('agrega el endpoint (sin query string) y el método al error conservando el cuerpo original', () => {
        const r = ejecutar(new InternalServerErrorException('[ERROR] Query espera 1 parámetros únicos pero se proporcionaron 2'));
        expect(r.status).toHaveBeenCalledWith(500);
        expect(r.json).toHaveBeenCalledWith({
            statusCode: 500,
            message: '[ERROR] Query espera 1 parámetros únicos pero se proporcionaron 2',
            error: 'Internal Server Error',
            endpoint: 'api/tesoreria/conciliacion-bancaria/getConciliaciones',
            method: 'GET',
        });
    });

    it('respeta los errores de validación (mensaje como lista) y el código 400', () => {
        const r = ejecutar(new BadRequestException(['ideTecnc must be an integer']), '/api/x/y', 'POST');
        expect(r.status).toHaveBeenCalledWith(400);
        expect(r.json.mock.calls[0][0]).toMatchObject({ message: ['ideTecnc must be an integer'], endpoint: 'api/x/y', method: 'POST' });
    });

    it('convierte un error no HTTP en 500 con el endpoint', () => {
        const r = ejecutar(new Error('boom'));
        expect(r.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
        expect(r.json.mock.calls[0][0]).toMatchObject({ statusCode: 500, message: 'Internal server error', endpoint: 'api/tesoreria/conciliacion-bancaria/getConciliaciones' });
    });

    it('un error 4xx conserva su estado y mensaje', () => {
        const r = ejecutar(new NotFoundException('no existe'));
        expect(r.status).toHaveBeenCalledWith(404);
        expect(r.json.mock.calls[0][0]).toMatchObject({ statusCode: 404, message: 'no existe' });
    });
});
