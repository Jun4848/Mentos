import { useCallback, useEffect, useRef, useState } from "react";

const checkingNetwork = { allowed: false, checking: true, updating: false, previewAvailable: false, previewEnabled: false, error: "", message: "와이파이 연결을 확인하고 있습니다." };

export default function useAttendanceNetwork() {
  const [network, setNetwork] = useState(checkingNetwork);
  const refreshRequest = useRef(null);
  const previewRequest = useRef(null);
  const refreshNetwork = useCallback(() => refreshRequest.current?.(), []);
  const setNetworkPreview = useCallback(allowed => previewRequest.current?.(allowed), []);

  useEffect(() => {
    let disposed = false;
    let currentRequest;
    let changing = false;

    async function checkNetwork(allowed) {
      if (changing) return;
      const mutation = typeof allowed === "boolean" || allowed === null;
      if (mutation) {
        changing = true;
        setNetwork(previous => ({ ...previous, updating: true, error: "" }));
      }
      currentRequest?.abort();
      const request = new AbortController();
      currentRequest = request;
      const timeout = window.setTimeout(() => request.abort(), 4000);

      try {
        const response = await fetch(mutation ? "/api/attendance/network/preview" : "/api/attendance/network", {
          method: mutation ? "PATCH" : "GET",
          credentials: "include",
          cache: "no-store",
          signal: request.signal,
          ...(mutation ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ allowed }) } : {}),
        });
        const data = await response.json();

        if (!disposed && currentRequest === request) {
          if (!response.ok) {
            throw new Error(data?.message || "네트워크 상태를 확인할 수 없습니다.");
          }
          if (typeof data?.allowed !== "boolean") throw new Error("Invalid network response");
          setNetwork({ allowed: data.allowed, checking: false, updating: false, message: data.message,
            previewAvailable: data.previewAvailable === true, previewEnabled: data.previewEnabled === true, error: "" });
        }
      } catch (error) {
        if (!disposed && currentRequest === request) {
          const message = request.signal.aborted
            ? "네트워크 확인 시간이 초과되었습니다. 잠시 후 다시 확인합니다."
            : error instanceof TypeError ? "네트워크 상태를 확인할 수 없습니다. 서버 연결을 확인해주세요." : error.message;
          setNetwork(previous => ({
            ...previous,
            allowed: false,
            checking: false,
            updating: false,
            message,
            error: mutation ? message : previous.error,
          }));
        }
      } finally {
        window.clearTimeout(timeout);
        if (mutation) changing = false;
      }
    }

    function handleOffline() {
      currentRequest?.abort();
      currentRequest = undefined;
      setNetwork(previous => ({ ...previous, allowed: false, checking: false, updating: false, message: "네트워크 연결이 끊겼습니다. 와이파이를 확인해주세요." }));
    }

    function refresh() {
      if (changing) return;
      if (!navigator.onLine) return handleOffline();
      setNetwork(previous => ({ ...previous, allowed: false, checking: true, message: checkingNetwork.message }));
      void checkNetwork();
    }

    function handleVisibility() {
      if (document.visibilityState === "visible") refresh();
    }

    refreshRequest.current = refresh;
    previewRequest.current = allowed => {
      if (!navigator.onLine) return handleOffline();
      void checkNetwork(allowed);
    };
    refresh();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        if (navigator.onLine) void checkNetwork();
        else handleOffline();
      }
    }, 5000);
    const connection = navigator.connection;
    connection?.addEventListener("change", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      disposed = true;
      refreshRequest.current = null;
      previewRequest.current = null;
      currentRequest?.abort();
      window.clearInterval(interval);
      connection?.removeEventListener("change", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return { ...network, refreshNetwork, setNetworkPreview };
}
