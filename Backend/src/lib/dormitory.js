const TIME_ZONE = 'Asia/Seoul';
const PERIODS = [
  { code: 'LUNCH', label: '점심', start: '12:30', end: '14:00', resetAt: '17:50' },
  { code: 'EVENING', label: '저녁', start: '18:00', end: '19:30', resetAt: '22:30' },
];
const ATTENDANCE_TIME_MESSAGE = '지금은 학생 출석 이용 시간이 아닙니다. 점심 12:30~14:00, 저녁 18:00~19:30에 로그인해주세요. (한국 시간 기준)';
const clockFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function getAttendanceContext(now = new Date()) {
  const parts = Object.fromEntries(clockFormatter.formatToParts(now).map(part => [part.type, part.value]));
  const time = `${parts.hour}:${parts.minute}`;
  const periods = PERIODS.map(period => ({ ...period, active: time >= period.start && time < period.end }));
  return {
    timeZone: TIME_ZONE,
    serverTime: now.toISOString(),
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${time}:${parts.second}`,
    currentPeriod: periods.find(period => period.active)?.code || null,
    periods,
  };
}

function getStudentAccess(now = new Date()) {
  const context = getAttendanceContext(now);
  const allowed = context.currentPeriod !== null;
  return { ...context, allowed, message: allowed ? '학생 출석 이용 시간입니다.' : ATTENDANCE_TIME_MESSAGE };
}

function getCheckResetTimes(now = new Date()) {
  const { date } = getAttendanceContext(now);
  const resets = PERIODS.map(period => new Date(`${date}T${period.resetAt}:00+09:00`));
  const next = resets.find(reset => reset > now) || new Date(resets[0].getTime() + 86400000);
  const previous = resets.findLast(reset => reset <= now) || new Date(resets.at(-1).getTime() - 86400000);
  return { next, previous };
}

module.exports = { getAttendanceContext, getStudentAccess, getCheckResetTimes };
