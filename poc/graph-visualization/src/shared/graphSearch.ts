import type { GraphResponse } from "./types";

export type GraphSearchResult =
  | {
      kind: "node";
      id: number;
      title: string;
      detail: string;
      matchedIn: string[];
    }
  | {
      kind: "edge";
      id: number;
      source: number;
      target: number;
      title: string;
      detail: string;
      matchedIn: string[];
    };

function valueContainsSearch(
  value: unknown,
  normalizedQuery: string,
): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some((item) =>
      valueContainsSearch(item, normalizedQuery),
    );
  }

  if (typeof value === "object") {
    return Object.entries(value).some(
      ([key, nestedValue]) =>
        key.toLowerCase().includes(normalizedQuery) ||
        valueContainsSearch(nestedValue, normalizedQuery),
    );
  }

  return String(value).toLowerCase().includes(normalizedQuery);
}

function textContainsSearch(
  value: string | null,
  normalizedQuery: string,
): boolean {
  return value?.toLowerCase().includes(normalizedQuery) ?? false;
}

export function searchGraph(
  graph: GraphResponse,
  query: string,
): GraphSearchResult[] {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return [];
  }

  const normalizedQuery = trimmedQuery.toLowerCase();

  const nodeLabels = new Map(
    graph.nodes.map((node) => [node.id, node.label]),
  );

  const nodeResults: GraphSearchResult[] = graph.nodes
    .map((node) => {
      const matchedIn: string[] = [];

      if (String(node.id) === trimmedQuery) {
        matchedIn.push("ID");
      }

      if (textContainsSearch(node.label, normalizedQuery)) {
        matchedIn.push("name");
      }

      if (textContainsSearch(node.description, normalizedQuery)) {
        matchedIn.push("description");
      }

      if (textContainsSearch(node.type, normalizedQuery)) {
        matchedIn.push("type");
      }

      if (valueContainsSearch(node.attributes, normalizedQuery)) {
        matchedIn.push("properties");
      }

      if (matchedIn.length === 0) {
        return null;
      }

      return {
        kind: "node" as const,
        id: node.id,
        title: node.label,
        detail: `Node · ${node.type} · ID ${node.id}`,
        matchedIn,
      };
    })
    .filter((result): result is NonNullable<typeof result> => result !== null)
    .sort((left, right) => left.title.localeCompare(right.title));

  const edgeResults: GraphSearchResult[] = graph.edges
    .map((edge) => {
      const sourceLabel =
        nodeLabels.get(edge.source) ?? `Node ${edge.source}`;

      const targetLabel =
        nodeLabels.get(edge.target) ?? `Node ${edge.target}`;

      const matchedIn: string[] = [];

      if (String(edge.id) === trimmedQuery) {
        matchedIn.push("ID");
      }

      if (
        textContainsSearch(sourceLabel, normalizedQuery) ||
        textContainsSearch(targetLabel, normalizedQuery)
      ) {
        matchedIn.push("endpoint");
      }

      if (textContainsSearch(edge.description, normalizedQuery)) {
        matchedIn.push("description");
      }

      if (textContainsSearch(edge.type, normalizedQuery)) {
        matchedIn.push("type");
      }

      if (valueContainsSearch(edge.attributes, normalizedQuery)) {
        matchedIn.push("properties");
      }

      if (matchedIn.length === 0) {
        return null;
      }

      return {
        kind: "edge" as const,
        id: edge.id,
        source: edge.source,
        target: edge.target,
        title: `${sourceLabel} → ${targetLabel}`,
        detail: `Edge · ${edge.type} · ID ${edge.id}`,
        matchedIn,
      };
    })
    .filter((result): result is NonNullable<typeof result> => result !== null)
    .sort((left, right) => left.title.localeCompare(right.title));

  return [...nodeResults, ...edgeResults];
}
