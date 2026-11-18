import { afterEach, describe, expect, it, vi } from 'vitest';
import { getProvider } from '../server/services/muse/providers.js';
import { capabilities } from '../server/env.js';

/** Provider presets talk to real APIs in production; here fetch is replaced so the requests can be inspected. */
const KEYS = ['MUSE_PROVIDER', 'MUSE_MODEL', 'GROQ_API_KEY', 'GEMINI_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'AI_GATEWAY_API_KEY'];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

function setEnv(vars: Record<string, string>) {
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, vars);
}

const ok = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }], usage: { prompt_tokens: 12, completion_tokens: 5 } }), { status: 200 });
const req = () => ({ system: 'sys', user: 'hi', schemaName: 'demo', schema: { type: 'object', additionalProperties: false, required: ['word'], properties: { word: { type: 'string' } } }, maxTokens: 100, signal: AbortSignal.timeout(5000) });

afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

describe('Muse providers', () => {
  it('stays on the labelled fallback until a key is configured', () => {
    setEnv({});
    expect(getProvider()).toBeNull();
    expect(capabilities().muse).toMatchObject({ provider: 'fallback', real: false });
  });

  it('picks the free Groq preset from its key alone and sends a strict schema request', async () => {
    setEnv({ GROQ_API_KEY: 'gsk_test_value_123456' });
    const calls: { url: string; body: any; auth: string }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)), auth: String((init.headers as Record<string, string>).authorization) });
      return ok('{"word":"spark"}');
    });
    const p = getProvider()!;
    expect(p).toMatchObject({ name: 'groq', label: 'Groq', model: 'openai/gpt-oss-120b' });
    expect(capabilities().muse).toMatchObject({ provider: 'groq', label: 'Groq', real: true });
    const r = await p.complete(req());
    expect(r).toEqual({ json: { word: 'spark' }, inputTokens: 12, outputTokens: 5 });
    expect(calls[0].url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(calls[0].auth).toBe('Bearer gsk_test_value_123456');
    expect(calls[0].body.response_format).toMatchObject({ type: 'json_schema', json_schema: { name: 'demo', strict: true } });
    expect(calls[0].body.max_completion_tokens).toBeGreaterThan(100);
    expect(calls[0].body.reasoning_effort).toBe('low');
  });

  it('asks for plain JSON when a provider rejects strict schemas, and remembers it', async () => {
    setEnv({ GEMINI_API_KEY: 'AIza_test_value_123456', MUSE_MODEL: 'gemini-test-downgrade' });
    const modes: string[] = [];
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      modes.push(body.response_format.type);
      if (body.response_format.type === 'json_schema') return new Response('{"error":{"message":"Invalid JSON payload: response_format.json_schema is not supported"}}', { status: 400 });
      expect(body.messages[0].content).toContain('JSON Schema');
      return ok('Here you go: {"word":"form"}');
    });
    const p = getProvider()!;
    expect(p.name).toBe('gemini');
    expect((await p.complete(req())).json).toEqual({ word: 'form' });
    expect((await p.complete(req())).json).toEqual({ word: 'form' });
    expect(modes).toEqual(['json_schema', 'json_object', 'json_object']);
  });

  it('marks rate limits and server errors retryable and keeps key-shaped text out of errors', async () => {
    setEnv({ GROQ_API_KEY: 'gsk_test_value_123456' });
    vi.stubGlobal('fetch', async () => new Response('rate limited for gsk_abcdefghijklmnop', { status: 429 }));
    const err = await getProvider()!.complete(req()).catch((e) => e);
    expect(err).toMatchObject({ retryable: true, status: 429 });
    expect(err.message).not.toContain('gsk_abcdefghijklmnop');
    vi.stubGlobal('fetch', async () => new Response('bad key', { status: 401 }));
    expect(await getProvider()!.complete(req()).catch((e) => e)).toMatchObject({ retryable: false, status: 401 });
  });

  it('reports an answer cut off by the token limit instead of guessing', async () => {
    setEnv({ GROQ_API_KEY: 'gsk_test_value_123456' });
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ choices: [{ message: { content: '' }, finish_reason: 'length' }] }), { status: 200 }));
    expect(await getProvider()!.complete(req()).catch((e) => e.message)).toMatch(/ran out of room/);
  });
});
