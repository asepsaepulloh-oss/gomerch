import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface AuthenticatedUser {
  id: string;
  email?: string;
  displayName?: string;
}

export async function getDashboardSessionUser(): Promise<AuthenticatedUser | null> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (!error && user) {
      return {
        id: user.id,
        email: user.email,
        displayName: user.user_metadata?.full_name || user.email?.split("@")[0],
      };
    }
  } catch {
    // If Supabase is unreachable or not configured
  }

  // Fallback demo user for local sandbox development & testing if NEXT_PUBLIC_SUPABASE_URL is unconfigured
  const hasSupabase = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("dummy-project")
  );

  if (!hasSupabase) {
    return {
      id: "usr_demo_dashboard_owner",
      email: "demo@qrisgateway.local",
      displayName: "Demo Merchant Admin",
    };
  }

  return null;
}
