/* FindingsSeverityList — the compact, read-only rendering shared by every
   "findings of one severity" popover (PR list row badges, Timeline run
   icons): title + category tag, file:line + confidence, truncated
   rationale. Pure presentational — callers own fetching/loading/empty. */
"use client";

import React from "react";
import { Icon, MonoLink, ConfidenceNum, CategoryTag, SeverityBadge, type Category } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { lineLabel } from "../FindingCard/helpers";
import { truncate } from "./helpers";

export function FindingsSeverityList({
  findings,
  emptyLabel,
}: {
  findings: FindingRecord[];
  emptyLabel: string;
}) {
  if (findings.length === 0) {
    return <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{emptyLabel}</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 320, overflowY: "auto" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
        }}
      >
        <Icon.AlertOctagon size={13} />
        {findings.length} findings
      </div>
      {findings.map((f, i) => (
        <div
          key={f.id}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            paddingBottom: i === findings.length - 1 ? 0 : 10,
            borderBottom: i === findings.length - 1 ? "none" : "1px solid var(--border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <SeverityBadge severity={f.severity} compact />
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{f.title}</span>
            <CategoryTag category={f.category as Category} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <MonoLink>
              {f.file}:{lineLabel(f)}
            </MonoLink>
            <ConfidenceNum value={f.confidence} />
          </div>
          <p style={{ fontSize: 12.5, color: "var(--text-secondary)", margin: 0 }}>
            {truncate(f.rationale, 110)}
          </p>
        </div>
      ))}
    </div>
  );
}
