import type { DeckAggregateView, DeckNode, DeckStatsView, DeckSummary } from "@/types/deck";

export interface DeckRecordLike {
  id: string;
  parentDeckId: string | null;
  name: string;
  slug: string;
  description: string | null;
  languageCode: string;
  isArchived: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  lastStudiedAt: Date | string | null;
}

export const EMPTY_STATS: DeckStatsView = {
  total: 0,
  new: 0,
  learning: 0,
  review: 0,
  dueToday: 0,
};

function toIso(value: Date | string | null): string | null {
  if (value === null) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function sumStats(a: DeckStatsView, b: DeckStatsView): DeckStatsView {
  return {
    total: a.total + b.total,
    new: a.new + b.new,
    learning: a.learning + b.learning,
    review: a.review + b.review,
    dueToday: a.dueToday + b.dueToday,
  };
}

/**
 * Calcula la profundidad (1 = raíz) de cada mazo a partir del historial plano.
 * Los mazos huérfanos (padre inexistente) se tratan como raíz.
 */
export function computeDeckDepths(records: DeckRecordLike[]): Map<string, number> {
  const byId = new Map(records.map((record) => [record.id, record]));
  const depths = new Map<string, number>();

  function resolveDepth(id: string, visited: Set<string>): number {
    const cached = depths.get(id);
    if (cached !== undefined) {
      return cached;
    }

    if (visited.has(id)) {
      return 1;
    }

    const record = byId.get(id);

    if (!record || !record.parentDeckId || !byId.has(record.parentDeckId)) {
      depths.set(id, 1);
      return 1;
    }

    visited.add(id);
    const depth = resolveDepth(record.parentDeckId, visited) + 1;
    visited.delete(id);
    depths.set(id, depth);

    return depth;
  }

  for (const record of records) {
    resolveDepth(record.id, new Set());
  }

  return depths;
}

/** Devuelve el id del mazo y todos sus descendientes. */
export function collectDeckBranchIds(
  records: DeckRecordLike[],
  deckId: string
): Set<string> {
  const childrenByParent = new Map<string, string[]>();

  for (const record of records) {
    if (!record.parentDeckId) {
      continue;
    }

    const siblings = childrenByParent.get(record.parentDeckId) ?? [];
    siblings.push(record.id);
    childrenByParent.set(record.parentDeckId, siblings);
  }

  const branch = new Set<string>([deckId]);
  const queue = [deckId];

  while (queue.length > 0) {
    const current = queue.pop() as string;

    for (const childId of childrenByParent.get(current) ?? []) {
      if (branch.has(childId)) {
        continue;
      }

      branch.add(childId);
      queue.push(childId);
    }
  }

  return branch;
}

function buildAggregate(node: DeckNode): DeckAggregateView {
  let aggregate = { ...node.stats };

  for (const child of node.children) {
    const childAggregate = buildAggregate(child);
    aggregate = sumStats(aggregate, childAggregate);
  }

  node.aggregate = {
    ...aggregate,
    subdeckCount: node.children.length,
  };

  return node.aggregate;
}

/** Construye el árbol de mazos a partir del historial plano y sus estadísticas. */
export function buildDeckTree(
  records: DeckRecordLike[],
  statsByDeckId: Map<string, DeckStatsView>
): DeckNode[] {
  const depths = computeDeckDepths(records);
  const nodesById = new Map<string, DeckNode>();

  for (const record of records) {
    nodesById.set(record.id, {
      id: record.id,
      parentDeckId: record.parentDeckId,
      name: record.name,
      slug: record.slug,
      description: record.description,
      languageCode: record.languageCode,
      isArchived: record.isArchived,
      createdAt: toIso(record.createdAt) as string,
      updatedAt: toIso(record.updatedAt) as string,
      lastStudiedAt: toIso(record.lastStudiedAt),
      depth: depths.get(record.id) ?? 1,
      isMatch: true,
      stats: statsByDeckId.get(record.id) ?? EMPTY_STATS,
      aggregate: { ...EMPTY_STATS, subdeckCount: 0 },
      children: [],
    });
  }

  const roots: DeckNode[] = [];

  for (const record of records) {
    const node = nodesById.get(record.id) as DeckNode;
    const parent = record.parentDeckId ? nodesById.get(record.parentDeckId) : undefined;

    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  for (const root of roots) {
    buildAggregate(root);
  }

  return roots;
}

export interface DeckTreeFilters {
  search: string | null;
  language: string | null;
  includeArchived: boolean;
}

/**
 * Filtra el árbol por idioma, búsqueda y archivado. Cuando hay búsqueda, se
 * conservan también los ancestros de las coincidencias para no perder el
 * contexto jerárquico (marcados con `isMatch: false`).
 */
export function filterDeckTree(
  nodes: DeckNode[],
  filters: DeckTreeFilters
): DeckNode[] {
  const normalizedSearch = filters.search ? filters.search.toLowerCase() : null;

  function matchesSelf(node: DeckNode): boolean {
    if (filters.includeArchived === false && node.isArchived) {
      return false;
    }

    if (filters.language && node.languageCode !== filters.language) {
      return false;
    }

    if (normalizedSearch && !node.name.toLowerCase().includes(normalizedSearch)) {
      return false;
    }

    return true;
  }

  function walk(nodesToWalk: DeckNode[]): DeckNode[] {
    const result: DeckNode[] = [];

    for (const node of nodesToWalk) {
      const isMatch = matchesSelf(node);
      const children = walk(node.children);

      if (!isMatch && children.length === 0) {
        continue;
      }

      result.push({ ...node, isMatch, children });
    }

    return result;
  }

  return walk(nodes);
}

export function sortDeckTree(
  nodes: DeckNode[],
  sort: "name" | "createdAt" | "cards",
  order: "asc" | "desc"
): DeckNode[] {
  const direction = order === "asc" ? 1 : -1;

  function compare(a: DeckNode, b: DeckNode): number {
    let result = 0;

    if (sort === "name") {
      result = a.name.localeCompare(b.name, "es", { sensitivity: "base" });
    } else if (sort === "createdAt") {
      result = a.createdAt.localeCompare(b.createdAt);
    } else {
      result = a.aggregate.total - b.aggregate.total;
    }

    return result * direction || a.name.localeCompare(b.name, "es");
  }

  return [...nodes]
    .sort(compare)
    .map((node) => ({ ...node, children: sortDeckTree(node.children, sort, order) }));
}

export function flattenDeckTree(nodes: DeckNode[]): DeckNode[] {
  return nodes.flatMap((node) => [node, ...flattenDeckTree(node.children)]);
}

export function toDeckSummary(node: DeckNode): DeckSummary {
  return {
    id: node.id,
    parentDeckId: node.parentDeckId,
    name: node.name,
    slug: node.slug,
    description: node.description,
    languageCode: node.languageCode,
    isArchived: node.isArchived,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    lastStudiedAt: node.lastStudiedAt,
    depth: node.depth,
    stats: node.stats,
    aggregate: node.aggregate,
  };
}

export { sumStats };