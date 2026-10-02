import { MAX_DECK_DEPTH } from "@/lib/validation/deck";
import { serverClient } from "@/server/client";
import NewDeckPage from "./NewDeckPage";

interface NewDeckPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function NewDeck({ searchParams }: NewDeckPageProps) {
  const params = await searchParams;
  const rawParent = Array.isArray(params.parent) ? params.parent[0] : params.parent;
  const requestedParentId = rawParent && rawParent.trim().length > 0 ? rawParent.trim() : null;

  const { options } = await serverClient.decks.options({});
  const { languages } = await serverClient.languages.list({});
  const requestedParent = requestedParentId
    ? options.find((option) => option.id === requestedParentId)
    : undefined;

  const exceedsMaxDepth = Boolean(requestedParent && requestedParent.depth >= MAX_DECK_DEPTH);
  const preselectedParentId = exceedsMaxDepth ? null : (requestedParent?.id ?? null);

  return (
    <NewDeckPage
      parentOptions={options.filter((option) => option.id !== requestedParentId)}
      languages={languages}
      preselectedParentId={preselectedParentId}
      preselectedParentName={preselectedParentId ? (requestedParent?.name ?? null) : null}
      exceedsMaxDepth={exceedsMaxDepth}
      blockedParentName={exceedsMaxDepth ? (requestedParent?.name ?? null) : null}
    />
  );
}