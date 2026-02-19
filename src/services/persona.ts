const cache = new Map<string, string>();

export async function loadPersona(agentId: string): Promise<string> {
  const cached = cache.get(agentId);
  if (cached) return cached;

  try {
    const res = await fetch(`/personas/${agentId}.md`);
    if (!res.ok) return "";
    const text = await res.text();
    cache.set(agentId, text);
    return text;
  } catch {
    return "";
  }
}

export function getPersonaSync(agentId: string): string {
  return cache.get(agentId) ?? "";
}

export async function preloadAll(agentIds: string[]): Promise<void> {
  await Promise.all(agentIds.map(loadPersona));
}

export function clearCache(): void {
  cache.clear();
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => cache.clear());
}
