"use client";

import { useState } from "react";
import { exportDeckAction } from "@/server/actions";
import { getErrorMessage, isError } from "@/lib/orpc";
import { downloadFile } from "@/lib/download";

interface ExportDeckButtonsProps {
  deckId: string;
}

export default function ExportDeckButtons({ deckId }: ExportDeckButtonsProps) {
  const [isLoading, setIsLoading] = useState<"json" | "csv" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleExport(format: "json" | "csv") {
    setIsLoading(format);
    setError(null);

    const result = await exportDeckAction({ id: deckId, format });

    setIsLoading(null);

    if (isError(result)) {
      setError(getErrorMessage(result[1].message, "No se pudo exportar el mazo"));
      return;
    }

    downloadFile(result[0].fileName, result[0].mimeType, result[0].content);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-secondary-foreground">Exportar:</span>
        <button
          type="button"
          onClick={() => handleExport("json")}
          disabled={isLoading !== null}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-secondary disabled:opacity-50"
        >
          {isLoading === "json" ? "Generando..." : "JSON"}
        </button>
        <button
          type="button"
          onClick={() => handleExport("csv")}
          disabled={isLoading !== null}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-secondary disabled:opacity-50"
        >
          {isLoading === "csv" ? "Generando..." : "CSV"}
        </button>
      </div>

      {error && (
        <p className="text-xs font-medium text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}