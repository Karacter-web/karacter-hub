import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { consumeAIText, resolveAIProvider } from '@/lib/ai/provider';
import { consumeRateLimit } from '@/lib/auth/rate-limit';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });

  const selection = resolveAIProvider();
  const limit = await consumeRateLimit(`ai-health:${session.user.id}`, 3, 60 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Health check limit reached.' }, { status: 429 });
  }

  try {
    const result = await consumeAIText({
      model: process.env.NEXT_PUBLIC_AI_MODEL,
      system: 'Respond with one short token.',
      prompt: 'OK',
      temperature: 0,
      maxOutputTokens: 1,
    });
    return NextResponse.json({
      ok: Boolean(result.text),
      provider: result.provider,
      model: result.model,
      source: result.source,
    }, { status: result.text ? 200 : 503 });
  } catch {
    return NextResponse.json({
      ok: false,
      provider: selection.provider,
      model: selection.model,
      source: selection.source,
      error: 'AI provider is not available.',
    }, { status: 503 });
  }
}