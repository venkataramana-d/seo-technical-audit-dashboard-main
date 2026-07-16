"use client";

import { useState } from "react";
import { Card, HelpSection } from "@/components/ui";
import { CHECK_IDS, GROUP_HELP, GROUP_LABELS, checksByGroup } from "@/lib/checklistDefs";
import { useSelectedChecks } from "@/lib/useSelectedChecks";

/**
 * Collapsible panel letting users pick which of the 35 checks to include in
 * the Technical Audit report, mirrors the reference tool's use-case
 * check-selection UI. Everything is selected by default.
 */
export function CheckSelector() {
  const [open, setOpen] = useState(false);
  const { selected, hydrated, toggle, setGroup, selectAll, selectNone } = useSelectedChecks();
  const groups = checksByGroup();
  const count = selected.size;

  if (!hydrated) return null;

  return (
    <Card className="mb-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-sm font-semibold text-[var(--seo-subheading)]">
          Customize checks ({count}/{CHECK_IDS.length} selected)
        </span>
        <span className={`text-[var(--seo-muted)] transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
      </button>

      {open ? (
        <div className="mt-3 flex flex-col gap-4">
          <div className="flex gap-3 text-xs">
            <button type="button" onClick={selectAll} className="font-medium text-[var(--seo-accent)] hover:underline">
              Select all
            </button>
            <button type="button" onClick={selectNone} className="font-medium text-[var(--seo-accent)] hover:underline">
              Select none
            </button>
          </div>

          {(["crawlability", "on_page", "site_health"] as const).map((group) => {
            const items = groups[group];
            const groupSelectedCount = items.filter((c) => selected.has(c.id)).length;
            const allOn = groupSelectedCount === items.length;
            return (
              <div key={group}>
                <div className="mb-1.5 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={allOn}
                    ref={(el) => {
                      if (el) el.indeterminate = groupSelectedCount > 0 && !allOn;
                    }}
                    onChange={(e) => setGroup(items.map((c) => c.id), e.target.checked)}
                  />
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--seo-muted)]">
                    {GROUP_LABELS[group]} ({groupSelectedCount}/{items.length})
                  </span>
                </div>
                <HelpSection>{GROUP_HELP[group]}</HelpSection>
                <div className="mt-1.5 grid grid-cols-1 gap-1 pl-1 sm:grid-cols-2">
                  {items.map((c) => (
                    <label
                      key={c.id}
                      title={c.description}
                      className="flex items-center gap-2 rounded px-1.5 py-1 text-sm text-[var(--seo-text)] hover:bg-[var(--seo-card-hover)]"
                    >
                      <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                      {c.label}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}

          <p className="text-xs text-[var(--seo-muted)]">
            Deselected checks are hidden from the Technical Audit report. Every check still runs during
            the audit itself (they&rsquo;re computed together in one page fetch, so skipping some wouldn&rsquo;t
            speed anything up).
          </p>
        </div>
      ) : null}
    </Card>
  );
}
