export async function fetchPublicJson<T>(url: string, timeoutMs = 15000): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error('The request timed out.'));
      controller.abort();
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error('The request failed.');
        return response.json() as Promise<T>;
      })(),
      timeout,
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
