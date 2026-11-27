/** Keep the graph filter limited to used types, in the API dictionary order. */
export function graphTypeOptions(
  records: readonly { type: string }[],
  dictionary: readonly { code: string }[],
): string[] {
  const remaining = new Set(records.map((record) => record.type));
  const ordered = dictionary
    .map((entry) => entry.code)
    .filter((code) => remaining.delete(code));
  return [...ordered, ...Array.from(remaining).sort()];
}
