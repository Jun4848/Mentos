import { useState } from "react";
import useAttendanceHistory from "./useAttendanceHistory";
import "./AttendanceHistory.css";

const periodLabels = { MORNING: "아침", LUNCH: "점심", EVENING: "저녁" };
const statusLabels = { PRESENT: "출석", LATE: "지각", ABSENT: "결석", EXCUSED: "공결" };
const timeFormatter = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });

export default function AttendanceHistory() {
  const [selectedDate, setSelectedDate] = useState("");
  const { data, loading, error, refresh } = useAttendanceHistory(selectedDate);
  const date = selectedDate || data?.date || "";
  const ready = Boolean(data && !loading && !error && data.records.length);

  return <section className="admin-history" aria-labelledby="attendance-history-heading">
    <div className="history-heading">
      <div><h1 id="attendance-history-heading">날짜별 출석 기록</h1><p>체크 초기화 후에도 날짜별 기록은 보관됩니다.</p></div>
      <div className="history-actions">
        {ready && <a href={`/api/admin/attendance-history/export?date=${encodeURIComponent(data.date)}`} download>CSV 다운로드</a>}
        <button type="button" disabled={!ready} onClick={() => window.print()}>인쇄 / PDF 저장</button>
      </div>
    </div>
    <div className="history-controls">
      <label>조회 날짜<input aria-label="출석 기록 조회 날짜" type="date" value={date} onChange={event => setSelectedDate(event.target.value)}/></label>
      <button type="button" onClick={() => { setSelectedDate(""); refresh(); }}>최신 날짜</button>
      <button type="button" disabled={loading} onClick={refresh}>새로고침</button>
      <span>{loading ? "기록 확인 중…" : data ? `${data.date} · ${data.total}건` : "기록 확인 필요"}</span>
    </div>
    <div className="history-print-heading"><h1>출석체크 관리 · 출석 기록</h1><p>{data?.date} · {data?.total || 0}건 · 한국 시간 기준</p></div>
    {error ? <p className="history-error" role="alert">{error}</p> : loading ? <p className="history-empty" role="status">출석 기록을 불러오고 있습니다.</p>
      : !data?.records.length ? <p className="history-empty">{data?.latestDate ? "선택한 날짜에 저장된 출석 기록이 없습니다." : "아직 저장된 출석 기록이 없습니다. 앞으로 완료한 출석부터 여기에 표시됩니다."}</p>
        : <div className="history-table-wrap"><table>
          <caption>{data.date} 출석 기록 · 한국 시간 기준</caption>
          <thead><tr><th scope="col">시간대</th><th scope="col">학번</th><th scope="col">이름</th><th scope="col">호실</th><th scope="col">출결</th><th scope="col">체크 시각</th></tr></thead>
          <tbody>{data.records.map(record => <tr key={record.id}><td>{periodLabels[record.period]}</td><td>{record.studentId}</td><td>{record.name}</td><td>{record.roomNumber}</td><td>{statusLabels[record.status]}</td><td>{record.checkedAt ? timeFormatter.format(new Date(record.checkedAt)) : "—"}</td></tr>)}</tbody>
        </table></div>}
    <p className="history-note">실제로 저장된 출석 이력을 표시합니다. 과거에 저장하지 않은 체크는 복원되지 않습니다.</p>
  </section>;
}
