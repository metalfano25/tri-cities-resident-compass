import { getLiveDataPayload } from "../../../lib/live-data";
import {
  authorizeIngestionRequest,
  claimLiveIngestion,
  persistLiveDataPayload,
  releaseLiveIngestion,
} from "../../../lib/live-store";

export const dynamic = "force-dynamic";

const JSON_HEADERS = {
  "Cache-Control": "private, no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

export async function POST(request: Request) {
  const authorization = await authorizeIngestionRequest(request);
  if (authorization === "missing-secret") {
    return Response.json({ error: "Ingestion is not configured." }, { status: 503, headers: JSON_HEADERS });
  }
  if (authorization !== "authorized") {
    return Response.json({ error: "Unauthorized." }, { status: 401, headers: JSON_HEADERS });
  }
  if (!(await claimLiveIngestion())) {
    return Response.json(
      { error: "An ingestion run is active or the ingestion cooldown has not elapsed." },
      { status: 409, headers: { ...JSON_HEADERS, "Retry-After": "60" } },
    );
  }

  try {
    const payload = await getLiveDataPayload();
    const result = await persistLiveDataPayload(payload);
    return Response.json(
      {
        ok: true,
        mode: payload.mode,
        generatedAt: payload.generatedAt,
        recordCount: result.recordCount,
        changedRecordCount: result.changedRecordCount,
        preservedRecordCount: result.preservedRecordCount,
        sourceCount: payload.sources.length,
      },
      { status: 200, headers: JSON_HEADERS },
    );
  } catch {
    return Response.json({ error: "Ingestion failed safely." }, { status: 500, headers: JSON_HEADERS });
  } finally {
    await releaseLiveIngestion();
  }
}
