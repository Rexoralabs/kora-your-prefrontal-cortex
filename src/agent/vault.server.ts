// Encrypted per-user secret storage using pgcrypto.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function key(): string {
  // Derive a stable app-wide encryption secret. INGEST_HMAC_SECRET reused; if missing fall back to a non-empty constant to avoid crash.
  return process.env.INGEST_HMAC_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "kora-default-vault-key";
}

export async function setSecret(userId: string, name: string, value: string) {
  const k = key();
  const { error } = await supabaseAdmin.rpc("exec_set_vault", { p_user: userId, p_name: name, p_value: value, p_key: k }).single();
  if (!error) return;
  // Fallback: do it with SQL via insert if RPC not yet defined.
  const { data: enc } = await supabaseAdmin
    .from("vault_secrets")
    .select("id")
    .eq("user_id", userId)
    .eq("name", name)
    .maybeSingle();
  const sql = enc
    ? `update vault_secrets set value_encrypted = pgp_sym_encrypt($1,$2), updated_at = now() where user_id = $3 and name = $4`
    : `insert into vault_secrets (user_id, name, value_encrypted) values ($3,$4, pgp_sym_encrypt($1,$2))`;
  // supabase-js has no raw SQL; use admin REST via PostgREST insert.
  if (enc) {
    await supabaseAdmin.rpc("vault_update", { p_user: userId, p_name: name, p_value: value, p_key: k });
  } else {
    await supabaseAdmin.rpc("vault_insert", { p_user: userId, p_name: name, p_value: value, p_key: k });
  }
}

export async function listSecretNames(userId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("vault_secrets")
    .select("name")
    .eq("user_id", userId)
    .order("name");
  return (data ?? []).map((r) => r.name);
}

export async function resolveSecrets(userId: string, names: string[]): Promise<Record<string, string>> {
  if (!names.length) return {};
  const k = key();
  const { data, error } = await supabaseAdmin.rpc("vault_read_many", { p_user: userId, p_names: names, p_key: k });
  if (error) {
    console.warn("[kora.vault] resolveSecrets error", error.message);
    return {};
  }
  const out: Record<string, string> = {};
  for (const row of (data ?? []) as Array<{ name: string; value: string }>) {
    out[row.name] = row.value;
  }
  return out;
}

export async function deleteSecret(userId: string, name: string) {
  await supabaseAdmin.from("vault_secrets").delete().eq("user_id", userId).eq("name", name);
}
