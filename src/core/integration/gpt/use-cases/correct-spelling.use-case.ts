import OpenAI from 'openai';

interface Options {
  prompt: string;
}

export const correctSpellingUseCase = async (openai: OpenAI, { prompt }: Options) => {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `
        Eres un corrector ortográfico y gramatical de textos en español.
        El texto que recibirás puede contener etiquetas HTML (por ejemplo <p>, <strong>, <ul>, <li>).
        Corrige únicamente las faltas de ortografía, tildes, puntuación y concordancia gramatical.
        No cambies el significado del texto, no agregues ni elimines contenido ni ideas, no traduzcas.
        Conserva exactamente la misma estructura y etiquetas HTML del texto original.
        Responde exclusivamente con el texto corregido, sin explicaciones, sin comentarios y sin comillas envolventes.
        Si el texto no contiene errores, respóndelo tal cual.
        `,
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.2,
    max_tokens: 2000,
  });

  const message = completion.choices[0]?.message?.content?.trim() ?? '';

  return { message };
};
