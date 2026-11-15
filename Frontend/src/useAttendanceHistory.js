import { useEffect, useState } from "react";

export default function useAttendanceHistory(date) {
  const [state, setState] = useState({ requestDate: null, data: null, loading: true, error: "" });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let disposed = false;
    let currentRequest;
    let pending = false;
    async function load() {
      if (pending) return;
      if (!navigator.onLine) { offline(); return; }
      pending = true;
      const request = new AbortController();
      currentRequest = request;
      const timeout = window.setTimeout(() => request.abort(), 15000);
      try {
        const response = await fetch(`/api/admin/attendance-history${date ? `?date=${encodeURIComponent(date)}` : ""}`, {
          credentials: "include", cache: "no-store", signal: request.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "출석 기록을 불러올 수 없습니다.");
        if (!Array.isArray(data.records) || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) throw new Error("출석 기록 응답을 확인해주세요.");
        if (!disposed) setState({ requestDate: date, data, loading: false, error: "" });
      } catch (error) {
        if (!disposed) setState({ requestDate: date, data: null, loading: false, error: request.signal.aborted ? "응답이 지연되고 있습니다. 다시 시도해주세요." : error instanceof TypeError || error instanceof SyntaxError ? "서버 연결을 확인한 후 다시 시도해주세요." : error.message });
      } finally { window.clearTimeout(timeout); pending = false; }
    }
    function offline() {
      currentRequest?.abort();
      setState({ requestDate: date, data: null, loading: false, error: "연결이 끊겼습니다. 인터넷 연결 후 다시 시도해주세요." });
    }
    function refresh() { if (document.visibilityState === "visible") void load(); }
    void load();
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      disposed = true;
      currentRequest?.abort();
      window.clearInterval(timer);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [date, version]);

  const visible = state.requestDate === date ? state : { data: null, loading: true, error: "" };
  return { ...visible, refresh: () => setVersion(value => value + 1) };
}
