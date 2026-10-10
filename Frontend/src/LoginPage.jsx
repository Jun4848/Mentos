const LoginForm = () => {
  return (
    <div className="h-screen flex justify-center items-center flex-col">
      <div className="flex justify-center items-center flex-col w-84 h-100 gap-10 p-10 rounded-2xl">
        <h1>로그인</h1>
        <input type="text" placeholder="아이디" className="border-b-1 w-[100%] h-10" />
        <input type="password" placeholder="비밀번호" className="border-b-1 w-[100%] h-10" />
        <button type="submit" className="bg-emerald-500 text-white font- w-[100%] h-10 rounded-2xl hover:bg-emerald-600 cursor-pointer">
          로그인
        </button>
      </div>
    </div>
  );
};

export default LoginForm;
