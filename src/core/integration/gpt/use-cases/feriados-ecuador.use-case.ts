import OpenAI from 'openai';

interface Options {
  anio: number;
}

export interface FeriadoGenerado {
  fecha: string; // YYYY-MM-DD
  detalle: string;
}

/**
 * Genera el calendario de feriados de Ecuador para un año dado, aplicando la Ley
 * Orgánica reformatoria que traslada feriados (Art. 1 y 2, Ley s/n R.O. 906-2S,
 * 20-dic-2016): feriados que caen martes/miércoles/jueves se trasladan al lunes
 * anterior; los que caen sábado/domingo se trasladan al viernes anterior. Ciertos
 * feriados NO se trasladan (1 de enero, Viernes Santo, 1 de mayo, 24 de mayo,
 * 10 de agosto, 9 de octubre, 2 de noviembre, 25 de diciembre quedan en su fecha o
 * con reglas propias) — el modelo debe aplicar la ley real, no inventar.
 * Esto es generado por IA: puede tener errores, se recomienda verificar contra una
 * fuente oficial (Ministerio del Trabajo) antes de usarlo para cálculos legales.
 */
export const feriadosEcuadorUseCase = async (openai: OpenAI, options: Options): Promise<FeriadoGenerado[]> => {
  const { anio } = options;

  const completion = await openai.chat.completions.create({
    messages: [
      {
        role: 'system',
        content: `
        Eres un experto en legislación laboral ecuatoriana. Debes generar el calendario
        completo de feriados nacionales de Ecuador para el año que te indique el usuario,
        aplicando correctamente la Ley Orgánica reformatoria al Código de Trabajo sobre
        traslado de feriados (feriados que caen martes, miércoles o jueves se trasladan
        al lunes inmediato anterior; los que caen sábado o domingo se trasladan al
        viernes inmediato anterior), respetando las excepciones de ley (Año Nuevo,
        Viernes Santo, Día del Trabajo, Batalla de Pichincha, Primer Grito de
        Independencia, Independencia de Guayaquil, Navidad, entre otros con reglas
        propias de traslado o no traslado).

        Incluye feriados nacionales (fijos y móviles: Viernes Santo depende de la
        Semana Santa de ese año) y los feriados de traslado obligatorio (Carnaval).
        No incluyas feriados solo cantonales/provinciales.

        Responde SOLO en formato JSON con este esquema exacto:
        {
          "feriados": [
            { "fecha": "YYYY-MM-DD", "detalle": "Nombre del feriado" }
          ]
        }
        `,
      },
      {
        role: 'user',
        content: `Genera el calendario de feriados nacionales de Ecuador para el año ${anio}.`,
      },
    ],
    model: 'gpt-4o-mini',
    temperature: 0.1,
    response_format: {
      type: 'json_object',
    },
  });

  const content = completion.choices[0].message.content;
  if (!content) return [];

  const parsed = JSON.parse(content) as { feriados?: FeriadoGenerado[] };
  return parsed.feriados ?? [];
};
