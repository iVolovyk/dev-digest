/* SkillsTab — one ordered list of every skill in the workspace, seen from this
   agent. The checkbox decides which ones reach the agent's prompt; the order of
   the list is the order of the blocks in it. Skills themselves are shared and
   edited in the Skills Lab; this tab only owns the agent⇄skill links. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Checkbox, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import {
  useAgentSkills,
  useSetAgentSkillsState,
  useSkills,
  useUpdateAgentSkill,
} from "@/lib/hooks/skills";
import {
  attachedTokens,
  buildSkillRows,
  filterRows,
  moveRow,
  reorderRows,
  sameOrder,
  toLinkState,
  type SkillRow,
} from "./helpers";
import { TYPE_COLORS } from "./constants";
import { s } from "./styles";

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const links = useAgentSkills(agent.id);
  const catalog = useSkills();
  const setState = useSetAgentSkillsState();
  const updateLink = useUpdateAgentSkill();

  const [query, setQuery] = React.useState("");
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [overId, setOverId] = React.useState<string | null>(null);

  const rows = buildSkillRows(links.data, catalog.data);
  const visible = filterRows(rows, query);
  const activeCount = rows.filter((r) => r.active).length;

  /** Persist a reordered list; a no-op reorder must not churn every link row. */
  const commitOrder = (next: SkillRow[]) => {
    if (sameOrder(next, rows)) return;
    setState.mutate({ agentId: agent.id, skills: toLinkState(next) });
  };

  /**
   * Checking a skill this agent has never had links it; unchecking KEEPS the
   * link and only switches it off. That is the point of the per-agent switch —
   * the position survives, so turning it back on reproduces the same prompt.
   */
  const setChecked = (row: SkillRow, on: boolean) => {
    if (row.link) {
      updateLink.mutate({ agentId: agent.id, skillId: row.skill.id, patch: { enabled: on } });
      return;
    }
    if (!on) return;
    setState.mutate({
      agentId: agent.id,
      skills: [...toLinkState(rows.filter((r) => r.skill.id !== row.skill.id)), {
        skill_id: row.skill.id,
        enabled: true,
      }],
    });
  };

  const endDrag = () => {
    setDragId(null);
    setOverId(null);
  };

  const drop = (targetId: string) => {
    if (!dragId) return;
    const next = reorderRows(rows, dragId, targetId);
    endDrag();
    commitOrder(next);
  };

  /** Keyboard path for reordering — dragging is mouse-only. */
  const onGripKey = (e: React.KeyboardEvent, skillId: string) => {
    const dir = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
    if (!dir) return;
    e.preventDefault();
    const index = rows.findIndex((r) => r.skill.id === skillId);
    commitOrder(moveRow(rows, index, dir as -1 | 1));
  };

  const isLoading = links.isLoading || catalog.isLoading;
  const isError = links.isError || catalog.isError;
  /** Reordering a filtered view would write an order the user cannot see. */
  const canDrag = rows.length > 1 && query.trim() === "";

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        {!isLoading && !isError && rows.length > 0 && (
          <span style={s.count}>
            {t("skills.enabledCount", { linked: activeCount, total: rows.length })}
          </span>
        )}
        {!isLoading && !isError && rows.length > 0 && (
          <div style={s.search}>
            <Icon.Search size={13} style={s.searchIcon} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("skills.filterPlaceholder")}
              aria-label={t("skills.filterPlaceholder")}
              style={s.searchInput}
            />
          </div>
        )}
      </div>

      {/* Order is the feature, not a side effect of the grips — say so. */}
      <p style={s.orderHint}>{t("skills.orderHint")}</p>

      {isError ? (
        <ErrorState
          title={t("skills.loadError")}
          onRetry={() => {
            void links.refetch();
            void catalog.refetch();
          }}
        />
      ) : isLoading ? (
        <div style={s.loading}>
          <Skeleton height={44} />
          <Skeleton height={44} />
          <Skeleton height={44} />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon="Sparkles" title={t("skills.empty")} body={t("skills.emptyBody")} />
      ) : visible.length === 0 ? (
        <div style={s.noMatch}>{t("skills.noMatch", { q: query })}</div>
      ) : (
        <>
          <div style={s.list}>
            {visible.map((row) => {
              const { skill } = row;
              const isOver = overId === skill.id && dragId !== skill.id;
              return (
                <div
                  key={skill.id}
                  data-testid={`skill-row-${skill.name}`}
                  draggable={canDrag}
                  onDragStart={canDrag ? () => setDragId(skill.id) : undefined}
                  onDragEnd={canDrag ? endDrag : undefined}
                  onDragOver={
                    canDrag
                      ? (e) => {
                          e.preventDefault();
                          setOverId(skill.id);
                        }
                      : undefined
                  }
                  onDrop={
                    canDrag
                      ? (e) => {
                          e.preventDefault();
                          drop(skill.id);
                        }
                      : undefined
                  }
                  style={{
                    ...s.row,
                    ...(row.active ? s.rowOn : s.rowOff),
                    ...(dragId === skill.id ? s.rowDragging : {}),
                    ...(isOver ? s.rowDropTarget : {}),
                  }}
                >
                  <button
                    type="button"
                    style={s.grip}
                    aria-label={t("skills.dragHint", { name: skill.name })}
                    title={t("skills.dragHint", { name: skill.name })}
                    disabled={!canDrag}
                    onKeyDown={(e) => onGripKey(e, skill.id)}
                  >
                    <Icon.Menu size={13} />
                  </button>

                  <Checkbox
                    checked={row.active}
                    onChange={(on) => setChecked(row, on)}
                    label={
                      <span
                        className="mono"
                        style={row.active ? s.name : { ...s.name, ...s.nameOff }}
                      >
                        {skill.name}
                      </span>
                    }
                  />

                  <div style={s.right}>
                    {/* Off in the Skills Lab ⇒ off for every agent; the row's
                        own checkbox cannot explain that on its own. */}
                    {!skill.enabled && (
                      <span title={t("skills.globallyDisabledTitle")}>
                        <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
                          {t("skills.globallyDisabled")}
                        </Badge>
                      </span>
                    )}
                    <a
                      href={`/skills?skill=${skill.id}`}
                      title={t("skills.openSkill")}
                      aria-label={t("skills.openSkill")}
                      style={s.openLink}
                    >
                      <Icon.ExternalLink size={13} />
                    </a>
                    <Badge color={TYPE_COLORS[skill.type]}>{skill.type}</Badge>
                  </div>
                </div>
              );
            })}
          </div>
          {/* Only the blocks that actually reach the prompt are counted. */}
          <div style={s.footer}>{t("skills.tokensAdded", { n: attachedTokens(rows) })}</div>
        </>
      )}
    </div>
  );
}
