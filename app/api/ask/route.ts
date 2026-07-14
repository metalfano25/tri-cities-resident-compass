import type { CommunityId } from "../../../app/data";
import { answerCompassQuestion, validateCompassQuestion } from "../../../lib/ask-compass";
import { getResidentLiveData } from "../../../lib/live-service";
import { deriveQualityOfLifeSnapshot } from "../../../lib/quality-intelligence";

export const dynamic = "force-dynamic";

const COMMUNITIES = new Set<CommunityId>(["geneva", "batavia", "st-charles"]);
const JSON_HEADERS = {
  "Cache-Control": "private, no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

function errorResponse(error: string, status: number) {
  return Response.json({ error }, { status, headers: JSON_HEADERS });
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 4_096) return errorResponse("Request is too large.", 413);
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return errorResponse("Use application/json.", 415);
  }

  let body: { question?: unknown; community?: unknown };
  try {
    const text = await request.text();
    if (text.length > 4_096) return errorResponse("Request is too large.", 413);
    body = JSON.parse(text) as { question?: unknown; community?: unknown };
  } catch {
    return errorResponse("Invalid JSON.", 400);
  }

  let question: string;
  try {
    question = validateCompassQuestion(body.question);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Invalid question.", 400);
  }

  const community = typeof body.community === "string" && COMMUNITIES.has(body.community as CommunityId)
    ? body.community as CommunityId
    : undefined;
  if (body.community != null && !community) return errorResponse("Unsupported community.", 400);

  const liveData = await getResidentLiveData();
  if (!liveData) {
    return Response.json(
      { error: "No verified official-source snapshot is available yet." },
      { status: 503, headers: { ...JSON_HEADERS, "Retry-After": "60" } },
    );
  }

  const result = answerCompassQuestion(deriveQualityOfLifeSnapshot(liveData), question, community);
  return Response.json(result, {
    headers: {
      ...JSON_HEADERS,
    },
  });
}
