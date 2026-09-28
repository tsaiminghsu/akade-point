"use client";

import { useCallback, useEffect, useState } from "react";

import type { VehicleFileKind, VehicleFileView } from "@/lib/control-center/vehicles/files";

const PAGE = 60;

/**
 * One kind of a vehicle's cloud files, newest first, with paging. `storage`
 * is null when the server has no file storage configured.
 */
export function useCloudFiles(vehicleId: string, kind: VehicleFileKind, limit = PAGE) {
  const [files, setFiles] = useState<VehicleFileView[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [storage, setStorage] = useState<"s3" | "local" | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const fetchPage = useCallback(
    async (before?: string) => {
      setLoading(true);
      setError(false);
      const q = new URLSearchParams({ kind, limit: String(limit), ...(before && { before }) });
      const res = await fetch(`/api/control-center/vehicles/${vehicleId}/files?${q}`).catch(() => null);
      setLoading(false);
      if (!res?.ok) {
        setError(true);
        return;
      }
      const body = (await res.json()) as { files: VehicleFileView[]; nextBefore: string | null; storage: "s3" | "local" | null };
      setStorage(body.storage);
      setNext(body.nextBefore);
      setFiles((prev) => (before ? [...prev, ...body.files.filter((f) => !prev.some((p) => p.fileId === f.fileId))] : body.files));
    },
    [vehicleId, kind, limit]
  );

  useEffect(() => {
    void fetchPage();
  }, [fetchPage]);

  const remove = useCallback(
    async (fileId: string) => {
      const res = await fetch(`/api/control-center/vehicles/${vehicleId}/files/${fileId}`, { method: "DELETE" }).catch(() => null);
      if (res?.ok) setFiles((prev) => prev.filter((f) => f.fileId !== fileId));
      return !!res?.ok;
    },
    [vehicleId]
  );

  return {
    files,
    storage,
    loading,
    error,
    more: next !== null,
    reload: () => fetchPage(),
    loadMore: () => (next ? fetchPage(next) : Promise.resolve()),
    remove,
  };
}
