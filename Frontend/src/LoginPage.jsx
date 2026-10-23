import schoolLogo from "./schoollogo.png";

import { useNavigate } from "react-router-dom";
import LoginInput from "./LoginInput";
import { useState } from "react";
import CheckEmpty from "./CheckEmpty";
const LoginPage = ({setMainId, setMainName, setMainRole}) => {
  const [Id,setId] = useState("")
  const [Password,setPassword] = useState("")
  const [Loading,setLoading] = useState(false)
  const nav = useNavigate()

  async function Login(e) {
    e.preventDefault();
    if (Loading || !CheckEmpty({Id,Password})) return;

    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        credentials: "include",
        body: JSON.stringify({id: Id.trim(), password: Password}),
      });
      const data = await response.json();

      if (!response.ok) {
        alert(data.message || "로그인에 실패했습니다.");
        return;
      }

      setMainId(data.id);
      setMainName(data.name);
      setMainRole(data.role);
      nav(data.role === "ADMIN" ? "/admin" : "/main", {replace: true});
    } catch {
      alert("서버에 연결할 수 없습니다.");//백엔드 꺼져 있을때
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="h-screen flex justify-center items-center flex-col">
      <form onSubmit={Login} className="flex justify-center items-center flex-col w-84 h-120 gap-8 p-10 rounded-2xl">
        <img
          src={schoolLogo}
          alt="schoollogo"
          className="w-24 h-24"
        />
        <h1 className="font-medium text-2xl">기숙사 출석체크</h1>

        <LoginInput type="text" placeholder="아이디" onChange={(e)=>{setId(e.target.value)}}/> {/* 아이디 입력창 */}
        <LoginInput type="password" placeholder="비밀번호" onChange={(e)=>{setPassword(e.target.value)}}/> {/* 비밀번호 입력창 */}

        <button // 제출버튼
          type="submit"
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold w-full h-11 rounded-[20px] cursor-pointer transition"
          disabled={Loading}
        >
          {Loading ? "로그인 중..." : "로그인"}
        </button>
      </form>
      <div> {/*페이지간 이동용 버튼 -> 곧 없앨거임*/}
        <button onClick={()=>{nav("/main")}}>
            메인페이지
        </button>
        <button onClick={()=>{nav("/admin")}}>
          어드민페이지
        </button>
      </div>
    </div>
  );
};

export default LoginPage;