import { supabase } from "@/lib/supabase";
import { readGuestIdFromStorage, getGuestId } from "@/lib/demo-mode";
import { fetchDemoModeConfigClient } from "@/lib/demo-config";

export async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (token) return { Authorization: `Bearer ${token}` };
  } catch {}

  const existingGuestId = readGuestIdFromStorage();
  if (existingGuestId) {
    return { "X-Guest-Id": existingGuestId };
  }

  const demoConfig = await fetchDemoModeConfigClient();
  if (demoConfig.active) {
    const guestId = getGuestId();
    if (guestId) return { "X-Guest-Id": guestId };
  }
  return {};
}
