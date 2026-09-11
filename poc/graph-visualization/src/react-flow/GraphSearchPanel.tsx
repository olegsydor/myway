import { useMemo, useState } from "react";

import {
  searchGraph,
  type GraphSearchResult,
} from "../shared/graphSearch";

import type { GraphResponse } from "../shared/types";

interface GraphSearchPanelProps {
  graph: GraphResponse;
  onSelect: (result: GraphSearchResult) => void;
}

export function GraphSearchPanel({
  graph,
  onSelect,
}: GraphSearchPanelProps) {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");

  const results = useMemo(
    () => searchGraph(graph, submittedQuery),
    [graph, submittedQuery],
  );

  const hasSearched = submittedQuery.length > 0;

  function handleSearch() {
    setSubmittedQuery(query.trim());
  }

  return (
    <div className="react-flow-control-group graph-search">
      <label htmlFor="react-flow-graph-search">Search graph</label>

      <input
        id="react-flow-graph-search"
        type="search"
        value={query}
        placeholder="Node, Edge, or Property"
        onChange={(event) => {
          const nextQuery = event.target.value;

          setQuery(nextQuery);

          if (!nextQuery.trim()) {
            setSubmittedQuery("");
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            handleSearch();
          }
        }}
      />

      <button type="button" onClick={handleSearch}>
        Search
      </button>

      {hasSearched && (
        <div className="graph-search__results">
          <div className="graph-search__summary">
            {results.length === 0
              ? "No matching elements"
              : `${results.length} result${results.length === 1 ? "" : "s"}`}
          </div>

          {results.map((result) => (
            <button
              key={`${result.kind}-${result.id}`}
              type="button"
              className="graph-search__result"
              onClick={() => {
                onSelect(result);
              }}
            >
              <strong>{result.title}</strong>

              <span>{result.detail}</span>

              <span>
                Matched in: {result.matchedIn.join(", ")}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
