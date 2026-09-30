import { AuthUser } from '../interfaces';

type HeaderValue = string | string[] | undefined;
type RequestHeaders = Record<string, HeaderValue>;

const first = (value: HeaderValue): string | undefined => (Array.isArray(value) ? value[0] : value);

/**
 * Valida que los headers de contexto (X-Ide-Usua, X-Ide-Empr, X-Ide-Sucu, X-Ide-Perf, X-Login)
 * coincidan con lo que el token autorizó al usuario. El front los envía en cada petición, pero
 * como vienen del cliente no son confiables por sí solos: sin esta validación cualquier usuario
 * autenticado podría operar sobre otra empresa/sucursal/usuario cambiando un header.
 *
 * Un header ausente no se valida aquí (los endpoints que lo necesitan ya lo exigen con
 * @AppHeaders()); uno presente pero que no corresponde al token se rechaza.
 *
 * @returns mensaje del primer header inválido, o null si todo coincide.
 */
export function validateHeaderIdentity(headers: RequestHeaders, user: AuthUser): string | null {
  const ideUsua = first(headers['x-ide-usua']);
  if (ideUsua !== undefined && Number(ideUsua) !== Number(user.ide_usua)) {
    return 'X-Ide-Usua no corresponde al usuario del token';
  }

  const login = first(headers['x-login']);
  if (login !== undefined && user.login && login.trim().toLowerCase() !== user.login.trim().toLowerCase()) {
    return 'X-Login no corresponde al usuario del token';
  }

  const ideEmpr = first(headers['x-ide-empr']);
  if (ideEmpr !== undefined && !user.empresas?.some((e) => Number(e.ide_empr) === Number(ideEmpr))) {
    return 'X-Ide-Empr no está autorizada para el usuario del token';
  }

  const ideSucu = first(headers['x-ide-sucu']);
  if (ideSucu !== undefined && !user.sucursales?.some((s) => Number(s.ide_sucu) === Number(ideSucu))) {
    return 'X-Ide-Sucu no está autorizada para el usuario del token';
  }

  const idePerf = first(headers['x-ide-perf']);
  if (idePerf !== undefined && !user.perfiles?.some((p) => Number(p.ide_perf) === Number(idePerf))) {
    return 'X-Ide-Perf no está autorizado para el usuario del token';
  }

  return null;
}
