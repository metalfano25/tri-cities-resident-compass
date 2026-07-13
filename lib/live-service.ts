import {
  readCachedLiveDataPayload,
  type CachedLiveDataPayload,
} from "./live-store";

/**
 * Serve the durable last-good snapshot without contacting upstream publishers.
 * Collection is reserved for the authenticated /api/ingest route so ordinary
 * page traffic and cache misses cannot create scrape traffic.
 */
export async function getResidentLiveData(): Promise<CachedLiveDataPayload | null> {
  return readCachedLiveDataPayload();
}
