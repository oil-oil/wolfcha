import { ensureAdminClient, supabaseAdmin } from "@/lib/supabase-admin";

export async function authenticateAccessToken(token: string): Promise<{ id: string } | null> {
  ensureAdminClient();
  const normalized = token.trim();
  if (!normalized) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(normalized);
  return error || !data?.user?.id ? null : { id: data.user.id };
}
