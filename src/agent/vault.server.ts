// Per-user encrypted secret storage using Web Crypto (AES-GCM).
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function masterKey(): string {
  return (
    process.env.INGEST_HMAC_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "kora-default-vault-key-change-me"
  );
}

async function deriveKey(): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(masterKey()));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encrypt(plain: string): Promise<Uint8Array> {
  const key = await deriveKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain)),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return out;
}

async function decrypt(blob: Uint8Array): Promise<string> {
  const key = await deriveKey();
  const iv = blob.slice(0, 12);
  const ct = blob.slice(12);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(plain);
}

function toBytea(u8: Uint8Array): string {
  // Postgres bytea hex format \x...
  let hex = "\\x";
  for (const b of u8) hex += b.toString(16).padStart(2, "0");
  return hex;
}

function fromBytea(v: string | Uint8Array): Uint8Array {
  if (v instanceof Uint8Array) return v;
  if (typeof v === "string" && v.startsWith("\\x")) {
    const hex = v.slice(2);
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
  }
  // base64 fallback
  const bin = atob(v as string);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function setSecret(userId: string, name: string, value: string) {
  const enc = await encrypt(value);
  await supabaseAdmin
    .from("vault_secrets")
    .upsert(
      { user_id: userId, name, value_encrypted: toBytea(enc) as any },
      { onConflict: "user_id,name" },
    );
}

export async function deleteSecret(userId: string, name: string) {
  await supabaseAdmin.from("vault_secrets").delete().eq("user_id", userId).eq("name", name);
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
  const { data, error } = await supabaseAdmin
    .from("vault_secrets")
    .select("name, value_encrypted")
    .eq("user_id", userId)
    .in("name", names);
  if (error || !data) return {};
  const out: Record<string, string> = {};
  for (const row of data) {
    try {
      out[row.name] = await decrypt(fromBytea(row.value_encrypted as any));
    } catch (e) {
      console.warn("[kora.vault] decrypt failed for", row.name);
    }
  }
  return out;
}
