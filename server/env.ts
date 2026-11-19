/**
 * Server configuration. Every secret is read from the environment at request time and never
 * returned to the browser. See .env.example for what each variable does.
 */
const e = (k: string) => (process.env[k] ?? '').trim();

export const env = {
  get databaseUrl() { return e('DATABASE_URL'); },
  get authSecret() { return e('AUTH_SECRET'); },
  /** 'production' | 'preview' | 'development' | 'test' */
  get stage(): string { return e('AETHER_ENV') || e('VERCEL_ENV') || (e('NODE_ENV') === 'test' ? 'test' : 'development'); },
  get isProduction() { return this.stage === 'production'; },
  get appUrl() {
    if (e('APP_URL')) return e('APP_URL').replace(/\/$/, '');
    if (e('VERCEL_ENV') === 'production' && e('VERCEL_PROJECT_PRODUCTION_URL')) return `https://${e('VERCEL_PROJECT_PRODUCTION_URL')}`;
    if (e('VERCEL_BRANCH_URL')) return `https://${e('VERCEL_BRANCH_URL')}`;
    if (e('VERCEL_URL')) return `https://${e('VERCEL_URL')}`;
    return 'http://localhost:8787';
  },
  /** Extra origins allowed to call the API with cookies (comma separated). */
  get extraOrigins() { return e('ALLOWED_ORIGINS').split(',').map((s) => s.trim()).filter(Boolean); },

  // --- email ---
  get resendKey() { return e('RESEND_API_KEY'); },
  get emailFrom() { return e('EMAIL_FROM') || 'AETHER <onboarding@resend.dev>'; },
  /** Staging only: show verification and reset links in the app when no email provider is set. Ignored in production. */
  get devOutbox() { return e('DEV_OUTBOX') === 'true' && !this.isProduction; },
  /**
   * Sign-up asks people to confirm their email only when an email can actually reach them
   * (a provider is configured, or the staging outbox is on). Set to 'true' or 'false' to override.
   */
  get requireEmailVerification() {
    const v = e('AUTH_REQUIRE_EMAIL_VERIFICATION');
    if (v === 'false') return false;
    if (v === 'true') return true;
    return !!this.resendKey || this.devOutbox || this.stage === 'test';
  },

  // --- Google sign-in (optional) ---
  get googleId() { return e('GOOGLE_CLIENT_ID'); },
  get googleSecret() { return e('GOOGLE_CLIENT_SECRET'); },

  // --- Muse ---
  /**
   * 'groq' or 'gemini' (free tiers, need only a free API key), 'openai' (any OpenAI-compatible API),
   * 'anthropic', 'gateway' (Vercel AI Gateway), or 'fallback'. Unset: the first key found decides.
   */
  get museProvider() {
    const p = e('MUSE_PROVIDER');
    if (p && p !== 'auto') return p;
    if (e('GROQ_API_KEY')) return 'groq';
    if (e('GEMINI_API_KEY')) return 'gemini';
    if (e('ANTHROPIC_API_KEY')) return 'anthropic';
    if (e('OPENAI_API_KEY')) return 'openai';
    if (e('AI_GATEWAY_API_KEY')) return 'gateway';
    return 'fallback';
  },
  get museModel() { return e('MUSE_MODEL'); },
  get museBaseUrl() { return e('MUSE_BASE_URL'); },
  get gatewayKey() { return e('AI_GATEWAY_API_KEY'); },
  get openaiKey() { return e('OPENAI_API_KEY'); },
  get groqKey() { return e('GROQ_API_KEY'); },
  get geminiKey() { return e('GEMINI_API_KEY'); },
  get anthropicKey() { return e('ANTHROPIC_API_KEY'); },
  get museTimeoutMs() { return Number(e('MUSE_TIMEOUT_MS')) || 25000; },
  /** Hard stops on spend, in USD. */
  get museDailyBudget() { return Number(e('MUSE_DAILY_BUDGET_USD')) || 2; },
  get museWorkspaceDailyBudget() { return Number(e('MUSE_WORKSPACE_DAILY_BUDGET_USD')) || 0.5; },

  // --- storage ---
  get blobToken() { return e('BLOB_READ_WRITE_TOKEN'); },
  get storageProvider() { return e('STORAGE_PROVIDER') || (this.blobToken ? 'vercel-blob' : this.stage === 'development' || this.stage === 'test' ? 'local' : 'none'); },
  get localStorageDir() { return e('LOCAL_STORAGE_DIR') || '.data/uploads'; },

  // --- publishing ---
  /** 'builtin' serves published experiences from this app at /p/<slug>. */
  get publishAdapter() { return e('PUBLISH_ADAPTER') || 'builtin'; },
};

const MUSE_LABELS: Record<string, string> = { groq: 'Groq', gemini: 'Google Gemini', openai: 'OpenAI compatible', anthropic: 'Anthropic', gateway: 'Vercel AI Gateway' };

/** What is switched on in this environment; safe to send to the browser. */
export function capabilities() {
  return {
    environment: env.stage,
    muse: { provider: env.museProvider, label: MUSE_LABELS[env.museProvider] ?? 'Development fallback', real: env.museProvider !== 'fallback' },
    email: { delivery: env.resendKey ? 'resend' : env.devOutbox ? 'dev-outbox' : 'none', verificationRequired: env.requireEmailVerification },
    google: !!(env.googleId && env.googleSecret),
    storage: env.storageProvider,
    publishing: { adapter: env.publishAdapter, customDomains: false },
  };
}
