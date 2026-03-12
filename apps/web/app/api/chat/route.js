import { NextResponse } from 'next/server';
import { resolveScenario, scenarios } from '../../lib/mock-data';

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const prompt = String(body?.prompt || '').trim();

  if (!prompt) {
    return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
  }

  const scenarioKey = resolveScenario(prompt);
  const scenario = scenarios[scenarioKey];

  await new Promise((resolve) => setTimeout(resolve, 650));

  return NextResponse.json({
    scenario: scenarioKey,
    message: {
      role: 'assistant',
      content: scenario.reply,
      meta: scenario.source,
    },
    panel: scenario,
  });
}
