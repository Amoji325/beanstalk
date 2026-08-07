// Supabase Edge Function: account-deletion-email
//
// Sends a "your account was deleted" confirmation email. The app invokes this
// (best-effort) right before it deletes the Clerk account, while the user's
// session is still valid.
//
// Deploy:
//   supabase functions deploy account-deletion-email
// Configure secrets (uses Resend — swap for any transactional email provider):
//   supabase secrets set RESEND_API_KEY=re_xxx
//   supabase secrets set ACCOUNT_EMAIL_FROM="Beanstalk <noreply@yourdomain.com>"
//
// Hardening note: this trusts the email in the request body. To prevent abuse,
// verify the caller's Clerk JWT (Authorization header) and read the email from
// the verified token instead of the body.

import { serve } from 'https://deno.land/std@0.203.0/http/server.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM_EMAIL = Deno.env.get('ACCOUNT_EMAIL_FROM') ?? 'Branch <noreply@example.com>';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { email, firstName } = await req.json();
    if (!email) return json({ error: 'email is required' }, 400);

    // If no provider key is configured, no-op successfully so the app's
    // deletion flow is never blocked during development.
    if (!RESEND_API_KEY) {
      console.warn('[account-deletion-email] RESEND_API_KEY not set — skipping send');
      return json({ skipped: true });
    }

    const greeting = firstName ? `Hi ${firstName},` : 'Hi,';
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [email],
        subject: 'Your Branch account has been deleted',
        html:
          `<p>${greeting}</p>` +
          `<p>This confirms that your Branch account and all of its data have been ` +
          `permanently deleted. This action cannot be undone.</p>` +
          `<p>If you did not request this, please contact support immediately.</p>`,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error('[account-deletion-email] provider error:', detail);
      return json({ error: 'email provider rejected the request', detail }, 502);
    }

    return json({ sent: true });
  } catch (e) {
    console.error('[account-deletion-email] failed:', e);
    return json({ error: String(e) }, 500);
  }
});
