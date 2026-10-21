export function suggestDatasetName(
  proposed: string,
  existingNames: readonly string[]
) {
  const base = proposed.trim().slice(0, 100).trimEnd() || "Береговая линия";
  const normalize = (value: string) =>
    value.trim().normalize("NFC").toLocaleLowerCase("ru-RU");
  const occupied = new Set(existingNames.map(normalize));
  let candidate = base;
  let index = 2;
  while (occupied.has(normalize(candidate))) {
    const suffix = ` (${index})`;
    candidate = base.slice(0, 100 - suffix.length).trimEnd() + suffix;
    index += 1;
  }
  return candidate;
}
