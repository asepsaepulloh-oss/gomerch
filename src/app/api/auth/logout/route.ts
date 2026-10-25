import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    await supabase.auth.signOut();
  } catch {}

  const origin = new URL(request.url).origin;
  return NextResponse.redirect(`${origin}/login`, { status: 302 });
}
