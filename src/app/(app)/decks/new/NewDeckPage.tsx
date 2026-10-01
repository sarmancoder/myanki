"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import DeckForm from "@/components/forms/DeckForm";
import { MAX_DECK_DEPTH } from "@/lib/validation/deck";
import type { DeckOption } from "@/types/deck";

interface NewDeckPageProps {
  parentOptions: DeckOption[];
  preselectedParentId: string | null;
  preselectedParentName: string | null;
  exceedsMaxDepth: boolean;
  blockedParentName: string | null;
}

export default function NewDeckPage({
  parentOptions,
  preselectedParentId,
  preselectedParentName,
  exceedsMaxDepth,
  blockedParentName,
}: NewDeckPageProps) {
  const router = useRouter();

  function handleCreated(slug: string) {
    router.push(`/decks/${slug}`);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header className="space-y-1">
        <nav className="text-xs text-secondary">
          <Link href="/decks" className="hover:underline">
            Mis mazos
          </Link>
          <span className="mx-1">/</span>
          <span>Nuevo mazo</span>
        </nav>
        <h1 className="text-2xl font-bold text-primary sm:text-3xl">Nuevo mazo</h1>
        <p className="text-sm text-secondary">
          Los mazos se organizan en una jerarquía de hasta {MAX_DECK_DEPTH} niveles.
        </p>
      </header>

      {exceedsMaxDepth && (
        <div className="rounded-lg border border-yellow-500 bg-yellow-50 p-4 text-sm text-yellow-700">
          El mazo <strong>{blockedParentName}</strong> ya está en el nivel máximo de la jerarquía
          ({MAX_DECK_DEPTH} niveles). El nuevo mazo se creará en el nivel raíz.
        </div>
      )}

      <div className="rounded-lg border border-border bg-background p-6">
        <DeckForm
          mode="create"
          initialValues={{
            parentDeckId: preselectedParentId ?? "",
          }}
          parentOptions={parentOptions}
          onSuccess={(deck) => handleCreated(deck.slug)}
          onCancel={() => router.push("/decks")}
        />
      </div>

      {preselectedParentName && (
        <p className="text-xs text-secondary">
          Se creará como sub-mazo de <strong>{preselectedParentName}</strong>.
        </p>
      )}
    </div>
  );
}