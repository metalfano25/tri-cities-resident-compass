import {
  CommunityNeedValidationError,
  listApprovedCommunityNeeds,
  submitCommunityNeed,
  validateCommunityNeed,
} from "../../../lib/community-needs";

export const dynamic = "force-dynamic";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

export async function GET() {
  const items = await listApprovedCommunityNeeds();
  return Response.json(
    {
      items,
      moderation: "Resident suggestions appear only after evidence and privacy review.",
    },
    {
      headers: {
        ...JSON_HEADERS,
        "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=1800",
      },
    },
  );
}

export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > 8_192) {
    return Response.json({ error: "Submission is too large." }, { status: 413, headers: { ...JSON_HEADERS, "Cache-Control": "no-store" } });
  }
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    return Response.json({ error: "Use application/json." }, { status: 415, headers: { ...JSON_HEADERS, "Cache-Control": "no-store" } });
  }
  try {
    const text = await request.text();
    if (text.length > 8_192) {
      return Response.json({ error: "Submission is too large." }, { status: 413, headers: { ...JSON_HEADERS, "Cache-Control": "no-store" } });
    }
    const input = validateCommunityNeed(JSON.parse(text));
    const result = await submitCommunityNeed(input);
    return Response.json(
      {
        accepted: true,
        duplicate: result.duplicate,
        id: result.id,
        status: "pending",
        message: "Thank you. This suggestion will be reviewed before it can appear publicly.",
      },
      { status: result.duplicate ? 200 : 202, headers: { ...JSON_HEADERS, "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof CommunityNeedValidationError || error instanceof SyntaxError) {
      return Response.json(
        { error: error instanceof CommunityNeedValidationError ? error.message : "Submission must be valid JSON." },
        { status: 400, headers: { ...JSON_HEADERS, "Cache-Control": "no-store" } },
      );
    }
    return Response.json(
      { error: "Community feedback is temporarily unavailable." },
      { status: 503, headers: { ...JSON_HEADERS, "Cache-Control": "no-store", "Retry-After": "60" } },
    );
  }
}
