import { useEffect, useId, useRef } from "react";
import MainPageIcon from "../MainPageIcon";
import "./LoginNoticeModal.css";

export default function LoginNoticeModal({ message, timeClosed, onClose }) {
  const dialogRef = useRef(null);
  const confirmRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    confirmRef.current.focus();
    return () => {
      if (dialog.open) dialog.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return <dialog ref={dialogRef} className="login-notice-modal" aria-labelledby={titleId} aria-describedby={descriptionId}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="login-notice-content">
      <button type="button" className="login-notice-close" aria-label="안내 닫기" onClick={onClose}>×</button>
      <span className="login-notice-icon"><MainPageIcon name={timeClosed ? "clock" : "info"}/></span>
      <h2 id={titleId}>{timeClosed ? "출석 이용 시간 안내" : "로그인 안내"}</h2>
      <p id={descriptionId}>{message}</p>
      <button ref={confirmRef} type="button" className="login-notice-confirm" onClick={onClose}>확인</button>
    </div>
  </dialog>;
}
