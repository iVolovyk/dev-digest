"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { IntentPanel } from "./_components/IntentPanel";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null | undefined;
  prBody: string | null | undefined;
  prHeadSha: string | null | undefined;
}

export function OverviewTab({ prId, prBody, prHeadSha }: OverviewTabProps) {
  return (
    <>
      <IntentPanel prId={prId} prHeadSha={prHeadSha} />

      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
