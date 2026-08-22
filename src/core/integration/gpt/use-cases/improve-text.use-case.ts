import OpenAI from 'openai';

interface Options {
  prompt: string;
}

export const improveTextUseCase = async (openai: OpenAI, { prompt }: Options) => {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `
        Eres un editor de redacción experto en español.
        El texto que recibirás puede contener etiquetas HTML (por ejemplo <p>, <strong>, <ul>, <li>).
        Mejora y complementa la redacción del texto: corrige ortografía y gramática, mejora la claridad,
        la fluidez y el estilo, y complementa las ideas cuando sea útil para que el texto quede más completo
        y profesional, sin desviarte del tema original ni inventar datos concretos (cifras, nombres, fechas).
        Conserva la misma estructura y etiquetas HTML del texto original.
        Responde exclusivamente con el texto mejorado, sin explicaciones, sin comentarios y sin comillas envolventes.
        `,
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.6,
    max_tokens: 2000,
  });

  const message = completion.choices[0]?.message?.content?.trim() ?? '';

  return { message };
};
