import MainPageNav from "./MainPageNav";
import { useEffect, useRef, useState } from "react";
import AddenCheck from "./AddenCheck";
import useAttendanceNetwork from "./useAttendanceNetwork";
import MainPageIcon from "./MainPageIcon";
import "./MainPage.css";
import wifi_disconnected from "./wifi_disconnected.png"
import wifi_connected from "./wifi_connected.png"

const residenceStates = new Map([
    ["외출", { state: "outing", label: "외출 중", ending: "중이에요.", icon: "logout" }],
    ["외박", { state: "overnight", label: "외박 중", ending: "중이에요.", icon: "clock" }],
    ["귀가", { state: "home", label: "귀가 상태", ending: "상태예요.", icon: "home" }],
]);

const MainPage = ({Name, Rn, Stat, IsChecked, setMainId, setMainName, setMainRole, setRn, setStat, setIsChecked}) => {

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [checkError, setCheckError] = useState("");
    const checkRequest = useRef(null);
    const { allowed: Wcheck, checking: isCheckingNetwork, updating: isUpdatingNetwork, message: networkMessage,
        previewAvailable, previewEnabled, error: networkError, refreshNetwork, setNetworkPreview } = useAttendanceNetwork();
    const residenceState = residenceStates.get(Stat);
    const showChecked = IsChecked && !residenceState;
    const canCheck = Wcheck && !isUpdatingNetwork && Stat === "잔류" && IsChecked === false;
    const networkLabel = isCheckingNetwork ? "와이파이 연결 확인 중" : Wcheck ? "와이파이 연결됨" : "와이파이 연결 안 됨";
    const attendanceMessage = residenceState ? `${Stat} 상태에서는 출석체크를 할 수 없어요.`
        : !Wcheck ? networkMessage
        : IsChecked ? "체크를 완료하였습니다!"
        : Stat !== "잔류" ? "잔류 상태에서만 출석체크할 수 있습니다."
        : "아직 출석체크를 하지 않았습니다!";
    const buttonLabel = residenceState ? residenceState.label
        : isSubmitting ? "저장 중..."
        : showChecked ? "체크완료"
        : !Wcheck ? isCheckingNetwork ? "와이파이 확인 중..." : "와이파이 연결 필요"
        : canCheck ? "출석체크" : "출석체크 불가";
    const dateLabel = new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "long",
    }).format(new Date());
    const heroState = residenceState?.state || (showChecked ? "complete" : canCheck ? "ready" : "waiting");
    const badgeLabel = residenceState?.label || (showChecked ? "체크완료" : canCheck ? "체크 가능" : "체크 대기");
    const heroIcon = residenceState?.icon || (showChecked ? "check" : "shield");

    useEffect(() => () => checkRequest.current?.abort(), []);

    async function handleCheck() {
        if (!canCheck || checkRequest.current) return;
        const request = new AbortController();
        checkRequest.current = request;
        setIsSubmitting(true);
        setCheckError("");
        try {
            const data = await AddenCheck(request.signal);
            if (!request.signal.aborted) {
                setIsChecked(data.isChecked);
                setStat(data.status);
            }
        } catch (error) {
            if (request.signal.aborted) return;
            refreshNetwork();
            setCheckError(error instanceof TypeError ? "서버에 연결할 수 없습니다. 다시 시도해주세요." : error.message);
            try {
                const response = await fetch("/api/auth/me", {credentials: "include", cache: "no-store", signal: request.signal});
                if (response.ok) {
                    const data = await response.json();
                    if (!request.signal.aborted) {
                        setIsChecked(data.isChecked === true);
                        setStat(data.status);
                        if (data.isChecked === true) setCheckError("");
                    }
                }
            } catch {
                // 저장 실패 안내를 유지하고 다음 클릭에서 다시 시도합니다.
            }
        } finally {
            if (!request.signal.aborted) setIsSubmitting(false);
            if (checkRequest.current === request) checkRequest.current = null;
        }
    }
    return (
        <div className="attendance-page">
            <div className="attendance-app">
                <MainPageNav mobile setMainId={setMainId} setMainName={setMainName} setMainRole={setMainRole} setRn={setRn} setStat={setStat} setIsChecked={setIsChecked} Ub="기숙사 출결 관리"/>
                <main className="attendance-main">
                    <section className="attendance-welcome" aria-labelledby="attendance-greeting">
                        <p className="attendance-date"><MainPageIcon name="calendar"/>{dateLabel}</p>
                        <h1 id="attendance-greeting">{Name}</h1>
                        <div className="attendance-profile">
                            <span className="attendance-room"><MainPageIcon name="room"/>{Rn ? `${Rn}호` : "호실 미등록"}</span>
                            <span className={`attendance-residence ${Stat === "잔류" ? "is-staying" : ""}`} data-state={residenceState?.state}><i aria-hidden="true"/>{Stat || "상태 미설정"}</span>
                        </div>
                    </section>

                    <section className="attendance-network" data-state={isCheckingNetwork ? "checking" : Wcheck ? "connected" : "disconnected"} aria-labelledby="attendance-network-title">
                        <div className="attendance-network-status">
                            <span className="attendance-wifi-symbol" title={networkMessage}>
                                <img src={Wcheck ? wifi_connected : wifi_disconnected} alt={Wcheck ? "출석 가능한 와이파이에 연결됨" : "출석 가능한 와이파이에 연결되지 않음"}/>
                            </span>
                            <div className="attendance-network-info">
                                <p id="attendance-network-title" role="status" className="attendance-network-label">{networkLabel}</p>
                                <p className="attendance-network-description">{networkMessage}</p>
                            </div>
                            <button type="button" className="attendance-refresh" aria-label="와이파이 상태 다시 확인" title="와이파이 상태 다시 확인" onClick={refreshNetwork} disabled={isCheckingNetwork || isUpdatingNetwork}>
                                <MainPageIcon name="refresh" className={isCheckingNetwork ? "is-spinning" : ""}/>
                            </button>
                        </div>
                        {import.meta.env.DEV && previewAvailable && <div className="attendance-network-preview">
                            <span className="attendance-network-preview-label">와이파이 전환<small>개발용</small></span>
                            <div className="attendance-network-preview-actions">
                                {previewEnabled && <button type="button" className="attendance-network-reset" disabled={isCheckingNetwork || isUpdatingNetwork || isSubmitting} onClick={() => setNetworkPreview(null)}>자동</button>}
                                <button type="button" role="switch" aria-checked={Wcheck} aria-label="와이파이 연결 전환" aria-busy={isUpdatingNetwork}
                                    className="attendance-network-toggle" disabled={isCheckingNetwork || isUpdatingNetwork || isSubmitting} onClick={() => { setCheckError(""); setNetworkPreview(!Wcheck); }}>
                                    <span>{isUpdatingNetwork ? "적용 중" : Wcheck ? "켜짐" : "꺼짐"}</span>
                                    <span className="attendance-network-toggle-track" aria-hidden="true"><i/></span>
                                </button>
                            </div>
                        </div>}
                        {networkError && <p role="alert" className="attendance-network-toggle-error">{networkError}</p>}
                    </section>

                    <section className="attendance-hero" data-state={heroState} aria-labelledby="attendance-title">
                        <div className="attendance-hero-top">
                            <span className="attendance-eyebrow">{residenceState ? "나의 기숙사 상태" : "나의 기숙사 출석"}</span>
                            <span className="attendance-status-badge"><i aria-hidden="true"/>{badgeLabel}</span>
                        </div>
                        <div className="attendance-hero-content">
                            <h2 id="attendance-title">{residenceState ? <>{Stat}<br/>{residenceState.ending}</> : showChecked ? <>출석체크를<br/>완료했어요.</> : <>출석체크를<br/>진행해 주세요.</>}</h2>
                            <span className="attendance-hero-symbol"><MainPageIcon name={heroIcon}/></span>
                        </div>
                        <p className="attendance-hero-description">{residenceState ? "기숙사에 복귀하면 잔류 상태를 확인해 주세요." : showChecked ? "확인해 주셔서 감사합니다. 편안한 하루 보내세요." : "작은 확인으로 시작하는 안심되는 기숙사 생활."}</p>
                        <button
                            type="button"
                            name="attendance-check"
                            aria-label={buttonLabel}
                            disabled={IsChecked || !canCheck || isSubmitting}
                            aria-busy={isSubmitting}
                            className={`attendance-action ${showChecked ? "is-complete" : ""}`}
                            onClick={handleCheck}
                        >
                            <span>{buttonLabel}</span>
                            <MainPageIcon name={residenceState?.icon || (isSubmitting ? "refresh" : showChecked ? "check" : canCheck ? "arrow-right" : "lock")} className={isSubmitting ? "is-spinning" : ""}/>
                        </button>
                        <div className="attendance-notice">
                            <MainPageIcon name={showChecked && Wcheck ? "check" : "info"}/>
                            <div>
                                <p aria-live="polite">{attendanceMessage}</p>
                            </div>
                        </div>
                        {checkError && <p role="alert" className="attendance-error">{checkError}</p>}
                    </section>

                    <details className="attendance-help">
                        <summary><span><MainPageIcon name="info"/>출석체크 이용 안내</span><MainPageIcon name="chevron"/></summary>
                        <ol>
                            <li><span>01</span>출석 가능한 와이파이에 연결해 주세요.</li>
                            <li><span>02</span>현재 상태가 잔류인지 확인해 주세요.</li>
                            <li><span>03</span>출석체크 후 체크완료 표시를 확인해 주세요.</li>
                        </ol>
                    </details>
                </main>
                <footer className="attendance-footer"><MainPageIcon name="shield"/><span>안심되는 기숙사 생활, Mentos</span></footer>
            </div>
        </div>
    );
};

export default MainPage;
