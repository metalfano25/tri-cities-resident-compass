import { getLiveDataPayload } from "../../../lib/live-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const payload = await getLiveDataPayload();
  const anyItems = payload.notices.length + payload.events.length > 0;

  return Response.json(payload, {
    status: anyItems ? 200 : 503,
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=900, stale-while-revalidate=3600",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
