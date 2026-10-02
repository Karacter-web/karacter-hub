import { streamAIText, type AITextInput } from './provider';

export function streamAIResponse(input: AITextInput) {
  const iterator = streamAIText(input)[Symbol.asyncIterator]();
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const item = await iterator.next();
        if (item.done) {
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(item.value));
      } catch {
        controller.error(new Error('AI provider stream failed.'));
      }
    },
    cancel() {
      void iterator.return?.(undefined);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}