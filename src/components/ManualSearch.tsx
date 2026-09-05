import { useEffect, useRef, useState } from "react";
import type { FoodItem } from "../types";

interface ManualSearchProps {
  onResolved: (item: FoodItem) => void;
  /** Pre-fills the search box, e.g. with raw OCR text handed off from the Upload Label tab. */
  initialQuery?: string;
}

const DEBOUNCE_MS = 350;
const MIN_QUERY_LENGTH = 2;

export default function ManualSearch({
  onResolved,
  initialQuery = "",
}: ManualSearchProps) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<FoodItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against a slower, older request overwriting results from a newer one.
  const latestRequestId = useRef(0);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      runSearch(trimmed);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function runSearch(q: string) {
    const requestId = ++latestRequestId.current;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/.netlify/functions/search-food?q=${encodeURIComponent(q)}`
      );
      const data = await res.json();

      if (requestId !== latestRequestId.current) return; // superseded by a newer query

      if (!res.ok) {
        setResults([]);
        setError("Search failed. Please try again.");
        return;
      }

      setResults((data.results ?? []) as FoodItem[]);
    } catch {
      if (requestId === latestRequestId.current) {
        setResults([]);
        setError("Search failed. Please try again.");
      }
    } finally {
      if (requestId === latestRequestId.current) setLoading(false);
    }
  }

  const showEmptyState =
    !loading && !error && query.trim().length >= MIN_QUERY_LENGTH && results.length === 0;

  return (
    <div className="manual-search-panel">
      <input
        type="text"
        className="search-input"
        placeholder='Search for a food (e.g. "greek yogurt")'
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {loading && <p className="scanner-status">Searching…</p>}
      {error && <div className="form-error">{error}</div>}
      {showEmptyState && (
        <p style={{ color: "var(--muted)", fontSize: 14 }}>
          No matches yet — try a different search.
        </p>
      )}

      {results.length > 0 && (
        <ul className="search-results">
          {results.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="search-result-item"
                onClick={() => onResolved(item)}
              >
                <span className="search-result-name">{item.name}</span>
                {item.brand && (
                  <span className="search-result-brand">{item.brand}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
