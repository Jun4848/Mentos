import { useEffect, useRef, useState } from "react";
import "./AttendanceTimeToggle.css";

export default function AttendanceTimeToggle({ onPendingChange }) {
  const [state, setState] = useState({ available: true, enabled: false, checking: true, updating: false, error: "" });
  const changeRequest = useRef(null);

  useEffect(() => {
    let disposed = false;
    let currentRequest;
    let changing = false;

    async function requestState(enabled) {
      const mutation = typeof enabled === "boolean";
      if (changing) return;
      currentRequest?.abort();
      const request = new AbortController();
      currentRequest = request;
      const timeout = window.setTimeout(() => request.abort(), 4000);
      if (mutation) {
        changing = true;
        onPendingChange(true);
        setState(previous => ({ ...previous, updating: true, error: "" }));
      }
      try {
        const response = await fetch(mutation ? "/api/attendance/preview" : "/api/attendance/schedule", {
          method: mutation ? "PATCH" : "GET", credentials: "include", cache: "no-store", signal: request.signal,
          ...(mutation ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) } : {}),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "입장 설정을 변경할 수 없습니다.");
        if (typeof data.previewAvailable !== "boolean" || typeof data.previewEnabled !== "boolean") throw new Error("입장 설정을 확인할 수 없습니다.");
        if (!disposed && currentRequest === request) setState({ available: data.previewAvailable, enabled: data.previewEnabled, checking: false, updating: false, error: "" });
      } catch (error) {
        if (!disposed && currentRequest === request) setState(previous => ({ ...previous, checking: false, updating: false, error: error instanceof TypeError || request.signal.aborted ? "서버 연결을 확인해주세요." : error.message }));
      } finally {
        window.clearTimeout(timeout);
        if (mutation) {
          changing = false;
          if (!disposed) onPendingChange(false);
        }
      }
    }

    function refresh() { if (navigator.onLine) void requestState(); }
    function visibility() { if (document.visibilityState === "visible") refresh(); }
    changeRequest.current = enabled => void requestState(enabled);
    void requestState();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 15000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      disposed = true;
      changeRequest.current = null;
      currentRequest?.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [onPendingChange]);

  if (!state.available) return null;
  return <aside className={`login-time-toggle ${state.enabled ? "is-enabled" : ""}`} aria-label="시간 외 입장 설정">
    <button type="button" role="switch" aria-checked={state.enabled} aria-label="시간 외 입장" aria-describedby="login-time-toggle-description"
      disabled={state.checking || state.updating || Boolean(state.error)} onClick={() => changeRequest.current?.(!state.enabled)}>
      <span className="login-time-toggle-label">시간 외 입장</span>
      <span className="login-time-toggle-track" aria-hidden="true"><i/></span>
    </button>
    <p id="login-time-toggle-description" aria-live="polite">{state.updating ? "적용 중…" : state.checking ? "설정 확인 중…" : state.enabled ? "최대 1시간 · 입장만 허용" : "이 브라우저에만 적용"}</p>
    {state.error && <div className="login-time-toggle-error" role="alert"><span>{state.error}</span><button type="button" onClick={() => changeRequest.current?.()}>다시 확인</button></div>}
  </aside>;
}
