// ══════════════════════════════════════════════════════════════════════════
// MAI GORO — Supabase Edge Function: create-reserved-account
// Assigns a Monnify dedicated virtual bank account to a signed-in customer
// and stores it in public.payment_accounts. Idempotent: re-running returns
// the customer's existing account instead of creating a second one.
//
// Deploy (after Monnify KYC approves your account):
//   supabase functions deploy create-reserved-account
//   supabase secrets set MONNIFY_API_KEY=... MONNIFY_SECRET_KEY=... \
//                       MONNIFY_CONTRACT_CODE=... MONNIFY_BASE_URL=https://api.monnify.com
//   (sandbox: use https://sandbox.monnify.com during testing)
//
// The function authenticates the caller's Supabase JWT and uses ONLY the
// service role inside — customers never see provider credentials.
// ══════════════════════════════════════════════════════════════════════════
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MONNIFY_BASE_URL = Deno.env.get("MONNIFY_BASE_URL") ?? "https://api.monnify.com";
const MONNIFY_API_KEY = Deno.env.get("MONNIFY_API_KEY")!;
const MONNIFY_SECRET_KEY = Deno.env.get("MONNIFY_SECRET_KEY")!;
const MONNIFY_CONTRACT_CODE = Deno.env.get("MONNIFY_CONTRACT_CODE")!;

// Exchange API key + secret key for a Monnify access token.
async function monnifyToken(): Promise<string> {
  const credentials = btoa(`${MONNIFY_API_KEY}:${MONNIFY_SECRET_KEY}`);
  const res = await fetch(`${MONNIFY_BASE_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { Authorization: `Basic ${credentials}` },
  });
  if (!res.ok) throw new Error(`Monnify auth failed (${res.status})`);
  const body = await res.json();
  if (body.responseCode !== "0") throw new Error("Monnify auth rejected");
  return body.responseMessage.accessToken ?? body.responseMessage; // token
}

Deno.serve(async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return Response.json({ error: "POST only" }, { status: 405, headers: cors });
  }

  try {
    // 1. Authenticate the caller with THEIR Supabase JWT.
    const supabaseAuthed = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: authRes } = await supabaseAuthed.auth.getUser();
    const user = authRes?.user;
    if (!user) return Response.json({ error: "Not signed in" }, { status: 401, headers: cors });

    // 2. Already has a funding account? Return it (idempotent).
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
    const { data: existing } = await admin
      .from("payment_accounts")
      .select("bank_name, account_number, account_name, account_reference, provider, assigned_at")
      .eq("user_id", user.id)
      .eq("provider", "monnify")
      .eq("status", "active")
      .maybeSingle();
    if (existing) {
      return Response.json({ assigned: true, reuse: true, account: existing }, { headers: cors });
    }

    // 3. Ask Monnify for a reserved account.
    const accountReference = `MG-${user.id.slice(0, 8)}-${Date.now().toString(36)}`;
    const token = await monnifyToken();

    // Customer profile info: read from auth metadata (full_name, phone).
    const meta = (user.user_metadata ?? {}) as Record<string, string>;
    const fullName = meta.full_name || (user.email ?? "Mai Goro Customer").split("@")[0];

    const reserveRes = await fetch(`${MONNIFY_BASE_URL}/api/v2/bank-transfer/reserved-accounts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        accountReference,
        accountName: fullName,
        customerEmail: user.email,
        customerName: fullName,
        contractCode: MONNIFY_CONTRACT_CODE,
        currencyCode: "NGN",
        reservationNotificationType: "WEBHOOK",
      }),
    });
    const reserveBody = await reserveRes.json();
    if (reserveBody.responseCode !== "0" || !reserveBody.responseObject?.accounts?.length) {
      throw new Error(`Monnify reserve failed: ${reserveBody.responseMessage ?? "no accounts"}`);
    }
    // Monnify returns one or more bank accounts to display to the customer.
    const primary = reserveBody.responseObject.accounts[0];

    // 4. Persist (service role only). customer_profile_id can be stashed too.
    const row = {
      user_id: user.id,
      provider: "monnify",
      account_reference: reserveBody.responseObject.accountReference,
      contract_code: MONNIFY_CONTRACT_CODE,
      bank_name: primary.bankName,
      account_number: primary.accountNumber,
      account_name: fullName,
      status: "active",
    };
    const { data: stored, error: storeErr } = await admin
      .from("payment_accounts")
      .upsert(row, { onConflict: "user_id,provider" })
      .select()
      .single();
    if (storeErr) throw storeErr;

    return Response.json({ assigned: true, account: stored }, { headers: cors });
  } catch (err) {
    console.error("create-reserved-account:", err instanceof Error ? err.message : err);
    return Response.json(
      { error: "Could not assign a funding account right now — try again shortly." },
      { status: 502, headers: cors },
    );
  }
});
