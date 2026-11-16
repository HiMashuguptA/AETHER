import { q } from '../db.js';
import { env } from '../env.js';

interface Mail { to: string; kind: 'verify' | 'reset' | 'invite'; subject: string; url: string; lead: string }

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

/**
 * Email adapter. Resend when RESEND_API_KEY is set. Otherwise, outside production and only with
 * DEV_OUTBOX=true, the link is kept in dev_outbox so the app can show it, clearly labelled.
 * With neither, the email is dropped and the failure is logged (never the link itself).
 */
export async function sendEmail(mail: Mail): Promise<void> {
  if (env.resendKey) {
    const html = `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:24px;color:#111"><p>${esc(mail.lead)}</p><p><a href="${esc(mail.url)}" style="display:inline-block;padding:10px 18px;border-radius:999px;background:#000;color:#fff;text-decoration:none">${mail.kind === 'verify' ? 'Confirm email' : mail.kind === 'reset' ? 'Choose a new password' : 'Join the workspace'}</a></p><p style="color:#666;font-size:13px">If you did not ask for this, you can ignore this email.</p></div>`;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.resendKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env.emailFrom, to: [mail.to], subject: mail.subject, html, text: `${mail.lead}\n\n${mail.url}` }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error(`[email] provider rejected a ${mail.kind} email (${res.status})`);
    return;
  }
  if (env.devOutbox || env.stage === 'test') {
    await q(`insert into dev_outbox (email, kind, url) values ($1, $2, $3)`, [mail.to.toLowerCase(), mail.kind, mail.url]);
    return;
  }
  console.error(`[email] no email provider configured; a ${mail.kind} email was not sent`);
}
