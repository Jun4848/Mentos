import { useCallback, useEffect, useRef, useState } from "react";

export default function useDormitoryRoster() {
  const [state, setState] = useState({ data: null, loading: true, refreshing: false, error: "", accessDenied: false, receivedAt: 0 });
  const refreshRequest = useRef(null);
  const refresh = useCallback(() => refreshRequest.current?.(), []);

  useEffect(() => {
    let disposed = false;
    let currentRequest;

    async function loadRoster(manual = false) {
      currentRequest?.abort();
      const request = new AbortController();
      currentRequest = request;
      const timeout = window.setTimeout(() => request.abort(), 4000);
      if (manual) setState(previous => ({ ...previous, refreshing: true }));
      try {
        const response = await fetch("/api/admin/dormitory", { credentials: "include", cache: "no-store", signal: request.signal });
        const data = await response.json();
        if (!response.ok) throw Object.assign(new Error(data.message || "학생 목록을 불러올 수 없습니다."), { status: response.status });
        if (!Array.isArray(data.floors) || !data.summary || !data.serverTime) throw new Error("학생 목록 응답을 확인할 수 없습니다.");
        if (!disposed && currentRequest === request) {
          setState({ data, loading: false, refreshing: false, error: "", accessDenied: false, receivedAt: Date.now() });
        }
      } catch (error) {
        if (!disposed && currentRequest === request) {
          const accessDenied = error.status === 401 || error.status === 403;
          setState(previous => ({
            ...previous, data: accessDenied ? null : previous.data, loading: false, refreshing: false, accessDenied,
            error: request.signal.aborted ? "응답이 지연되고 있습니다. 잠시 후 다시 확인합니다."
              : error instanceof TypeError ? "서버에 연결할 수 없습니다. 연결을 확인해주세요." : error.message,
          }));
        }
      } finally { window.clearTimeout(timeout); }
    }

    function handleOffline() {
      currentRequest?.abort();
      currentRequest = undefined;
      setState(previous => ({ ...previous, loading: false, refreshing: false, error: "연결이 끊겨 마지막으로 불러온 정보를 표시하고 있습니다." }));
    }
    function reload() { if (navigator.onLine) void loadRoster(true); else handleOffline(); }
    function handleVisibility() { if (document.visibilityState === "visible") reload(); }
    refreshRequest.current = reload;
    void loadRoster();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) void loadRoster();
    }, 5000);
    window.addEventListener("focus", reload);
    window.addEventListener("online", reload);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      disposed = true;
      refreshRequest.current = null;
      currentRequest?.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", reload);
      window.removeEventListener("online", reload);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return { ...state, refresh };
}
