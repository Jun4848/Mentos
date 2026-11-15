import schoolLogo from "./schoollogo.png";
import { NavLink, useNavigate } from "react-router-dom";
import Logout from "./Logout";
import MainPageIcon from "./MainPageIcon";

const MainPageNav = ({setMainId, setMainName, setMainRole, setRn, setStat, setIsChecked, Ub, mobile = false, admin = false}) => {
  const nav = useNavigate()
  const handleLogout = () => Logout(nav, {setMainId, setMainName, setMainRole, setRn, setStat, setIsChecked});

  if (admin) return (
    <header className="admin-nav"><div className="admin-nav-inner">
      <div className="admin-brand"><img src={schoolLogo} alt="학교 로고"/><strong>출석체크 관리</strong><span className="admin-brand-badge">ADMIN</span></div>
      <nav className="admin-page-links" aria-label="관리자 메뉴"><NavLink to="/admin" end>실시간 현황</NavLink><NavLink to="/admin/attendance-history">출석 기록</NavLink></nav>
      <button type="button" className="admin-logout" onClick={handleLogout}><MainPageIcon name="logout"/>로그아웃</button>
    </div></header>
  );

  if (mobile) return (
    <header className="attendance-nav">
      <div className="attendance-brand">
        <span className="attendance-brand-mark"><img src={schoolLogo} alt="학교 로고"/></span>
        <span className="attendance-brand-name">{Ub}</span>
      </div>
      <button type="button" className="attendance-logout" onClick={handleLogout}>
        <MainPageIcon name="logout"/><span>로그아웃</span>
      </button>
    </header>
  );

  return (
    <div className="flex flex-row justify-between items-center w-screen h-[7vh] p-5 gap-10 shadow-xs">
      <h1 className="font-bold text-2xl">
        {Ub}
      </h1>
      <img src={schoolLogo} alt="schoollogo" className="w-10 h-10"/>
      <button className="hover:bg-gray-100 cursor-pointer w-30 h-10 border border-gray-400 rounded-2xl shadow-sm transition"
      onClick={handleLogout}>
        로그아웃
      </button> {/*로그아웃 버튼*/}
    </div>
  );
};

export default MainPageNav;
