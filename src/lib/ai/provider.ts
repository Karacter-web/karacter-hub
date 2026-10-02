import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';

export type AIProviderName = 'openai' | 'anthropic' | 'google' | 'openrouter' | 'mistral';
export type AIProviderSource = 'gateway' | 'byo';

export interface AIProviderSelection {
  provider: AIProviderName;
  model: string;
  source: AIProviderSource;
}

export interface AITextInput {
  model?: string;
  system: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
}

interface Environment {
  [key: string]: string | undefined;
}

interface OpenAIChunk {
  choices?: Array<{ delta?: { content?: string | Array<{ text?: string }> } }>;
}

interface OpenAIClient {
  chat: {
    completions: {
      create(options: Record<string, unknown>): Promise<AsyncIterable<OpenAIChunk>>;
    };
  };
}

interface AnthropicEvent {
  type: string;
  delta?: { type?: string; text?: string };
}

interface AnthropicClient {
  messages: {
    create(options: Record<string, unknown>): Promise<AsyncIterable<AnthropicEvent>>;
  };
}

interface GoogleChunk {
  text?: string;
}

interface GoogleClient {
  models: {
    generateContentStream(options: Record<string, unknown>): Promise<AsyncIterable<GoogleChunk>>;
  };
}

export interface AIClientFactories {
  openai(options?: { apiKey?: string; baseURL?: string }): OpenAIClient;
  anthropic(options?: { apiKey?: string; baseURL?: string }): AnthropicClient;
  google(options?: { apiKey?: string; baseURL?: string }): GoogleClient;
}

const defaultFactories: AIClientFactories = {
  openai: options => (options ? new OpenAI(options) : new OpenAI()) as unknown as OpenAIClient,
  anthropic: options => (options ? new Anthropic(options) : new Anthropic()) as unknown as AnthropicClient,
  google: options => (options
    ? new GoogleGenAI({
      ...(options.apiKey ? { apiKey: options.apiKey } : {}),
      ...(options.baseURL ? { httpOptions: { baseUrl: options.baseURL } } : {}),
    })
    : new GoogleGenAI()) as unknown as GoogleClient,
};

const providerKeys: Record<AIProviderName, string[]> = {
  openai: ['OPENAI_API_KEY'],
  anthropic: ['ANTHROPIC_API_KEY'],
  google: ['GEMINI_API_KEY'],
  openrouter: ['OPENROUTER_API_KEY'],
  mistral: ['MISTRAL_API_KEY'],
};

const gatewayBaseUrls: Partial<Record<AIProviderName, string>> = {
  openai: 'OPENAI_BASE_URL',
  anthropic: 'ANTHROPIC_BASE_URL',
  google: 'GOOGLE_GEMINI_BASE_URL',
  openrouter: 'OPENROUTER_BASE_URL',
};

function chooseModel(model: string | undefined, env: Environment) {
  const selected = model?.trim() || env.NEXT_PUBLIC_AI_MODEL?.trim() || 'mistral-large';
  return selected.slice(0, 160);
}

export function resolveAIProvider(model?: string, env: Environment = process.env): AIProviderSelection {
  const selected = chooseModel(model, env);
  const lower = selected.toLowerCase();
  let provider: AIProviderName;
  let resolvedModel = selected;

  if (lower.startsWith('openrouter/')) {
    provider = 'openrouter';
    resolvedModel = selected.slice('openrouter/'.length);
  } else if (lower.startsWith('anthropic/')) {
    provider = 'anthropic';
    resolvedModel = selected.slice('anthropic/'.length);
  } else if (lower.startsWith('google/')) {
    provider = 'google';
    resolvedModel = selected.slice('google/'.length);
  } else if (lower.startsWith('openai/')) {
    provider = 'openai';
    resolvedModel = selected.slice('openai/'.length);
  } else if (lower.startsWith('mistralai/')) {
    provider = 'openrouter';
  } else if (lower.startsWith('claude')) {
    provider = 'anthropic';
  } else if (lower.startsWith('gemini')) {
    provider = 'google';
  } else if (/^(gpt-|o[1-9](?:-|$))/.test(lower)) {
    provider = 'openai';
  } else if (/^(mistral|deepseek|x-ai\/|meta-llama\/|qwen)/.test(lower)) {
    if (lower.startsWith('mistral') && env.MISTRAL_API_KEY) {
      provider = 'mistral';
    } else {
      provider = 'openrouter';
      if (lower.startsWith('mistral')) resolvedModel = `mistralai/${selected}`;
    }
  } else {
    provider = 'openai';
  }

  const keyAvailable = providerKeys[provider].some(key => Boolean(env[key]));
  const explicitMode = env.AI_PROVIDER_MODE?.toLowerCase();
  const runningOnNetlify = env.NETLIFY === 'true' || env.NETLIFY === '1';
  const gatewayRuntimeAvailable = runningOnNetlify && Boolean(env[gatewayBaseUrls[provider] ?? '']);
  const source: AIProviderSource = provider === 'mistral'
    ? 'byo'
    : explicitMode === 'byo'
      ? 'byo'
      : explicitMode === 'gateway' || gatewayRuntimeAvailable
        ? 'gateway'
        : keyAvailable
          ? 'byo'
          : 'gateway';

  return { provider, model: resolvedModel, source };
}

function selectedKey(selection: AIProviderSelection, env: Environment) {
  return env[providerKeys[selection.provider][0]];
}

function requireKey(selection: AIProviderSelection, env: Environment) {
  const key = selectedKey(selection, env);
  if (!key) throw new Error('No AI provider credentials are available at runtime.');
  return key;
}

export async function* streamAIText(
  input: AITextInput,
  options: { env?: Environment; clients?: AIClientFactories } = {},
): AsyncGenerator<string> {
  const env = options.env ?? process.env;
  const clients = options.clients ?? defaultFactories;
  const selection = resolveAIProvider(input.model, env);
  const modelOptions = {
    temperature: input.temperature ?? 0.2,
    max_tokens: input.maxOutputTokens ?? 16_000,
  };

  if (selection.provider === 'openai') {
    const client = selection.source === 'gateway'
      ? clients.openai()
      : clients.openai({ apiKey: requireKey(selection, env), baseURL: env.OPENAI_BASE_URL });
    const stream = await client.chat.completions.create({
      model: selection.model,
      messages: [{ role: 'system', content: input.system }, { role: 'user', content: input.prompt }],
      ...modelOptions,
      stream: true,
    });
    for await (const chunk of stream) {
      const content = chunk.choices?.[0]?.delta?.content;
      if (typeof content === 'string') yield content;
      else if (Array.isArray(content)) {
        for (const part of content) if (part.text) yield part.text;
      }
    }
    return;
  }

  if (selection.provider === 'anthropic') {
    const client = selection.source === 'gateway'
      ? clients.anthropic()
      : clients.anthropic({ apiKey: requireKey(selection, env), baseURL: env.ANTHROPIC_BASE_URL });
    const stream = await client.messages.create({
      model: selection.model,
      system: input.system,
      messages: [{ role: 'user', content: input.prompt }],
      max_tokens: modelOptions.max_tokens,
      temperature: modelOptions.temperature,
      stream: true,
    });
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && event.delta.text) {
        yield event.delta.text;
      }
    }
    return;
  }

  if (selection.provider === 'google') {
    const client = selection.source === 'gateway'
        ? clients.google()
      : clients.google({ apiKey: requireKey(selection, env), baseURL: env.GOOGLE_GEMINI_BASE_URL });
    const stream = await client.models.generateContentStream({
      model: selection.model,
      contents: input.prompt,
      config: {
        systemInstruction: input.system,
        temperature: modelOptions.temperature,
        maxOutputTokens: modelOptions.max_tokens,
      },
    });
    for await (const chunk of stream) if (chunk.text) yield chunk.text;
    return;
  }

  if (selection.provider === 'mistral') {
    const client = clients.openai({
      apiKey: requireKey(selection, env),
      baseURL: env.MISTRAL_BASE_URL || 'https://api.mistral.ai/v1',
    });
    const stream = await client.chat.completions.create({
      model: selection.model,
      messages: [{ role: 'system', content: input.system }, { role: 'user', content: input.prompt }],
      ...modelOptions,
      stream: true,
    });
    for await (const chunk of stream) {
      const content = chunk.choices?.[0]?.delta?.content;
      if (typeof content === 'string') yield content;
    }
    return;
  }

  const client = clients.openai({
    apiKey: requireKey(selection, env),
    baseURL: env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
  });
  const stream = await client.chat.completions.create({
    model: selection.model,
    messages: [{ role: 'system', content: input.system }, { role: 'user', content: input.prompt }],
    ...modelOptions,
    stream: true,
  });
  for await (const chunk of stream) {
    const content = chunk.choices?.[0]?.delta?.content;
    if (typeof content === 'string') yield content;
  }
}

export async function consumeAIText(input: AITextInput, options: { env?: Environment; clients?: AIClientFactories } = {}) {
  let text = '';
  for await (const chunk of streamAIText(input, options)) {
    text += chunk;
    break;
  }
  return { text, ...resolveAIProvider(input.model, options.env ?? process.env) };
}