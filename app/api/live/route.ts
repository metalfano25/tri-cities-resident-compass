import { getResidentLiveData } from "../../../lib/live-service";

export const dynamic = "force-dynamic";

export async function GET() {
  const payload = await getResidentLiveData();
  if (!payload) {
    return Response.json(
      { error: "No verified official-source snapshot is available yet." },
      {
        status: 503,
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Type": "application/json; charset=utf-8",
          "X-Content-Type-Options": "nosniff",
          "Retry-After": "60",
        },
      },
    );
  }
  const anyItems = payload.notices.length + payload.events.length > 0;

  return Response.json(payload, {
    status: anyItems ? 200 : 503,
    headers: {
      "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=3600",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
