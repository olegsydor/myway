/** Visual values only: no geometry, state resolution or persistence decisions. */
export const GRAPH_APPEARANCE = {
  text: '#273548',
  border: '#dbe3ec',
  emphasis: '#bd555e',
  endpoint: '#9b6d29',
  group: '#3f8069',
  groupShadow: '0 0 0 2px rgba(63, 128, 105, 0.18)',
  groupFill: 'rgba(63, 128, 105, 0.12)',
  edge: '#97a6b8',
  edgeMuted: '#bdc9d7',
  edgeWidth: 0.75,
  edgeEmphasisWidth: 2.5,
  markerSize: 14,
} as const;

export const NODE_APPEARANCE: Record<string, { surface: string; marker: string }> = {
  person: { surface: '#f0f5fe', marker: '#4e7dc2' },
  skill: { surface: '#edf7f1', marker: '#398263' },
  place: { surface: '#fcf6e9', marker: '#9b762c' },
  event: { surface: '#f5f0fc', marker: '#8460b1' },
  organization: { surface: '#f1f3f6', marker: '#596b80' },
  project: { surface: '#edf7fa', marker: '#367f94' },
  hobby: { surface: '#fcf4e9', marker: '#a1753c' },
  story: { surface: '#fcf0f5', marker: '#a7527b' },
};
export const FALLBACK_NODE_APPEARANCE = { surface: '#f1f3f6', marker: '#617184' };
