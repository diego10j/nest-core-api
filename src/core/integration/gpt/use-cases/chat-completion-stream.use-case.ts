import OpenAI from 'openai';

interface Options {
  messages: OpenAI.ChatCompletionMessageParam[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export const chatCompletionStreamUseCase = async (
  openai: OpenAI,
  { messages, model = 'gpt-4o-mini', temperature = 0.4, maxTokens = 800 }: Options,
) => {
  return await openai.chat.completions.create({
    stream: true,
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  });
};
