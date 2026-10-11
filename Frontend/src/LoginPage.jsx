import schoolLogo from "./경북소프트웨어마이스터고등학교 로고.png";



const LoginForm = () => {
  return (
    <div className="h-screen flex justify-center items-center flex-col">
      <div className="flex justify-center items-center flex-col w-84 h-120 gap-8 p-10 rounded-2xl">
        <img
          src={schoolLogo}
          alt="경북소프트웨어마이스터고등학교 로고"
          className="w-24 h-24"
        />
        <h1 className="font-[500] text-2xl">기숙사 출석체크</h1>
        <input // 아이디 입력
          type="text"
          placeholder="아이디"
          className="border-b-1 border-b-gray-400 w-[100%] h-10 placeholder:text-[10px]"
        />
        <input // 비밀번호 입력
          type="password"
          placeholder="비밀번호"
          className="border-b-1 border-b-gray-400 w-[100%] h-10 placeholder:text-[10px]"
        />
        <button // 제출버튼
          type="submit"
          className="bg-emerald-600 text-white font-bold w-[100%] h-11 rounded-[20px] hover:bg-emerald-700 cursor-pointer transition"
        >
          로그인
        </button>
      </div>
    </div>
  );
};

export default LoginForm;
