import { ConventionsView } from "./_components/ConventionsView";

/* Route: /skills/conventions (Skills Lab). Thin route entry — repo-scoped via
   the global active-repo context, not a URL param (matches the Skills/Agents
   pages' pattern of not putting :repoId in the Skills Lab hrefs). */
export default function ConventionsPage() {
  return <ConventionsView />;
}
