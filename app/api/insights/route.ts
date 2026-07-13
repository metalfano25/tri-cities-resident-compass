import { getLiveDataPayload } from "../../../lib/live-data";
import {
  claimInsightGeneration,
  readInsightCache,
  releaseInsightLock,
  writeInsightCache,
} from "../../../lib/insight-cache";
import { generateInsights, INSIGHT_MODEL } from "../../../lib/insights";
import type { InsightScope } from "../../../lib/insight-types";

export const dynamic = "force-dynamic";
const scopes = new Set<InsightScope>(["all", "geneva", "batavia", "st-charles"]);

export async function GET(request: Request) {
  const requested = new URL(request.url).searchParams.get("community") ?? "all";
  if (!scopes.has(requested as InsightScope)) {
    return Response.json({ error: "Unsupported community" }, { status: 400 });
  }
  const liveData = await getLiveDataPayload();
  if (liveData.notices.length + liveData.events.length === 0) {
    return Response.json({ error: "No current official records are available for analysis" }, { status: 503 });
  }
  const scope = requested as InsightScope;
  const fallback = await generateInsights(liveData, scope);
  let payload = fallback;

  if (process.env.OPENAI_API_KEY) {
    const cacheKey = `${scope}:${fallback.sourceFingerprint}:${INSIGHT_MODEL}`;
    const cached = await readInsightCache(cacheKey);
    if (cached) {
      payload = cached;
    } else {
      const configuredLimit = Number.parseInt(process.env.AI_DAILY_CALL_LIMIT ?? "40", 10);
      const dailyLimit = Number.isFinite(configuredLimit) ? Math.min(Math.max(configuredLimit, 1), 200) : 40;
      const claimed = await claimInsightGeneration(cacheKey, dailyLimit);
      if (claimed) {
        try {
          const generated = await generateInsights(liveData, scope, process.env.OPENAI_API_KEY);
          if (generated.mode === "ai") {
            await writeInsightCache(cacheKey, generated);
            payload = generated;
          }
        } finally {
          await releaseInsightLock(cacheKey);
        }
      }
    }
  }
  return Response.json(payload, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
