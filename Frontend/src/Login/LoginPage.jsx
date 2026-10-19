import schoolLogo from "./schoollogo.png";
import LoginInput from "./LoginInput";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

const apiBase = (import.meta.env.VITE_API_URL || "http://localhost:3000").replace(/\/$/, "");

const LoginPage = ({setMainId,setMainName}) => {
  const [Id,setId] = useState("");
  const [Password,setPassword] = useState("");
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  const nav = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`${apiBase}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({id: Id, password: Password}),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(result?.message || `요청을 처리하지 못했습니다. (${response.status})`);
        return;
      }
      setMainId(result.id);
      setMainName(result.name);
      nav("/main");
    } catch {
      setMessage("서버에 연결할 수 없습니다. 백엔드 실행 상태를 확인해주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex justify-center items-center flex-col py-10">
        <img src={schoolLogo} alt="schoollogo" className="w-24 h-24" />
        <h1 className="font-medium text-2xl">기숙사 출석체크</h1>
      <form onSubmit={handleSubmit} className="flex flex-col justify-center items-center w-84 gap-6 p-10 rounded-2xl">
        
        <LoginInput type="text" placeholder="아이디" value={Id} maxLength={50} autoComplete="username" required disabled={busy} onChange={(e) => setId(e.target.value)} />
        <LoginInput type="password" placeholder="비밀번호" value={Password} maxLength={128} autoComplete="current-password" required disabled={busy} onChange={(e) => setPassword(e.target.value)} />
        {message && <p role="status" className="text-sm text-center">{message}</p>}
        <button type="submit" disabled={busy} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold w-full h-11 rounded-[20px] cursor-pointer transition disabled:opacity-50">
          {busy ? "처리 중…" : "로그인"}
        </button>
      </form>
      <div>
        <button type="button" onClick={() => nav("/main")}>메인페이지</button>
        <button type="button" onClick={() => nav("/admin")}>어드민페이지</button>
      </div>
    </div>
  );
};

export default LoginPage;
