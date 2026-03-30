import logger from "./logger.js";
import type { SearchResponse, SearchResult } from "./types.js";

interface SerpApiOrganicResult {
  title: string;
  link: string;
  snippet?: string;
}

interface SerpApiResponse {
  organic_results?: SerpApiOrganicResult[];
  error?: string;
}

/**
 * Search using SerpAPI (Google Search).
 * Requires SERPAPI_KEY environment variable.
 */
export async function googleApiSearch(
  query: string,
  limit: number = 10
): Promise<SearchResponse> {
  const apiKey = process.env.SERPAPI_KEY;

  if (!apiKey) {
    throw new Error("Missing required environment variable: SERPAPI_KEY must be set");
  }

  const url = new URL("https://serpapi.com/search");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", query);
  url.searchParams.set("num", String(Math.min(limit, 100)));

  logger.info({ query, limit }, "Calling SerpAPI");

  const response = await fetch(url.toString());
  const data: SerpApiResponse = await response.json() as SerpApiResponse;

  if (!response.ok || data.error) {
    throw new Error(`SerpAPI error ${response.status}: ${data.error ?? response.statusText}`);
  }

  const results: SearchResult[] = (data.organic_results ?? [])
    .slice(0, limit)
    .map((item) => ({
      title: item.title,
      link: item.link,
      snippet: item.snippet ?? "",
    }));

  logger.info({ query, count: results.length }, "SerpAPI search completed");

  return { query, results };
}
