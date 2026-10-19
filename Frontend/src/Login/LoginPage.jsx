import schoolLogo from "./schoollogo.png";
import LoginInput from "./LoginInput";
import CheckEmpty from "./CheckEmpty";
import { useNavigate } from "react-router-dom";

import { useState } from "react";
<<<<<<< HEAD
const LoginPage = ({setMainId,setMainName}) => {
=======
  const LoginPage = () => {
>>>>>>> 97aac980009a402af0df4c9914b096c594630784
  const [Id,setId] = useState("")
  const [Password,setPassword] = useState("")
  const nav = useNavigate()

<<<<<<< HEAD
  const handleLogin = async () => {
    if (!Id || !Password) {
      CheckEmpty({Id,Password})
      return
    }

    try {
      const response = await fetch("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({id: Id, password: Password}),
      })
      const result = await response.json()
      if (!response.ok) {
        alert(result.message)
        return
      }
      setMainId(result.id)
      setMainName(result.name)
      nav("/main")
    } catch {
      alert("서버에 연결할 수 없습니다.")
    }
=======
  const handleSub = (e)=>{
    e.preventDefault();
    CheckEmpty({Id, Password})
>>>>>>> 97aac980009a402af0df4c9914b096c594630784
  }

  return (
    <div className="h-[90vh] flex justify-center items-center flex-col">
      <div className="flex justify-center items-center flex-col w-84 h-120 gap-8 p-10 rounded-2xl">
        <img
          src={schoolLogo}
          alt="schoollogo"
          className="w-24 h-24"
        />
        <h1 className="font-medium text-2xl">기숙사 출석체크</h1>

<<<<<<< HEAD
        <LoginInput type="text" placeholder="아이디" onChange={(e)=>{setId(e.target.value)}}/> {/* 아이디 입력창 */}
        <LoginInput type="text" placeholder="비밀번호" onChange={(e)=>{setPassword(e.target.value)}}/> {/* 비밀번호 입력창 */}

        <button // 제출버튼
          type="submit"
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold w-full h-11 rounded-[20px] cursor-pointer transition"
          onClick={handleLogin}
        >
          로그인
        </button>
=======
        <form onSubmit={handleSub} className="flex flex-col justify-center items-center gap-8 w-full ">
          <LoginInput type="text" placeholder="아이디" onChange={(e)=>{setId(e.target.value)}}/> {/* 아이디 입력창 */}
          <LoginInput type="password" placeholder="비밀번호" onChange={(e)=>{setPassword(e.target.value)}}/> {/* 비밀번호 입력창 */}
          <button // 제출버튼
            type="submit"
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold w-full h-11 rounded-[20px] cursor-pointer transition">
              로그인
          </button>
        </form>
       
>>>>>>> 97aac980009a402af0df4c9914b096c594630784
      </div>
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
