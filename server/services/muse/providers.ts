import { env } from '../../env.js';

/**
 * Model providers behind one small interface. Muse only ever asks for one thing: "given this
 * system prompt and this input, return JSON matching this schema". Switching provider or model
 * is an environment change (MUSE_PROVIDER, MUSE_MODEL, a provider key), not a code change.
 */
export interface CompletionRequest { system: string; user: string; schemaName: string; schema: Record<string, unknown>; maxTokens: number; signal: AbortSignal }
export interface CompletionResult { json: unknown; inputTokens: number; outputTokens: number }
export interface ModelProvider { name: string; label: string; model: string; priceIn: number; priceOut: number; complete(req: CompletionRequest): Promise<CompletionResult> }

export class ProviderError extends Error {
  constructor(message: string, public retryable: boolean, public status?: number) { super(message); }
}

/** Price per token. Free tiers are still costed at the provider's paid list price, so the daily
 *  budget keeps protecting you if billing is ever switched on for the key. */
const perM = (k: string, d: number) => (Number(process.env[k]) || d) / 1_000_000;

interface Preset {
  label: string;
  baseUrl: string;
  key: () => Promise<string>;
  model: string;
  /** 'schema' asks for strict JSON Schema output; 'object' asks for a JSON object and puts the schema in the prompt. */
  json: 'schema' | 'object';
  tokenParam: 'max_tokens' | 'max_completion_tokens';
  /** Reasoning models spend tokens thinking before they answer; this headroom keeps answers from being cut off. */
  headroom: number;
  temperature: number | null;
  extra: Record<string, unknown>;
  price: [number, number];
}

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

const keyOf = (name: string, value: () => string) => async () => {
  const k = value();
  if (!k) throw new ProviderError(`${name} is not set in this environment.`, false);
  return k;
};

/** Every provider Muse can use. Gemini and Groq both have free tiers that need only a free API key. */
export function presets(): Record<string, Preset> {
  return {
    groq: {
      label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', key: keyOf('GROQ_API_KEY', () => env.groqKey),
      model: 'openai/gpt-oss-120b', json: 'schema', tokenParam: 'max_completion_tokens', headroom: 1500, temperature: 0.7,
      extra: { reasoning_effort: 'low' }, price: [0.15, 0.75],
    },
    gemini: {
      label: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', key: keyOf('GEMINI_API_KEY', () => env.geminiKey),
      model: 'gemini-2.5-flash', json: 'schema', tokenParam: 'max_tokens', headroom: 1200, temperature: 0.7,
      extra: { reasoning_effort: 'low' }, price: [0.3, 2.5],
    },
    openai: {
      label: 'OpenAI compatible', baseUrl: env.museBaseUrl || 'https://api.openai.com/v1', key: keyOf('OPENAI_API_KEY', () => env.openaiKey),
      model: 'gpt-5-mini', json: 'schema', tokenParam: 'max_completion_tokens', headroom: 1500, temperature: null,
      extra: {}, price: [0.25, 2],
    },
    gateway: {
      label: 'Vercel AI Gateway', baseUrl: 'https://ai-gateway.vercel.sh/v1', key: gatewayKey,
      model: 'anthropic/claude-haiku-5.5', json: 'schema', tokenParam: 'max_tokens', headroom: 0, temperature: 0.7,
      extra: {}, price: [1, 5],
    },
  };
}

/** Providers that answer a strict-schema request with 400 are remembered and asked for plain JSON instead. */
const schemaUnsupported = new Set<string>();

function schemaPrompt(req: CompletionRequest) {
  return `${req.system}\n\nAnswer with one JSON object only, no prose and no code fences. It must match this JSON Schema exactly:\n${JSON.stringify(req.schema)}`;
}

function openAiCompatible(name: string, p: Preset): ModelProvider {
  const model = env.museModel || p.model;
  async function call(req: CompletionRequest, mode: 'schema' | 'object') {
    const body: Record<string, unknown> = {
      model,
      [p.tokenParam]: req.maxTokens + p.headroom,
      messages: [{ role: 'system', content: mode === 'schema' ? req.system : schemaPrompt(req) }, { role: 'user', content: req.user }],
      response_format: mode === 'schema' ? { type: 'json_schema', json_schema: { name: req.schemaName, strict: true, schema: req.schema } } : { type: 'json_object' },
      ...p.extra,
    };
    if (p.temperature !== null) body.temperature = p.temperature;
    return fetch(`${p.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST', signal: req.signal,
      headers: { authorization: `Bearer ${await p.key()}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  return {
    name, label: p.label, model, priceIn: perM('MUSE_PRICE_INPUT_PER_M', p.price[0]), priceOut: perM('MUSE_PRICE_OUTPUT_PER_M', p.price[1]),
    async complete(req) {
      const id = `${name}:${model}`;
      let mode: 'schema' | 'object' = p.json === 'schema' && !schemaUnsupported.has(id) ? 'schema' : 'object';
      let res = await call(req, mode);
      if (res.status === 400 && mode === 'schema') {
        const text = await res.text().catch(() => '');
        if (/response_format|json_schema|schema|structured/i.test(text)) {
          schemaUnsupported.add(id);
          mode = 'object';
          res = await call(req, mode);
        } else {
          throw new ProviderError(`Model provider returned 400: ${redact(text)}`, false, 400);
        }
      }
      if (!res.ok) {
        const text = redact(await res.text().catch(() => ''));
        throw new ProviderError(`Model provider returned ${res.status}: ${text}`, res.status === 429 || res.status >= 500, res.status);
      }
      const data: any = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) {
        const cut = data?.choices?.[0]?.finish_reason === 'length';
        throw new ProviderError(cut ? 'The model ran out of room before it finished answering.' : 'The model returned no content.', true);
      }
      return { json: parseJson(content), inputTokens: data?.usage?.prompt_tokens ?? 0, outputTokens: data?.usage?.completion_tokens ?? 0 };
    },
  };
}

/** Accept a bare object, a fenced block, or an object with a sentence around it. */
function parseJson(content: string): unknown {
  const s = content.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  try { return JSON.parse(s); } catch { /* fall through */ }
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch { /* fall through */ } }
  throw new ProviderError('The model did not return valid JSON.', true);
}

/** Provider error bodies never carry our key, but keep anything key-shaped out of logs regardless. */
const redact = (t: string) => t.replace(/\b(sk-|gsk_|AIza)[A-Za-z0-9_-]{8,}/g, '[redacted]').slice(0, 300);

function anthropic(model: string): ModelProvider {
  return {
    name: 'anthropic', label: 'Anthropic', model, priceIn: perM('MUSE_PRICE_INPUT_PER_M', 1), priceOut: perM('MUSE_PRICE_OUTPUT_PER_M', 5),
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
  const name = env.museProvider;
  if (name === 'anthropic') return anthropic(env.museModel || 'claude-haiku-5-5');
  const preset = presets()[name];
  return preset ? openAiCompatible(name, preset) : null;
}

let override: ModelProvider | null | undefined;
/** Tests inject a fake provider here. */
export function setProviderForTests(p: ModelProvider | null | undefined) { override = p; }
export function activeProvider(): ModelProvider | null { return override !== undefined ? override : getProvider(); }
