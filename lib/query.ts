export function queryOf(params: Record<string, string | string[] | undefined>) {
  return Object.fromEntries(
    Object.entries(params).map(([name, value]) => [
      name,
      typeof value === 'string' ? value.slice(0, 500) : undefined,
    ])
  );
}
