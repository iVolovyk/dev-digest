"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { IntentPanel } from "./_components/IntentPanel";
import { BlastRadiusPanel } from "./_components/BlastRadiusPanel";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null | undefined;
  prBody: string | null | undefined;
  prHeadSha: string | null | undefined;
  repoId: string;
  repoFullName: string | null;
}

export function OverviewTab({
  prId,
  prBody,
  prHeadSha,
  repoId,
  repoFullName,
}: OverviewTabProps) {
  return (
    <>
      <div style={s.panelGrid}>
        <IntentPanel prId={prId} prHeadSha={prHeadSha} />

        <BlastRadiusPanel
          prId={prId}
          repoId={repoId}
          repoFullName={repoFullName}
          prHeadSha={prHeadSha}
        />
      </div>

      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
