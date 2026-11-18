import { betterAuth } from 'better-auth';
import { getPool, q } from './db.js';
import { env } from './env.js';
import { sendEmail } from './services/email.js';
import { createWorkspace } from './services/workspaces.js';

interface Auth { handler(request: Request): Promise<Response>; api: { getSession(input: { headers: Headers }): Promise<{ user: { id: string; name: string; email: string; emailVerified: boolean; image?: string | null } } | null> } }
let auth: Auth | null = null;

export function allowedOrigins(): string[] {
  const list = new Set<string>([env.appUrl, ...env.extraOrigins]);
  for (const k of ['VERCEL_URL', 'VERCEL_BRANCH_URL', 'VERCEL_PROJECT_PRODUCTION_URL']) {
    const v = process.env[k];
    if (v) list.add(`https://${v}`);
  }
  if (!env.isProduction && env.stage !== 'preview') ['http://localhost:5173', 'http://localhost:8787', 'http://127.0.0.1:8787'].forEach((o) => list.add(o));
  return [...list];
}

/** Sessions are httpOnly, same-site cookies issued by the API on the app's own origin. */
export function getAuth(): Auth {
  if (auth) return auth;
  if (!env.authSecret || env.authSecret.length < 32) throw new Error('AUTH_SECRET must be set to a random value of at least 32 characters');
  const instance = betterAuth({
    database: getPool(),
    secret: env.authSecret,
    baseURL: env.appUrl,
    basePath: '/api/auth',
    trustedOrigins: allowedOrigins(),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      requireEmailVerification: env.requireEmailVerification,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, token }) => {
        const url = `${env.appUrl}/#reset-password?token=${encodeURIComponent(token)}`;
        await sendEmail({ to: user.email, kind: 'reset', subject: 'Reset your AETHER password', url, lead: 'Use the link below to choose a new password. It works once and expires in one hour.' });
      },
    },
    emailVerification: {
      // without an email provider in production there is nothing to send, and sign-up does not wait for it
      sendOnSignUp: env.requireEmailVerification || !!env.resendKey,
      sendOnSignIn: env.requireEmailVerification,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendEmail({ to: user.email, kind: 'verify', subject: 'Confirm your email for AETHER', url, lead: 'Confirm this address to finish creating your AETHER account.' });
      },
    },
    socialProviders: env.googleId && env.googleSecret ? { google: { clientId: env.googleId, clientSecret: env.googleSecret } } : {},
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    rateLimit: { enabled: env.stage !== 'test', storage: 'database', window: 60, max: 40, customRules: { '/sign-in/email': { window: 60, max: 8 }, '/sign-up/email': { window: 300, max: 6 }, '/request-password-reset': { window: 300, max: 4 } } },
    advanced: { useSecureCookies: env.appUrl.startsWith('https://'), ipAddress: { ipAddressHeaders: ['x-forwarded-for'] } },
    databaseHooks: {
      user: {
        create: {
          // every new account gets a personal workspace it owns
          after: async (user) => {
            const first = (user.name || user.email.split('@')[0]).split(' ')[0];
            await createWorkspace({ name: `${first}'s studio`, userId: user.id });
          },
        },
      },
    },
  });
  auth = instance as unknown as Auth;
  return auth;
}

export async function deleteExpiredAuthRows() {
  await q(`delete from "verification" where "expiresAt" < now() - interval '1 day'`).catch(() => undefined);
}
