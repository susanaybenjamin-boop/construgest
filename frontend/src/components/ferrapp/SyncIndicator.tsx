"use client";

import { useFerrappStore, SyncStatus } from "@/stores/ferrappStore";

const STATUS_CONFIG: Record<SyncStatus, { color: string; label: string; animate?: boolean }> = {
  idle: { color: "bg-green-500", label: "Sincronizado" },
  syncing: { color: "bg-blue-500", label: "Sincronizando...", animate: true },
  error: { color: "bg-red-500", label: "Error de sync" },
  offline: { color: "bg-gray-500", label: "Sin conexion" },
};

export default function SyncIndicator() {
  const status = useFerrappStore((s) => s.syncStatus);
  const cfg = STATUS_CONFIG[status];

  return (
    <div className="flex items-center gap-1.5" title={cfg.label}>
      <span
        className={`w-2 h-2 rounded-full ${cfg.color} ${cfg.animate ? "animate-pulse" : ""}`}
      />
      <span className="text-[10px] text-gray-500 hidden sm:inline">{cfg.label}</span>
    </div>
  );
}
