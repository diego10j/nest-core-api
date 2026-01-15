export interface JwtPayload {
  id: string;
  exp?: number; // Timestamp de expiración (agregado por JWT automáticamente)
  iat?: number; // Timestamp de emisión (agregado por JWT automáticamente)
}
