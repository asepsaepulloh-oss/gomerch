import { NextRequest, NextResponse } from "next/server";
import { runGlobalSyncWorker } from "@/server/services/sync-worker";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const { searchParams } = new URL(req.url);
    const keyParam = searchParams.get("key");
    const cronSecret = process.env.CRON_SECRET;

    // Verify CRON_SECRET if configured (supports Authorization header OR ?key= query parameter)
    if (cronSecret) {
      const isHeaderValid = authHeader === `Bearer ${cronSecret}`;
      const isQueryValid = keyParam === cronSecret;

      if (!isHeaderValid && !isQueryValid) {
        return NextResponse.json(
          {
            success: false,
            error: "Unauthorized cron execution. Gunakan header Authorization: Bearer <CRON_SECRET> atau parameter URL ?key=<CRON_SECRET>.",
          },
          { status: 401 }
        );
      }
    }

    const results = await runGlobalSyncWorker();

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      results,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Cron worker execution failed." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
