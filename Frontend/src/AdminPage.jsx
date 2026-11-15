import { memo, useEffect, useState } from "react";
import MainPageNav from "./MainPageNav";
import MainPageIcon from "./MainPageIcon";
import useDormitoryRoster from "./useDormitoryRoster";
import "./AdminPage.css";

const dateFormatter = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", weekday: "long" });
const timeFormatter = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
const labels = { HOME: "귀가", OUTING: "외출", OVERNIGHT: "외박", CHECKED: "출석완료", UNCHECKED: "미체크" };

function StudentRow({student}) {
  const status = student.attendanceStatus;
  return <li className={`admin-student is-${status.toLowerCase()}`} data-student-id={student.id}>
    <div><strong>{student.name}</strong></div>
    <span className="admin-student-status"><i aria-hidden="true"/>{labels[status]}</span>
  </li>;
}

const RoomCard = memo(function RoomCard({room}) {
  return <article className={`admin-room ${room.students.length ? "has-students" : "is-empty"}`} aria-label={`${room.number}호, ${room.students.length}명`}>
    <div className="admin-room-heading"><h3>{room.number}<span>호</span></h3><span className="admin-room-count">{room.students.length}<span> / {room.capacity}</span></span></div>
    {room.students.length ? <ul>
      {room.students.slice(0, room.capacity).map(student => <StudentRow key={student.id} student={student}/>)}
      {Array.from({ length: Math.max(0, room.capacity - room.students.length) }, (_, index) => <li className="admin-empty-slot" key={`empty-${index}`}><span>—</span>빈자리</li>)}
    </ul> : <div className="admin-empty-room"><MainPageIcon name="room"/><span>등록된 학생이 없어요</span><small>정원 {room.capacity}명</small></div>}
    {room.overCapacity && <p className="admin-capacity-warning">정원 초과 · {room.students.slice(room.capacity).map(student => student.name).join(", ")}</p>}
  </article>;
});

const AdminPage = ({Name, setMainId, setMainName, setMainRole, setRn, setStat, setIsChecked}) => {
  const { data, loading, refreshing, error, accessDenied, receivedAt, refresh } = useDormitoryRoster();
  const [floorFilter, setFloorFilter] = useState("4");
  const [search, setSearch] = useState("");
  const [tick, setTick] = useState(Date.now);

  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const serverOffset = data && receivedAt ? new Date(data.serverTime).getTime() - receivedAt : 0;
  const now = new Date(tick + serverOffset);
  const time = timeFormatter.format(now);
  const periods = data?.periods || [];
  const activePeriod = periods.find(period => time.slice(0, 5) >= period.start && time.slice(0, 5) < period.end);
  const query = search.trim().toLocaleLowerCase("ko-KR");
  const matchesStudent = student => [student.name, student.id, student.roomNumber].some(value => String(value).toLocaleLowerCase("ko-KR").includes(query));
  const visibleFloors = (data?.floors || []).filter(floor => String(floor.floor) === floorFilter).map(floor => ({
    ...floor, visibleRooms: floor.rooms.filter(room => !query || room.number.includes(query) || room.students.some(matchesStudent)),
  }));
  const visibleRoomCount = visibleFloors.reduce((total, floor) => total + floor.visibleRooms.length, 0);
  const unassigned = (data?.unassignedStudents || []).filter(student => !query || matchesStudent(student));
  const stats = [
    { key: "total", label: "전체 등록 학생", icon: "users", description: "관리자 계정 제외" },
    { key: "checked", label: "출석완료", icon: "check", description: "체크를 마친 학생" },
    { key: "pending", label: "미체크", icon: "clock", description: "아직 체크하지 않은 학생" },
    { key: "home", label: "귀가", icon: "home", description: "귀가 상태인 학생" },
    { key: "outing", label: "외출", icon: "logout", description: "외출 상태인 학생" },
    { key: "overnight", label: "외박", icon: "home", description: "외박 상태인 학생" },
  ];

  return <div className="admin-page">
    <MainPageNav admin setMainId={setMainId} setMainName={setMainName} setMainRole={setMainRole} setRn={setRn} setStat={setStat} setIsChecked={setIsChecked} Ub="기숙사 출결 관리"/>
    <main className="admin-main">
      <div className="admin-page-heading">
        <div><h1>기숙사 출석 현황</h1><p className="admin-heading-description">{Name || "관리자"}님, 호실별 학생의 출석 상태를 확인해 주세요.</p></div>
        <div className="admin-update-controls"><div className={`admin-live ${error ? "is-offline" : ""}`}><i aria-hidden="true"/><span>{error ? "연결 확인 필요" : loading ? "학생 목록 확인 중" : "5초마다 자동 업데이트"}{receivedAt > 0 && <small>최근 확인 {timeFormatter.format(new Date(receivedAt + serverOffset))}</small>}</span></div><button type="button" className="admin-refresh" onClick={refresh} disabled={loading || refreshing}><MainPageIcon name="refresh" className={refreshing ? "admin-is-spinning" : ""}/><span>새로고침</span></button></div>
      </div>

      <section className="admin-context" aria-label="현재 날짜와 출석 시간">
        <div className="admin-context-date"><span className="admin-calendar-icon"><MainPageIcon name="calendar"/></span><h2>{dateFormatter.format(now)}</h2></div>
        <div className="admin-clock"><strong>{time}</strong><span className={activePeriod ? "is-active" : ""}>{loading ? "시간 확인 중" : !data ? "시간 확인 불가" : activePeriod ? `현재 ${activePeriod.label}시간` : "출석 시간 외"}</span></div>
        <div className="admin-periods">{periods.map(period => <div key={period.code} className={activePeriod?.code === period.code ? "is-active" : ""}><i aria-hidden="true"/><strong>{period.label}</strong><span>{period.start}–{period.end}</span></div>)}</div>
      </section>

      <section className="admin-stats" aria-label="전체 학생 출석 요약">{stats.map(stat => <article key={stat.key} className={`admin-stat is-${stat.key}`}><div className="admin-stat-top"><h2>{stat.label}</h2><span><MainPageIcon name={stat.icon}/></span></div><p><strong>{data ? data.summary[stat.key] : "—"}</strong><span>명</span></p><small>{stat.description}</small></article>)}</section>
      {error && <div role="alert" className="admin-error"><MainPageIcon name="info"/><span>{error}</span>{accessDenied && <a href="/">다시 로그인</a>}</div>}

      <section className="admin-roster" aria-labelledby="admin-roster-title">
        <div className="admin-roster-heading"><div><h2 id="admin-roster-title">호실별 현황</h2><p>2·3·4층 · 층별 15개 호실 · 호실당 최대 4명</p></div><span className="admin-capacity">총 45개 호실<span> · </span>정원 180명</span></div>
        <div className="admin-filters">
          <div className="admin-floor-tabs" role="group" aria-label="층 선택">{(data?.floors || [2, 3, 4].map(floor => ({floor}))).map(floor => ({ value: String(floor.floor), label: `${floor.floor}층`, count: floor.studentCount })).map(tab => <button type="button" key={tab.value} aria-pressed={floorFilter === tab.value} onClick={() => setFloorFilter(tab.value)}><span>{tab.label}</span><small>{tab.count ?? "—"}</small></button>)}</div>
          <label className="admin-search"><MainPageIcon name="search"/><span className="admin-sr-only">이름, 학번, 호실 검색</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="이름, 학번, 호실 검색"/></label>
        </div>
        <div className="admin-board-meta"><div className="admin-legend"><span className="is-checked"><i/>출석완료</span><span className="is-pending"><i/>미체크</span><span className="is-home"><i/>귀가</span><span className="is-outing"><i/>외출</span><span className="is-overnight"><i/>외박</span></div></div>

        {loading ? <div className="admin-loading" role="status"><span className="admin-loading-dot"/>학생 정보를 불러오고 있습니다.</div> : !data ? <div className="admin-no-results">학생 목록을 불러오지 못했습니다. 연결 상태를 확인해 주세요.</div> : visibleRoomCount === 0 ? <div className="admin-no-results"><MainPageIcon name="search"/><h3>조건에 맞는 호실이 없어요</h3><p>검색어를 확인해 주세요.</p></div> : visibleFloors.map(floor => floor.visibleRooms.length > 0 && <section className="admin-floor-section" key={floor.floor} aria-labelledby={`admin-floor-${floor.floor}`}><div className="admin-floor-heading"><h3 id={`admin-floor-${floor.floor}`}>{floor.floor}층</h3><span>15개 호실 · 등록 {floor.studentCount}명 / 정원 {floor.capacity}명</span></div><div className="admin-room-grid">{floor.visibleRooms.map(room => <RoomCard key={room.number} room={room}/>)}</div></section>)}
      </section>

      {unassigned.length > 0 && <section className="admin-unassigned" aria-labelledby="admin-unassigned-title"><h2 id="admin-unassigned-title"><MainPageIcon name="info"/>호실 확인이 필요한 학생 <span>{unassigned.length}명</span></h2><p>201–215호, 301–315호, 401–415호 범위에 맞게 학생의 호실을 확인해 주세요.</p><ul>{unassigned.map(student => <li key={student.id}><strong>{student.name}</strong><span>{student.roomNumber || "호실 미등록"}</span><span className={`admin-unassigned-status is-${student.attendanceStatus.toLowerCase()}`}>{labels[student.attendanceStatus]}</span></li>)}</ul></section>}
      <footer className="admin-footer"><span>Mentos · 기숙사 출결 관리</span><span>등록된 학생과 현재 체크 상태를 자동으로 불러옵니다.</span></footer>
    </main>
  </div>;
};

export default AdminPage;
