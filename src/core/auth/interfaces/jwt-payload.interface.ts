export interface JwtPayload {
  id: string;
  jti?: string; // JWT ID — requerido en refresh tokens para rotación y revocación
  exp?: number;
  iat?: number;
}
