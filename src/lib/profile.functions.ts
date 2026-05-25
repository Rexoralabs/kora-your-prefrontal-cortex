// Server functions for the Settings module — profile + account ops.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const getProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("profiles")
      .select("user_id, display_name, avatar_url, preferences, created_at, updated_at")
      .eq("user_id", context.userId)
      .maybeSingle();

    // Fallback to insert on the fly if the trigger didn't fire (older users)
    if (!data) {
      const { data: inserted } = await supabaseAdmin
        .from("profiles")
        .insert({ user_id: context.userId })
        .select("user_id, display_name, avatar_url, preferences, created_at, updated_at")
        .single();
      return inserted ?? null;
    }
    return data;
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        display_name: z.string().min(1).max(80).nullable().optional(),
        avatar_url: z.string().url().max(500).nullable().optional(),
        preferences: z.record(z.string().max(60), z.any()).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, any> = {};
    if (data.display_name !== undefined) patch.display_name = data.display_name;
    if (data.avatar_url !== undefined) patch.avatar_url = data.avatar_url;
    if (data.preferences !== undefined) patch.preferences = data.preferences;
    const { error } = await supabaseAdmin
      .from("profiles")
      .update(patch)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
