import { useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";

const timeFormatter = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export default function StudentMainGate({ children }) {
  const [access, setAccess] = useState({ loading: true, data: null, error: "" });
  const [tick, setTick] = useState(() => performance.now());
  const refreshRequest = useRef(null);

  useEffect(() => {
    let disposed = false;
    let currentRequest;

    async function loadSchedule() {
      currentRequest?.abort();
      const request = new AbortController();
      currentRequest = request;
      const startedAt = performance.now();
      const timeout = window.setTimeout(() => request.abort(), 4000);
      try {
        const response = await fetch("/api/attendance/schedule", { credentials: "include", cache: "no-store", signal: request.signal });
        const data = await response.json();
        if (!response.ok || typeof data.allowed !== "boolean" || !Array.isArray(data.periods) || !Number.isFinite(Date.parse(data.serverTime))) {
          throw new Error("출석 이용 시간을 확인할 수 없습니다.");
        }
        if (!disposed && currentRequest === request) {
          setAccess({ loading: false, data, error: "", startedAt });
          setTick(performance.now());
        }
      } catch {
        if (!disposed && currentRequest === request) setAccess({ loading: false, data: null, error: "서버에서 출석 이용 시간을 확인할 수 없습니다. 연결을 확인한 후 다시 시도해주세요." });
      } finally { window.clearTimeout(timeout); }
    }

    function offline() {
      currentRequest?.abort();
      currentRequest = undefined;
      setAccess({ loading: false, data: null, error: "연결이 끊겨 이용 시간을 확인할 수 없습니다. 연결 후 다시 시도해주세요." });
    }
    function refresh() {
      if (!navigator.onLine) return offline();
      setAccess({ loading: true, data: null, error: "" });
      void loadSchedule();
    }
    function visibility() { if (document.visibilityState === "visible") refresh(); }
    refreshRequest.current = refresh;
    refresh();
    const timer = window.setInterval(() => setTick(performance.now()), 1000);
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        if (navigator.onLine) void loadSchedule();
        else offline();
      }
    }, 15000);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", offline);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      disposed = true;
      refreshRequest.current = null;
      currentRequest?.abort();
      window.clearInterval(timer);
      window.clearInterval(poll);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", offline);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  if (access.loading || access.error) return <main className="min-h-dvh flex flex-col items-center justify-center gap-5 px-6 text-center text-emerald-950">
    <h1 className="text-xl font-semibold">출석 이용 시간 확인</h1>
    <p role={access.error ? "alert" : "status"}>{access.error || "출석 이용 시간을 확인하고 있습니다."}</p>
    <p className="text-sm text-gray-500">점심 12:30~14:00 · 저녁 18:00~19:30<br/>한국 시간 기준</p>
    {access.error && <button type="button" onClick={() => refreshRequest.current?.()} className="rounded-xl bg-emerald-700 px-5 py-3 text-white">다시 확인</button>}
    <a href="/" className="text-sm underline">로그인 화면으로</a>
  </main>;

  // 브라우저 시계를 바꿔도 서버가 알려준 시각을 기준으로 경계를 판단합니다.
  const elapsed = Math.max(0, tick - access.startedAt);
  const serverNow = Date.parse(access.data.serverTime) + elapsed;
  const time = timeFormatter.format(new Date(serverNow));
  const previewActive = access.data.previewEnabled === true && serverNow < Date.parse(access.data.previewExpiresAt);
  const active = access.data.periods.some(period => time >= period.start && time < period.end);
  if (!access.data.allowed || (!active && !previewActive)) return <Navigate to="/" replace/>;
  return children;
}
