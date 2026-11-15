import MainPageNav from "./MainPageNav";
import AttendanceHistory from "./AttendanceHistory";
import "./AdminPage.css";

export default function AdminAttendanceHistoryPage(props) {
  return <div className="admin-page">
    <MainPageNav {...props} admin Ub="출석 기록"/>
    <main className="admin-main"><AttendanceHistory/></main>
  </div>;
}
