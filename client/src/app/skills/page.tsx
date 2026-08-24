import { SkillsListView } from "./_components/SkillsListView";

/* Route: /skills (Skills Lab). Thin route entry — the master-detail view, its
   drawer, cards, tabs, styles, constants and helpers are colocated under
   _components/. Selection lives in the URL (?skill=<id>&tab=<tab>), so there
   is deliberately no /skills/[id] route. */
export default function SkillsPage() {
  return <SkillsListView />;
}
