// ══════════════════════════════════════════════════════════════════════════
// MAI GORO — Supabase Edge Function: fund-webhook
// Receives Monnify reserved-account deposit notifications, verifies the
// HMAC-SHA512 signature, and credits the customer wallet exactly once.
//
// Deploy:
//   supabase functions deploy fund-webhook --no-verify-jwt   (webhooks are unauthenticated by design)
//   supabase secrets set MONNIFY_SECRET_KEY=...
// In the Monnify dashboard set the webhook URL:
//   https://<project-ref>.supabase.co/functions/v1/fund-webhook
//   and (MONNIFY_BASE_URL for create-reserved-account) w/ kiosk? no — just the one URL.
//
// SAFETY MODEL
//   1. Signature check: x-monnify-signature = HMAC-SHA512(raw body, MONNIFY_SECRET_KEY).
//      Unsigned or mismatched webhook → 401, no ledger write at all.
//   2. Only "money received" events are processed; failures/poison payloads are logged.
//   3. Double-credit protection is enforced in the database itself
//      (credit_wallet_verified + unique index on provider_reference) — a replayed
//      webhook returns "duplicate" and does NOT credit twice.
//   4. The credited amount is Monnify's amountPaid (the money that actually
//      arrived). Fees are Monnify's to settle — they are not deducted client-side.
//
// VERIFY BEFORE GO-LIVE: confirm the current event payload/codes against
// docs.monnify.com (this code was written from the documented contract;
// re-check field names once you have sandbox webhooks flowing).
// ══════════════════════════════════════════════════════════════════════════
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MONNIFY_SECRET_KEY = Deno.env.get("MONNIFY_SECRET_KEY")!;

const SUCCESS_STATUSES = new Set(["SUCCESSFUL", "PAID"]);

async function hmacSha512Hex(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return Response.json({ error: "POST only" }, { status: 405 });

  const rawBody = await req.text();
  const provided = req.headers.get("x-monnify-signature") ?? "";
  const expected = await hmacSha512Hex(MONNIFY_SECRET_KEY, rawBody);

  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    console.error("fund-webhook: signature mismatch");
    return Response.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }

  // Monnify reserved-account deposits arrive as this event type; check money-arrival only.
  const eventType = String(payload?.eventType ?? "");
  const txStatus = String(payload?.transactionStatus ?? "").toUpperCase();
  const isDeposit =
    eventType.includes("reservedAccount") && eventType.includes("Transaction") ||
    /SUCCESSFUL|PAID/.test(txStatus);
  if (!isDeposit || !SUCCESS_STATUSES.has(txStatus)) {
    console.log(`fund-webhook: ignored event ${eventType || "(none)"} status=${txStatus}`);
    return Response.json({ ok: true, ignored: true });
  }

  // Who is this deposit for? The accountReference we minted encodes the user id.
  const accountReference = String(payload?.accountNumber?.accountReference ?? "");
  const providerReference = String(payload?.transactionReference ?? "");
  const paymentReference = String(payload?.paymentReference ?? "");
  const provider = "monnify";

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

  // 1. Resolve the customer from the reserved account — trust ONLY our stored record.
  let userId: string | null = null;
  if (accountReference) {
    const { data: acct } = await admin
      .from("payment_accounts")
      .select("user_id")
      .eq("provider", provider)
      .eq("account_reference", accountReference)
      .eq("status", "active")
      .maybeSingle();
    userId = acct?.user_id ?? null;
  }
  if (!userId) {
    // Fallback: the webhook carries the account number; look it up instead.
    const vn = payload?.accountNumber?.accountNumber ?? payload?.accountNumber;
    if (typeof vn === "string") {
      const { data: acct } = await admin
        .from("payment_accounts")
        .select("user_id")
        .eq("provider", provider)
        .eq("account_number", vn)
        .eq("status", "active")
        .maybeSingle();
      userId = acct?.user_id ?? null;
    }
  }
  if (!userId) {
    console.error(`fund-webhook: no customer for ref=${accountReference || paymentReference}`);
    return Response.json({ ok: true, unresolved: true });
  }

  // 2. Credit exactly this amount — the money that actually arrived.
  const amountPaid = Number(payload?.amountPaid ?? 0);
  if (!(amountPaid > 0)) {
    console.error(`fund-webhook: non-positive amountPaid=${payload?.amountPaid}`);
    return Response.json({ ok: true, ignored: true });
  }

  const reference =
    String(payload?.paymentReference ?? "") || `VF-${providerReference.slice(0, 12)}`;

  const { data: credited, error: creditErr } = await admin.rpc("credit_wallet_verified", {
    p_user_id: userId,
    p_amount: amountPaid,
    p_reference: reference,
    p_description: "Wallet funding via transfer to your dedicated account",
    p_provider: provider,
    p_provider_reference: providerReference || paymentReference,
  });

  if (creditErr) {
    console.error("fund-webhook: credit error", creditErr.message);
    // Return 500 so Monnify retries; the DB uniqueness guard keeps retries safe.
    return Response.json({ error: "credit failed" }, { status: 500 });
  }

  console.log(`fund-webhook: ${credited?.status} user=${userId} amount=${amountPaid}`);
  return Response.json({ ok: true, result: credited?.status ?? "processed" });
});

// Constant-time comparison to avoid leaking signature bytes via timing.
function timingSafeEqual(a: string, b: string): boolean {
  let mismatch = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  for (let i = len; i < b.length; i++) mismatch |= b.charCodeAt(i);
  return mismatch === 0;
}
