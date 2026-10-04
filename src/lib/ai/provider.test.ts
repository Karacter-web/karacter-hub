import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAIProvider, streamAIText, type AIClientFactories } from './provider';

test('default model uses the Gateway path without requiring a user API key', () => {
  assert.deepEqual(resolveAIProvider(undefined, {}), {
    provider: 'openrouter',
    model: 'mistralai/mistral-large',
    source: 'gateway',
  });
});

test('model names map to official provider SDK families and gateway models', () => {
  assert.equal(resolveAIProvider('claude-sonnet-4', {}).provider, 'anthropic');
  assert.equal(resolveAIProvider('gemini-2.5-flash', {}).provider, 'google');
  assert.equal(resolveAIProvider('gpt-4.1', {}).provider, 'openai');
  assert.deepEqual(resolveAIProvider('deepseek/deepseek-r1', {}), {
    provider: 'openrouter',
    model: 'deepseek/deepseek-r1',
    source: 'gateway',
  });
  assert.deepEqual(resolveAIProvider('mistralai/mistral-large', {}), {
    provider: 'openrouter',
    model: 'mistralai/mistral-large',
    source: 'gateway',
  });
});

test('explicit user credentials select BYO for the matching provider only', () => {
  assert.deepEqual(resolveAIProvider('gpt-4.1', { OPENAI_API_KEY: 'local-key' }), {
    provider: 'openai',
    model: 'gpt-4.1',
    source: 'byo',
  });
  assert.deepEqual(resolveAIProvider('mistral-large', { MISTRAL_API_KEY: 'local-key' }), {
    provider: 'mistral',
    model: 'mistral-large',
    source: 'byo',
  });
  assert.equal(resolveAIProvider('gpt-4.1', { OPENAI_API_KEY: 'local-key', VERCEL: '1' }).source, 'byo');
  assert.equal(resolveAIProvider('gpt-4.1', { OPENAI_API_KEY: 'local-key', AI_PROVIDER_MODE: 'byo' }).source, 'byo');
});

test('mocked OpenAI-compatible client streams text without exposing provider keys', async () => {
  const requests: Array<Record<string, unknown>> = [];
  const clients: AIClientFactories = {
    openai: () => ({
      chat: {
        completions: {
          async create(options) {
            requests.push(options);
            return (async function* () {
              yield { choices: [{ delta: { content: 'first ' } }] };
              yield { choices: [{ delta: { content: 'second' } }] };
            })();
          },
        },
      },
    }),
    anthropic: () => { throw new Error('unexpected SDK'); },
    google: () => { throw new Error('unexpected SDK'); },
  };
  let received = '';
  for await (const chunk of streamAIText({
    model: 'openai/gpt-4.1', system: 'system instructions', prompt: 'prompt',
  }, { env: { OPENAI_API_KEY: 'must-not-enter-prompt' }, clients })) {
    received += chunk;
  }

  assert.equal(received, 'first second');
  assert.equal(requests[0].model, 'gpt-4.1');
  assert.equal(JSON.stringify(requests[0]).includes('must-not-enter-prompt'), false);
});

test('Vercel AI Gateway uses its key and provider-qualified model identifier', async () => {
  const requests: Array<Record<string, unknown>> = [];
  const clientOptions: Array<{ apiKey?: string; baseURL?: string } | undefined> = [];
  const clients: AIClientFactories = {
    openai: options => {
      clientOptions.push(options);
      return {
        chat: {
          completions: {
            async create(request) {
              requests.push(request);
              return (async function* () {
                yield { choices: [{ delta: { content: 'gateway response' } }] };
              })();
            },
          },
        },
      };
    },
    anthropic: () => { throw new Error('unexpected SDK'); },
    google: () => { throw new Error('unexpected SDK'); },
  };
  const chunks: string[] = [];
  for await (const chunk of streamAIText({
    model: 'claude-sonnet-4',
    system: 'system',
    prompt: 'prompt',
  }, { env: { AI_GATEWAY_API_KEY: 'gateway-secret' }, clients })) {
    chunks.push(chunk);
  }

  assert.deepEqual(chunks, ['gateway response']);
  assert.deepEqual(clientOptions[0], {
    apiKey: 'gateway-secret',
    baseURL: 'https://ai-gateway.vercel.sh/v1',
  });
  assert.equal(requests[0].model, 'anthropic/claude-sonnet-4');
});

test('mocked Anthropic and Gemini clients emit normalized text chunks', async () => {
  const anthropicClients: AIClientFactories = {
    openai: () => { throw new Error('unexpected SDK'); },
    anthropic: () => ({
      messages: {
        async create() {
          return (async function* () {
            yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'claude' } };
          })();
        },
      },
    }),
    google: () => { throw new Error('unexpected SDK'); },
  };
  const anthropicChunks: string[] = [];
  for await (const chunk of streamAIText({ model: 'claude-sonnet-4', system: '', prompt: '' }, { env: {}, clients: anthropicClients })) {
    anthropicChunks.push(chunk);
  }
  assert.deepEqual(anthropicChunks, ['claude']);

  const googleClients: AIClientFactories = {
    openai: () => { throw new Error('unexpected SDK'); },
    anthropic: () => { throw new Error('unexpected SDK'); },
    google: () => ({
      models: {
        async generateContentStream() {
          return (async function* () { yield { text: 'gemini' }; })();
        },
      },
    }),
  };
  const googleChunks: string[] = [];
  for await (const chunk of streamAIText({ model: 'gemini-2.5-flash', system: '', prompt: '' }, { env: {}, clients: googleClients })) {
    googleChunks.push(chunk);
  }
  assert.deepEqual(googleChunks, ['gemini']);
});