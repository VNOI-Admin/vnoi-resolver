// File / URL helpers used by the splash form (Loading.tsx).

export function readJsonFile<T>(
  file: File,
  parse: (raw: unknown) => T
): Promise<T> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = JSON.parse(reader.result as string);
        resolve(parse(raw));
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

// Best-effort extraction of a filename from a URL, used as a display label
// when data/image was loaded from `?data=...` / `?image=...`. Falls back to
// the raw URL on parse failure.
export function urlBasename(url: string): string {
  try {
    const last = new URL(url).pathname.split('/').filter(Boolean).pop();
    return last || url;
  } catch {
    return url;
  }
}
