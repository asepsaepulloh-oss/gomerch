import { NextRequest, NextResponse } from "next/server";
import { runGlobalSyncWorker } from "@/server/services/sync-worker";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    // Verify CRON_SECRET if configured
    if (cronSecret) {
      const expected = `Bearer ${cronSecret}`;
      if (authHeader !== expected) {
        return NextResponse.json(
          { success: false, error: "Unauthorized cron execution." },
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
