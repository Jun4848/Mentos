import schoolLogo from "./schoollogo.png";
import { useNavigate } from "react-router-dom";
import Logout from "./Logout";

const MainPageNav = ({setMainId, setMainName, setMainRole, setRn, setStat}) => {
  const nav = useNavigate()
  return (
    <div className="flex flex-row justify-between items-center w-screen h-[7vh] p-5 gap-10 shadow-xs">
      <h1 className="font-bold text-2xl">
        기숙사 출결
      </h1>
      <img src={schoolLogo} alt="schoollogo" className="w-10 h-10"/>
      <button className="hover:bg-gray-100 cursor-pointer w-30 h-10 border border-gray-400 rounded-2xl shadow-sm transition"
      onClick={()=>(Logout(nav,{ setMainId, setMainName, setMainRole, setRn, setStat}))}>
        로그아웃
      </button> {/*로그아웃 버튼*/}
    </div>
  );
};

export default MainPageNav;
