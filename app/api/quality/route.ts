import { deriveQualityOfLifeSnapshot } from "../../../lib/quality-intelligence";
import { getResidentLiveData } from "../../../lib/live-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestedCommunity = new URL(request.url).searchParams.get("community");
  const supported = new Set(["geneva", "batavia", "st-charles"]);
  if (requestedCommunity && !supported.has(requestedCommunity)) {
    return Response.json({ error: "Unsupported community" }, { status: 400 });
  }
  const liveData = await getResidentLiveData();
  if (!liveData) {
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
  const snapshot = deriveQualityOfLifeSnapshot(liveData);
  if (requestedCommunity) {
    const community = requestedCommunity;
    snapshot.communities = snapshot.communities.filter((item) => item === community);
    snapshot.opportunityCenter = snapshot.opportunityCenter.filter((item) => item.communityId === community);
    snapshot.decisionDecoder = snapshot.decisionDecoder.filter((item) => item.communityId === community);
    snapshot.changeMap = snapshot.changeMap.filter((item) => item.communityId === community);
    snapshot.family = snapshot.family.filter((item) => item.communityId === community);
    snapshot.mobility = snapshot.mobility.filter((item) => item.communityId === community);
    snapshot.liveWell = snapshot.liveWell.filter((item) => item.communityId === community);
    snapshot.localEconomy = snapshot.localEconomy.filter((item) => item.communityId === community);
    snapshot.coverage.derivedItems = [snapshot.opportunityCenter, snapshot.decisionDecoder, snapshot.changeMap, snapshot.family, snapshot.mobility, snapshot.liveWell, snapshot.localEconomy].flat().length;
    for (const communityId of ["geneva", "batavia", "st-charles"] as const) {
      if (communityId !== community) snapshot.coverage.byCommunity[communityId] = 0;
    }
  }
  return Response.json(snapshot, {
    headers: {
      "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=3600",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
