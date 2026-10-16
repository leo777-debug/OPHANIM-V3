export function shodanQuery(value: string): string | null {
  const prefixed = value.trim().match(/^shodan\s*[: ]\s*(.+)$/i);
  if (prefixed) return prefixed[1];
  return /\b(?:port|org|country|product|os|hostname|net):\S+/i.test(value) ? value.trim() : null;
}
