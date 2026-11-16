import { env } from '../../env.js';

/**
 * Model providers behind one small interface. Muse only ever asks for one thing: "given this
 * system prompt and this input, return JSON matching this schema". Switching provider or model
 * is an environment change (MUSE_PROVIDER, MUSE_MODEL), not a code change.
 */
export interface CompletionRequest { system: string; user: string; schemaName: string; schema: Record<string, unknown>; maxTokens: number; signal: AbortSignal }
export interface CompletionResult { json: unknown; inputTokens: number; outputTokens: number }
export interface ModelProvider { name: string; model: string; priceIn: number; priceOut: number; complete(req: CompletionRequest): Promise<CompletionResult> }

export class ProviderError extends Error {
  constructor(message: string, public retryable: boolean, public status?: number) { super(message); }
}

const perM = (k: string, d: number) => (Number(process.env[k]) || d) / 1_000_000;

async function gatewayKey(): Promise<string> {
  if (env.gatewayKey) return env.gatewayKey;
  // on Vercel the function's short-lived OIDC token authenticates to AI Gateway; no stored key needed
  try {
    const { getVercelOidcToken } = await import('@vercel/oidc');
    return await getVercelOidcToken();
  } catch {
    throw new ProviderError('AI Gateway credentials are not available in this environment.', false);
  }
}

function openAiCompatible(name: string, baseUrl: string, model: string, key: () => Promise<string>): ModelProvider {
  return {
    name, model, priceIn: perM('MUSE_PRICE_INPUT_PER_M', 0.1), priceOut: perM('MUSE_PRICE_OUTPUT_PER_M', 0.5),
    async complete(req) {
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        signal: req.signal,
        headers: { authorization: `Bearer ${await key()}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          max_tokens: req.maxTokens,
          temperature: 0.7,
          messages: [{ role: 'system', content: req.system }, { role: 'user', content: req.user }],
          response_format: { type: 'json_schema', json_schema: { name: req.schemaName, strict: true, schema: req.schema } },
        }),
      });
      if (!res.ok) {
        const text = (await res.text().catch(() => '')).slice(0, 300);
        throw new ProviderError(`Model provider returned ${res.status}: ${text}`, res.status === 429 || res.status >= 500, res.status);
      }
      const data: any = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') throw new ProviderError('The model returned no content.', true);
      let json: unknown;
      try { json = JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { throw new ProviderError('The model did not return valid JSON.', true); }
      return { json, inputTokens: data?.usage?.prompt_tokens ?? 0, outputTokens: data?.usage?.completion_tokens ?? 0 };
    },
  };
}

function anthropic(model: string): ModelProvider {
  return {
    name: 'anthropic', model, priceIn: perM('MUSE_PRICE_INPUT_PER_M', 0.1), priceOut: perM('MUSE_PRICE_OUTPUT_PER_M', 0.5),
    async complete(req) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: req.signal,
        headers: { 'x-api-key': env.anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model, max_tokens: req.maxTokens, system: req.system,
          messages: [{ role: 'user', content: req.user }],
          tools: [{ name: req.schemaName, description: 'Return the result.', input_schema: req.schema }],
          tool_choice: { type: 'tool', name: req.schemaName },
        }),
      });
      if (!res.ok) throw new ProviderError(`Model provider returned ${res.status}`, res.status === 429 || res.status >= 500, res.status);
      const data: any = await res.json();
      const block = (data?.content ?? []).find((b: any) => b.type === 'tool_use');
      if (!block) throw new ProviderError('The model returned no structured result.', true);
      return { json: block.input, inputTokens: data?.usage?.input_tokens ?? 0, outputTokens: data?.usage?.output_tokens ?? 0 };
    },
  };
}

/** null means no real provider is configured: Muse runs the labelled development fallback. */
export function getProvider(): ModelProvider | null {
  const p = env.museProvider;
  if (p === 'gateway') return openAiCompatible('gateway', 'https://ai-gateway.vercel.sh/v1', env.museModel || 'anthropic/claude-haiku-5.5', gatewayKey);
  if (p === 'openai') return openAiCompatible('openai', env.museBaseUrl || 'https://api.openai.com/v1', env.museModel || 'gpt-5-mini', async () => env.openaiKey);
  if (p === 'anthropic') return anthropic(env.museModel || 'claude-haiku-5-5');
  return null;
}

let override: ModelProvider | null | undefined;
/** Tests inject a fake provider here. */
export function setProviderForTests(p: ModelProvider | null | undefined) { override = p; }
export function activeProvider(): ModelProvider | null { return override !== undefined ? override : getProvider(); }
