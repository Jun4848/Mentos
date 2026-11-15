const PERIOD_LABELS = { MORNING: '아침', LUNCH: '점심', EVENING: '저녁' };
const STATUS_LABELS = { PRESENT: '출석', LATE: '지각', ABSENT: '결석', EXCUSED: '공결' };
const checkedAtFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function csvCell(value) {
  let text = String(value ?? '');
  // 학생 이름·호실에 수식 문자가 포함돼도 스프레드시트가 명령으로 실행하지 않도록 합니다.
  if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function attendanceCsv(records) {
  const rows = [['날짜', '시간대', '학번', '이름', '호실', '출결', '체크 시각 (한국 시간)'],
    ...records.map(record => [record.date, PERIOD_LABELS[record.period], record.studentId,
      record.name, record.roomNumber, STATUS_LABELS[record.status],
      record.checkedAt ? checkedAtFormatter.format(new Date(record.checkedAt)) : ''])];
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

module.exports = { attendanceCsv };
