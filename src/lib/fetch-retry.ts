const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

export const DEFAULT_RETRY_DELAYS_MS = [600, 1800];

/** `fetch` that retries transient provider failures (overload, rate limit, network) with short waits. */
export async function fetchWithRetry(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  delaysMs: readonly number[] = DEFAULT_RETRY_DELAYS_MS,
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const lastAttempt = attempt >= delaysMs.length;
    try {
      const response = await fetchImpl(url, init);
      if (!RETRYABLE_STATUSES.has(response.status) || lastAttempt) {
        return response;
      }
    } catch (error) {
      if (lastAttempt) {
        throw error;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt]));
  }
}
