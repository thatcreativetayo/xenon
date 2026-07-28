import { Resend } from 'resend'

import { env } from '../config/env.js'
import { CODE_TTL_MS } from '../config/constants.js'
import { badGateway } from '../lib/errors.js'

const resend = new Resend(env.resendApiKey)

const ttlMinutes = Math.round(CODE_TTL_MS / 60_000)

function renderCodeEmail(code: string): { subject: string; text: string; html: string } {
  return {
    subject: `Your Xenon sign-in code: ${code}`,
    text: [
      `Your Xenon sign-in code is ${code}`,
      '',
      `It expires in ${ttlMinutes} minutes and can only be used once.`,
      '',
      "If you didn't request this, you can ignore this email.",
    ].join('\n'),
    html: `<!doctype html>
<html>
  <body style="margin:0;padding:32px;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1d23">
    <div style="max-width:440px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
      <h1 style="margin:0 0 8px;font-size:18px;font-weight:600">Sign in to Xenon</h1>
      <p style="margin:0 0 24px;font-size:14px;color:#5c6370">Enter this code to finish signing in.</p>
      <div style="font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;padding:20px;background:#f6f7f9;border-radius:8px">${code}</div>
      <p style="margin:24px 0 0;font-size:13px;color:#5c6370">
        This code expires in ${ttlMinutes} minutes and can only be used once.
      </p>
      <p style="margin:12px 0 0;font-size:13px;color:#8b909a">
        If you didn't request this, you can safely ignore this email.
      </p>
    </div>
  </body>
</html>`,
  }
}

export async function sendLoginCodeEmail(to: string, code: string): Promise<void> {
  const { subject, text, html } = renderCodeEmail(code)

  // The Resend SDK reports failures in the response body rather than throwing.
  const { data, error } = await resend.emails.send({
    from: env.resendFrom,
    to: [to],
    subject,
    text,
    html,
  })

  if (error) {
    console.error('[mailer] Resend rejected the send:', error)
    // The most common cause in local dev: the sandbox sender
    // (onboarding@resend.dev) only delivers to the Resend account owner's
    // address. See SETUP.md §2.4.
    throw badGateway('email_send_failed', 'Could not send the login code email.')
  }

  console.log(`[mailer] sent login code to ${to} (resend id: ${data?.id ?? 'unknown'})`)
}
