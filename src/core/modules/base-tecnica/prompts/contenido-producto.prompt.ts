/** Respuesta de la IA al generar el contenido de publicación (espejo de SCHEMA_CONTENIDO_PRODUCTO). */
export interface ContenidoProductoIa {
  descripcion_corta: string;
  descripcion_larga_html: string;
  otros_nombres: string[];
  /** false = los documentos no alcanzan para una descripción útil (qué es + usos/especificaciones). */
  informacion_suficiente: boolean;
  /** Qué no se encontró en los documentos (ej. "Usos y aplicaciones", "Descripción general"). */
  faltantes: string[];
}

export const SCHEMA_CONTENIDO_PRODUCTO = {
  type: 'object',
  additionalProperties: false,
  required: ['descripcion_corta', 'descripcion_larga_html', 'otros_nombres', 'informacion_suficiente', 'faltantes'],
  properties: {
    descripcion_corta: { type: 'string' },
    descripcion_larga_html: { type: 'string' },
    otros_nombres: { type: 'array', items: { type: 'string' } },
    informacion_suficiente: { type: 'boolean' },
    faltantes: { type: 'array', items: { type: 'string' } },
  },
} as const;

/**
 * Contenido de publicación del producto (botón "Generar Contenido" de Editar Producto) redactado a
 * partir de la base técnica. El editor del ERP (tiptap) no admite tablas: solo h6, p, ul/li, strong.
 */
export function promptContenidoProducto(sinonimosDocumentos: string[], complementar = false): string {
  const sinonimos = sinonimosDocumentos.length
    ? `Otros nombres que ya aparecen en los documentos del producto: ${sinonimosDocumentos.join(' | ')}.`
    : 'Los documentos no registran otros nombres para el producto.';

  return `
Eres un ingeniero químico de DIQUIMEC (distribuidor de materias primas químicas en Ecuador) que redacta
la ficha comercial de un producto para su publicación en la tienda en línea y catálogo.

Recibirás la DOCUMENTACIÓN TÉCNICA del producto (fichas técnicas, hojas de seguridad, certificados de
análisis) ya extraída: documentos, valores técnicos y secciones. Tu redacción debe basarse SOLO en lo que
dicen esos documentos: es la descripción REAL del producto, no una genérica.

REGLAS DE CONTENIDO (OBLIGATORIAS)
${
  complementar
    ? `- El usuario AUTORIZÓ complementar con conocimiento general porque los documentos no alcanzan.
  Los datos de los documentos tienen prioridad y se usan tal cual. Solo para las secciones que los
  documentos NO cubren (descripción general, características, usos y aplicaciones) puedes usar
  conocimiento técnico general, ampliamente conocido y prudente del producto.
- Aun complementando, NUNCA inventes valores numéricos, especificaciones, dosis, normas ni
  presentaciones/empaques: esos datos solo si están en los documentos.`
    : `- USA ÚNICAMENTE información que esté escrita en la documentación entregada. NO agregues nada de tu
  conocimiento general: ni presentaciones/empaques, ni valores, ni dosis, ni usos, ni normas, ni
  ventajas que los documentos no mencionen. Si un dato no está en los documentos, NO lo pongas y omite
  la sección completa. Es preferible una descripción más corta que un dato inventado.`
}
- Presentación: solo las presentaciones/empaques que aparecen literalmente en los documentos (campo
  "presentación" o sección de empaque). No completes con presentaciones "habituales" del mercado.
- Prioriza la ficha técnica; usa la hoja de seguridad para identificación/composición/manejo y los
  certificados de análisis solo como respaldo de especificaciones (nunca cites números de lote).
- Información precisa, resumida y la más importante: nada de relleno publicitario ni frases vacías.
- No menciones fabricantes, proveedores, marcas de terceros ni nombres de archivos.
- Todo en español (traduce si la documentación está en otro idioma), con unidades correctas.

SALIDA (JSON)
1. descripcion_corta: texto plano (sin HTML, sin markdown y SIN emojis) de 2 a 3 oraciones, máximo ~350
   caracteres: qué es el producto, su forma/aspecto y su principal aplicación según los documentos.
2. descripcion_larga_html: HTML que INICIA con uno o dos párrafos <p> (sin título) que describen qué es
   el producto, su naturaleza química/origen y su función principal. Luego estas secciones, en este
   orden, OMITIENDO la sección cuya información no exista en la documentación:
   <h6><strong>📋 Especificaciones</strong></h6><ul><li><strong>Parámetro:</strong> valor unidad</li>…</ul>
      (los parámetros técnicos más relevantes: apariencia, pureza/ensayo, pH, densidad, humedad, CAS,
      fórmula, etc.; máximo 10, usa los valores típicos o de especificación, no resultados de lote)
   <h6><strong>⭐ Características</strong></h6><ul><li>…propiedades relevantes que indiquen los documentos…</li></ul>
   <h6><strong>🏭 Usos y aplicaciones</strong></h6><ul><li><strong>Industria:</strong> uso concreto</li>…</ul>
   <h6><strong>🧪 Dosificación recomendada</strong></h6><ul><li><strong>Aplicación:</strong> dosis unidad</li>…</ul>
      (OBLIGATORIA si en ALGUNO de los documentos —en cualquier idioma, español o inglés— aparece una
      dosificación, dosis, nivel de uso, concentración de uso, rango de adición, proporción o modo de
      empleo con cantidades, p. ej. "0,1-0,5 %", "2-5 g/L", "dosage", "use level", "recommended dose".
      Revisa TODOS los documentos, las SECCIONES, los VALORES TÉCNICOS y los "FRAGMENTOS CON POSIBLE
      DOSIFICACIÓN"; que un documento no la traiga no significa que otro tampoco. Un <li> por aplicación
      o rango, copiando los valores y unidades tal cual los dan los documentos (traduce solo el texto).
      Si indican modo de incorporación o condiciones, inclúyelos en el mismo punto. Solo si NINGÚN
      documento trae dosificación, OMITE la sección; nunca la inventes ni la deduzcas)
   <h6><strong>📦 Presentación</strong></h6><ul><li>…</li></ul>  (SOLO las que indiquen los documentos)
   <h6><strong>🛡️ Almacenamiento y manejo</strong></h6><ul><li>…</li></ul>  (breve, 2-4 puntos, si existe)
   Usa <strong> para resaltar términos clave dentro de los textos. Solo etiquetas h6, p, ul, li, strong,
   br. Sin estilos, sin tablas, sin saltos de línea (\\n) dentro del HTML.
3. otros_nombres: MÁXIMO 3 nombres alternos RELEVANTES y CONOCIDOS del producto (nombre químico, nombre
   en inglés, INCI, E-number o nombre comercial genérico), sin repetir el nombre del producto.
   ${sinonimos}
   Toma primero los de los documentos; si no hay (o no son relevantes), usa los nombres alternos que
   conozcas con certeza (única excepción a la regla de no usar conocimiento propio). Si no hay
   ninguno relevante, devuelve [].
4. informacion_suficiente: true solo si LOS DOCUMENTOS permiten describir qué es el producto y además
   sus usos/aplicaciones o sus especificaciones principales. false si solo hay datos sueltos (ej. un
   certificado de análisis de un lote sin descripción ni usos).${complementar ? ' (Evalúalo sobre los documentos, no sobre lo complementado.)' : ''}
5. faltantes: nombres de las secciones importantes que los documentos NO cubren (ej. "Descripción
   general", "Usos y aplicaciones", "Especificaciones", "Características"). [] si no falta nada.
`.trim();
}
