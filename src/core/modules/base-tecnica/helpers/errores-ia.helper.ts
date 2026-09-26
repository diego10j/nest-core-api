/**
 * Errores de la CUENTA de OpenAI (no del documento ni de la pregunta): sin saldo, límite de gasto
 * alcanzado o API key inválida. Con estos no tiene sentido reintentar ni marcar el documento con
 * error: hay que avisar al administrador y esperar a que recargue.
 */
export type ProblemaCuentaIa = 'SIN_SALDO' | 'API_KEY';

export function problemaCuentaIa(error: unknown): ProblemaCuentaIa | null {
  const e = error as { status?: number; code?: string; error?: { code?: string; type?: string }; message?: string };
  const codigo = e?.code ?? e?.error?.code ?? e?.error?.type ?? '';
  if (['insufficient_quota', 'billing_hard_limit_reached', 'billing_not_active', 'access_terminated'].includes(codigo)) {
    return 'SIN_SALDO';
  }
  if (e?.status === 401 || codigo === 'invalid_api_key') return 'API_KEY';
  // Algunas versiones del SDK solo traen el texto.
  if (/exceeded your current quota|insufficient_quota|billing/i.test(e?.message ?? '')) return 'SIN_SALDO';
  return null;
}

/** La cuenta de OpenAI no puede atender: se detiene la extracción (no es un error del documento). */
export class CuentaIaError extends Error {
  constructor(readonly problema: ProblemaCuentaIa) {
    super(
      problema === 'SIN_SALDO'
        ? 'La cuenta de OpenAI no tiene saldo (o alcanzó su límite de gasto). Recarga saldo y reanuda.'
        : 'La API key de OpenAI no es válida. Revisa OPENAI_API_KEY en el servidor.',
    );
  }
}
