/** Respuesta de la IA al generar el contenido de publicación (espejo de SCHEMA_CONTENIDO_PRODUCTO). */
export interface ContenidoProductoIa {
  descripcion_corta: string;
  descripcion_larga_html: string;
  otros_nombres: string[];
}

export const SCHEMA_CONTENIDO_PRODUCTO = {
  type: 'object',
  additionalProperties: false,
  required: ['descripcion_corta', 'descripcion_larga_html', 'otros_nombres'],
  properties: {
    descripcion_corta: { type: 'string' },
    descripcion_larga_html: { type: 'string' },
    otros_nombres: { type: 'array', items: { type: 'string' } },
  },
} as const;

/**
 * Contenido de publicación del producto (botón "Generar Contenido" de Editar Producto) redactado a
 * partir de la base técnica. El editor del ERP (tiptap) no admite tablas: solo h6, p, ul/li, strong.
 */
export function promptContenidoProducto(sinonimosDocumentos: string[]): string {
  const sinonimos = sinonimosDocumentos.length
    ? `Otros nombres que ya aparecen en los documentos del producto: ${sinonimosDocumentos.join(' | ')}.`
    : 'Los documentos no registran otros nombres para el producto.';

  return `
Eres un ingeniero químico de DIQUIMEC (distribuidor de materias primas químicas en Ecuador) que redacta
la ficha comercial de un producto para su publicación en la tienda en línea y catálogo.

Recibirás la DOCUMENTACIÓN TÉCNICA del producto (fichas técnicas, hojas de seguridad, certificados de
análisis) ya extraída: documentos, valores técnicos y secciones. Tu redacción debe basarse en lo que
dicen esos documentos: es la descripción REAL del producto, no una genérica.

REGLAS DE CONTENIDO
- Prioriza la ficha técnica; usa la hoja de seguridad para identificación/composición/manejo y los
  certificados de análisis solo como respaldo de especificaciones (nunca cites números de lote).
- NO inventes valores, dosis, concentraciones ni normas que no estén en la documentación. Si un dato no
  está, omítelo. Puedes complementar con conocimiento general SOLO en usos/aplicaciones ampliamente
  conocidos del producto y siempre de forma prudente.
- Información precisa, resumida y la más importante: nada de relleno publicitario ni frases vacías.
- No menciones fabricantes, proveedores, marcas de terceros ni nombres de archivos.
- Todo en español (traduce si la documentación está en otro idioma), con unidades correctas.

SALIDA (JSON)
1. descripcion_corta: texto plano (sin HTML ni markdown) de 2 a 3 oraciones, máximo ~350 caracteres:
   qué es el producto, su forma/aspecto y su principal aplicación. Puede iniciar con UN emoji adecuado.
2. descripcion_larga_html: HTML con esta estructura, en este orden, OMITIENDO la sección cuya
   información no exista en la documentación:
   <h6><strong>🧪 Descripción</strong></h6><p>…qué es, naturaleza química/origen, función principal…</p>
   <h6><strong>📋 Especificaciones</strong></h6><ul><li><strong>Parámetro:</strong> valor unidad</li>…</ul>
      (los parámetros técnicos más relevantes: apariencia, pureza/ensayo, pH, densidad, humedad, CAS,
      fórmula, etc.; máximo 10, usa los valores típicos o de especificación, no resultados de lote)
   <h6><strong>⭐ Características</strong></h6><ul><li>…ventajas/propiedades relevantes…</li></ul>
   <h6><strong>🏭 Usos y aplicaciones</strong></h6><ul><li><strong>Industria:</strong> uso concreto</li>…</ul>
   <h6><strong>⚖️ Dosificación</strong></h6><ul><li>…</li></ul>  (SOLO si la documentación indica dosis)
   <h6><strong>📦 Presentación</strong></h6><ul><li>…empaque/presentación…</li></ul>  (SOLO si existe)
   <h6><strong>🛡️ Almacenamiento y manejo</strong></h6><ul><li>…</li></ul>  (breve, 2-4 puntos, si existe)
   Usa <strong> para resaltar términos clave dentro de los textos. Solo etiquetas h6, p, ul, li, strong,
   br. Sin estilos, sin tablas, sin saltos de línea (\\n) dentro del HTML.
3. otros_nombres: MÁXIMO 3 nombres alternos RELEVANTES y CONOCIDOS del producto (nombre químico, nombre
   en inglés, INCI, E-number o nombre comercial genérico), sin repetir el nombre del producto.
   ${sinonimos}
   Toma primero los de los documentos; si no hay (o no son relevantes), usa los nombres alternos que
   conozcas con certeza. Si no hay ninguno relevante, devuelve [].
`.trim();
}
