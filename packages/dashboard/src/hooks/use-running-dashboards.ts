import { useState, useEffect, useCallback, useRef } from "react";

export interface RunningDashboard {
  port: number;
  cwd: string;
  projectName: string;
  uptime: number;
  isCurrent: boolean;
}

interface UseRunningDashboardsResult {
  dashboards: RunningDashboard[];
  loading: boolean;
  refresh: () => void;
}

const POLL_INTERVAL = 30_000;

export function useRunningDashboards(): UseRunningDashboardsResult {
  const [dashboards, setDashboards] = useState<RunningDashboard[]>([]);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboards");
      if (!res.ok) return;
      const data = (await res.json()) as { dashboards: RunningDashboard[] };
      setDashboards(data.dashboards);
    } catch {
      // Network error — keep cached value
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    intervalRef.current = setInterval(refresh, POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refresh]);

  return { dashboards, loading, refresh };
}
