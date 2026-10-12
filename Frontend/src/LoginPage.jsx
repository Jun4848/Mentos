import schoolLogo from "./schoollogo.png";
import { useNavigate } from "react-router-dom";


const LoginForm = () => {
  const nav = useNavigate()
  return (
    <div className="h-screen flex justify-center items-center flex-col">
      <div className="flex justify-center items-center flex-col w-84 h-120 gap-8 p-10 rounded-2xl">
        <img
          src={schoolLogo}
          alt="schoollogo"
          className="w-24 h-24"
        />
        <h1 className="font-medium text-2xl">기숙사 출석체크</h1>
        <input // 아이디 입력
          type="text"
          placeholder="아이디"
          className="border-b border-b-gray-400 w-full h-10 placeholder:text-[10px] focus:outline-none"
        />
        <input // 비밀번호 입력
          type="password"
          placeholder="비밀번호"
          className="border-b border-b-gray-400 w-full h-10 placeholder:text-[10px] focus:outline-none"
        />
        <button // 제출버튼
          type="submit"
          className="bg-emerald-600 text-white font-bold w-full h-11 rounded-[20px] hover:bg-emerald-700 cursor-pointer transition"
        >
          로그인
        </button>
      </div>
      <button onClick={()=>{nav("/main")}}>
          메인페이지
        </button>
        <button onClick={()=>{nav("/admin")}}>
          어드민페이지
        </button>
    </div>
  );
};

export default LoginForm;
