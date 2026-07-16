"use client";

import { useCallback, useEffect, useState } from "react";
import { CHECK_IDS } from "@/lib/checklistDefs";

const STORAGE_KEY = "seo-audit-selected-checks";

/**
 * Shared, localStorage-persisted set of which of the 35 checks are enabled.
 * Default: all checks selected. Used by CheckSelector (to edit) and the
 * detail page's Technical Audit tab (to filter what's displayed).
 *
 * Note: deselecting a check only hides it from the report; the backend
 * always computes all 35 checks in one audit_url() call (they're bundled
 * into a single page fetch, so skipping individual checks server-side
 * wouldn't meaningfully speed anything up). Selection is a display filter.
 */
export function useSelectedChecks() {
  const [selected, setSelected] = useState<Set<string>>(new Set(CHECK_IDS));
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const ids: string[] = JSON.parse(raw);
        setSelected(new Set(ids));
      }
    } catch {
      /* ignore, fall back to default (all selected) */
    }
    setHydrated(true);
  }, []);

  const persist = useCallback((next: Set<string>) => {
    setSelected(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = useCallback(
    (id: string) => {
      const next = new Set(selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      persist(next);
    },
    [selected, persist],
  );

  const setGroup = useCallback(
    (ids: string[], enabled: boolean) => {
      const next = new Set(selected);
      for (const id of ids) {
        if (enabled) next.add(id);
        else next.delete(id);
      }
      persist(next);
    },
    [selected, persist],
  );

  const selectAll = useCallback(() => persist(new Set(CHECK_IDS)), [persist]);
  const selectNone = useCallback(() => persist(new Set()), [persist]);

  return { selected, hydrated, toggle, setGroup, selectAll, selectNone };
}
