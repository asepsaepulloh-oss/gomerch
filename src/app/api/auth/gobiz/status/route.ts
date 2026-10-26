import { NextRequest, NextResponse } from "next/server";
import { getDashboardSessionUser } from "@/server/auth/session";
import { db } from "@/server/db/unified-db";

export async function GET(req: NextRequest) {
  try {
    const user = await getDashboardSessionUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const connection = await db.connections.getByOwnerId(user.id);
    if (!connection) {
      return NextResponse.json({
        success: true,
        data: null,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: connection.id,
        status: connection.status,
        merchant_id: connection.merchant_id,
        merchant_name: connection.merchant_name,
        phone_masked: connection.phone_masked,
        token_expires_at: connection.token_expires_at,
        connected_at: connection.updated_at,
        last_sync_at: connection.last_sync_at,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
