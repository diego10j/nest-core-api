/**
 * Provincias del Ecuador + ciudades principales, con matching tolerante para el paso
 * de "provincia" del flujo de envío del bot: el cliente no tiene que escribir el nombre
 * exacto — se aceptan mayúsculas/minúsculas, tildes omitidas, typos leves (distancia de
 * edición ≤ 2) y ciudades conocidas ("Quito" → Pichincha). Devuelve siempre el nombre
 * canónico de la provincia, o null si no hay coincidencia razonable (el bot re-pregunta).
 */

const PROVINCIAS = [
  'Azuay', 'Bolívar', 'Cañar', 'Carchi', 'Chimborazo', 'Cotopaxi', 'El Oro',
  'Esmeraldas', 'Galápagos', 'Guayas', 'Imbabura', 'Loja', 'Los Ríos', 'Manabí',
  'Morona Santiago', 'Napo', 'Orellana', 'Pastaza', 'Pichincha', 'Santa Elena',
  'Santo Domingo de los Tsáchilas', 'Sucumbíos', 'Tungurahua', 'Zamora Chinchipe',
];

// Ciudades que los clientes suelen responder en vez de la provincia.
const CIUDAD_A_PROVINCIA: Record<string, string> = {
  'quito': 'Pichincha', 'cayambe': 'Pichincha', 'sangolqui': 'Pichincha',
  'guayaquil': 'Guayas', 'duran': 'Guayas', 'daule': 'Guayas', 'milagro': 'Guayas', 'samborondon': 'Guayas',
  'cuenca': 'Azuay', 'gualaceo': 'Azuay',
  'ambato': 'Tungurahua', 'banos': 'Tungurahua',
  'machala': 'El Oro', 'pasaje': 'El Oro', 'santa rosa': 'El Oro', 'huaquillas': 'El Oro',
  'manta': 'Manabí', 'portoviejo': 'Manabí', 'chone': 'Manabí', 'bahia de caraquez': 'Manabí', 'pedernales': 'Manabí',
  'ibarra': 'Imbabura', 'otavalo': 'Imbabura', 'atuntaqui': 'Imbabura',
  'riobamba': 'Chimborazo',
  'latacunga': 'Cotopaxi', 'la mana': 'Cotopaxi',
  'tulcan': 'Carchi',
  'azogues': 'Cañar', 'la troncal': 'Cañar',
  'guaranda': 'Bolívar',
  'babahoyo': 'Los Ríos', 'quevedo': 'Los Ríos', 'ventanas': 'Los Ríos', 'buena fe': 'Los Ríos',
  'salinas': 'Santa Elena', 'la libertad': 'Santa Elena', 'ballenita': 'Santa Elena',
  'santo domingo': 'Santo Domingo de los Tsáchilas',
  'tena': 'Napo',
  'puyo': 'Pastaza',
  'macas': 'Morona Santiago',
  'zamora': 'Zamora Chinchipe', 'yantzaza': 'Zamora Chinchipe',
  'lago agrio': 'Sucumbíos', 'nueva loja': 'Sucumbíos', 'shushufindi': 'Sucumbíos',
  'coca': 'Orellana', 'el coca': 'Orellana', 'francisco de orellana': 'Orellana',
  'atacames': 'Esmeraldas', 'quininde': 'Esmeraldas', 'san lorenzo': 'Esmeraldas',
  'catamayo': 'Loja', 'cariamanga': 'Loja',
  'puerto ayora': 'Galápagos', 'puerto baquerizo moreno': 'Galápagos',
  'pelileo': 'Tungurahua', 'pillaro': 'Tungurahua',
  'jipijapa': 'Manabí', 'el carmen': 'Manabí',
  'playas': 'Guayas', 'naranjal': 'Guayas', 'balzar': 'Guayas', 'el triunfo': 'Guayas',
};

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')  // quita tildes/diéresis (la ñ NFD queda como n)
    .replace(/[^a-z\s]/g, ' ')        // solo letras y espacios
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = curr;
  }
  return prev[n];
}

/**
 * Intenta identificar una provincia del Ecuador en el texto libre del cliente.
 * Estrategia en orden de confianza: match exacto/substring con la provincia →
 * ciudad conocida → typo leve (Levenshtein ≤ 2 en nombres de largo ≥ 5).
 */
export function matchProvinciaEcuador(texto: string): string | null {
  const norm = normalizar(texto);
  if (!norm) return null;

  // 1. Provincia contenida en el texto (o texto contenido en la provincia, si es
  //    suficientemente largo para no matchear por accidente).
  for (const provincia of PROVINCIAS) {
    const pn = normalizar(provincia);
    if (norm === pn || norm.includes(pn)) return provincia;
    if (norm.length >= 4 && pn.includes(norm)) return provincia;
  }

  // 2. Ciudad conocida mencionada en el texto.
  for (const [ciudad, provincia] of Object.entries(CIUDAD_A_PROVINCIA)) {
    if (norm === ciudad || norm.includes(ciudad)) return provincia;
  }

  // 3. Tolerancia a typos: comparar cada palabra (y el texto completo) contra
  //    provincias y ciudades. Umbral proporcional al largo — distancia 2 en palabras
  //    cortas produce falsos positivos (ej. "cuesta" ≈ "cuenca").
  const umbral = (len: number) => (len >= 8 ? 2 : len >= 5 ? 1 : 0);
  const candidatos = [norm, ...norm.split(' ').filter((w) => w.length >= 5)];
  for (const cand of candidatos) {
    const maxDist = umbral(cand.length);
    if (maxDist === 0) continue;
    for (const provincia of PROVINCIAS) {
      const pn = normalizar(provincia);
      if (pn.length >= 5 && levenshtein(cand, pn) <= maxDist) return provincia;
    }
    for (const [ciudad, provincia] of Object.entries(CIUDAD_A_PROVINCIA)) {
      if (ciudad.length >= 5 && levenshtein(cand, ciudad) <= maxDist) return provincia;
    }
  }

  return null;
}
