import { useSearchResultNavigation } from "./useSearchResultNavigation.ts";
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

  const [open, setOpen] = useState(false);
  const { input: searchInput, buttons: resultButtons, inputKey, resultKey } = useSearchResultNavigation({ open, count: results.length,
    onOpen: () => setOpen(true), onClose: () => setOpen(false) });

  const hasSearched = submittedQuery.length > 0;

  function handleSearch() {
    setSubmittedQuery(query.trim());
    setOpen(Boolean(query.trim()));
  }

  return (
    <div className="react-flow-control-group graph-search">
      <label htmlFor="react-flow-graph-search">Search graph</label>

      <input
        ref={searchInput}
        id="react-flow-graph-search"
        type="search"
        value={query}
        placeholder="Node, Edge, or Property"
        onChange={(event) => {
          const nextQuery = event.target.value;

          setQuery(nextQuery);

          if (!nextQuery.trim()) {
            setSubmittedQuery("");
            setOpen(false);
          }
        }}
        onKeyDown={(event) => {
          inputKey(event);
          if (event.key === "Enter" && !event.nativeEvent.isComposing) {
            event.preventDefault();
            handleSearch();
          }
        }}
      />

      <button type="button" onClick={handleSearch}>
        Search
      </button>

      {hasSearched && open && (
        <div className="graph-search__results">
          <div className="graph-search__summary">
            {results.length === 0
              ? "No matching elements"
              : `${results.length} result${results.length === 1 ? "" : "s"}`}
          </div>

          {results.map((result, index) => (
            <button
              key={`${result.kind}-${result.id}`}
              ref={element => { resultButtons.current[index] = element; }}
              onKeyDown={event => resultKey(event, index)}
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
