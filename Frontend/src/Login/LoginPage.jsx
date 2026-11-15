import schoolLogo from "./schoollogo.png";

import { useNavigate } from "react-router-dom";
import LoginInput from "./LoginInput";
import { useState } from "react";

import LoginNoticeModal from "./LoginNoticeModal";
import AttendanceTimeToggle from "./AttendanceTimeToggle";
const LoginPage = ({setMainId, setMainName, setMainRole, setRn, setStat, setIsChecked}) => {
  const [Id,setId] = useState("")
  const [Password,setPassword] = useState("")
  const [Loading,setLoading] = useState(false)
  const [notice, setNotice] = useState(null);
  const [previewUpdating, setPreviewUpdating] = useState(false);
  const nav = useNavigate()

  async function Login(e) {
    e.preventDefault();
    if (Loading || previewUpdating) return;

    setLoading(true);
    setNotice(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        credentials: "include",
        body: JSON.stringify({id: Id.trim(), password: Password}),
      });
      const data = await response.json();

      if (!response.ok) {
        setNotice({ message: data.message || "로그인에 실패했습니다.", timeClosed: data.code === "ATTENDANCE_TIME_CLOSED" });
        return;
      }

      setMainId(data.id);
      setMainName(data.name);
      setMainRole(data.role);
      setRn(data.roomNumber)
      setStat(data.status)
      setIsChecked(data.isChecked === true);
      nav(data.role === "ADMIN" ? "/admin" : "/main", {replace: true});
    } catch {
      setNotice({ message: "서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.", timeClosed: false });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page min-h-dvh flex justify-center items-center flex-col px-4 py-8">
      <form onSubmit={Login} className="flex justify-center items-center flex-col w-84 max-w-full min-h-120 gap-6 p-8 rounded-2xl">
        <img
          src={schoolLogo}
          alt="schoollogo"
          className="w-24 h-24"
        />
        <h1 className="font-medium text-2xl">기숙사 출석체크</h1>
        <LoginInput type="text" placeholder="아이디" required onChange={(e)=>{setId(e.target.value)}}/> {/* 아이디 입력창 */}
        <LoginInput type="password" placeholder="비밀번호" required onChange={(e)=>{setPassword(e.target.value)}}/> {/* 비밀번호 입력창 */}

        <button // 제출버튼
          type="submit"
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold w-full h-11 rounded-[20px] cursor-pointer transition"
          disabled={Loading || previewUpdating}
        >
          {Loading ? "로그인 중..." : "로그인"}
        </button>
      </form>
      {notice && <LoginNoticeModal {...notice} onClose={() => setNotice(null)}/>}
      <AttendanceTimeToggle onPendingChange={setPreviewUpdating}/>
    </div>
  );
};

export default LoginPage;
