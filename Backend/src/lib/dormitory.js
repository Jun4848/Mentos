const TIME_ZONE = 'Asia/Seoul';
const ROOM_CAPACITY = 4;
const ROOMS_PER_FLOOR = 15;
const RESIDENCE_STATUSES = new Map([
  ['귀가', 'HOME'],
  ['외출', 'OUTING'],
  ['외박', 'OVERNIGHT'],
]);
const SUMMARY_KEYS = { HOME: 'home', OUTING: 'outing', OVERNIGHT: 'overnight', CHECKED: 'checked', UNCHECKED: 'pending' };
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

function buildDormitoryRoster(accounts, now = new Date()) {
  const floors = [2, 3, 4].map(floor => ({
    floor, capacity: ROOMS_PER_FLOOR * ROOM_CAPACITY, studentCount: 0,
    rooms: Array.from({ length: ROOMS_PER_FLOOR }, (_, index) => ({
      number: String(floor * 100 + index + 1), capacity: ROOM_CAPACITY, students: [], overCapacity: false,
    })),
  }));
  const roomMap = new Map(floors.flatMap(floor => floor.rooms.map(room => [room.number, room])));
  const unassignedStudents = [];
  const summary = { total: 0, checked: 0, pending: 0, home: 0, outing: 0, overnight: 0, assigned: 0, occupiedRooms: 0, unassigned: 0 };

  for (const account of accounts) {
    const roomNumber = String(account.roomNumber ?? '').trim().replace(/호$/, '').trim();
    const isChecked = Boolean(account.isChecked);
    // 귀가·외출·외박 상태는 기존 체크 값보다 우선 표시합니다.
    const attendanceStatus = RESIDENCE_STATUSES.get(account.status) || (isChecked ? 'CHECKED' : 'UNCHECKED');
    const student = {
      id: account.id, name: account.name, roomNumber, status: account.status || '', isChecked, attendanceStatus,
    };
    summary.total++;
    summary[SUMMARY_KEYS[attendanceStatus]]++;
    const room = roomMap.get(roomNumber);
    if (room) {
      room.students.push(student);
      room.overCapacity = room.students.length > ROOM_CAPACITY;
      summary.assigned++;
    } else {
      unassignedStudents.push(student);
    }
  }

  for (const floor of floors) {
    floor.studentCount = floor.rooms.reduce((total, room) => total + room.students.length, 0);
    summary.occupiedRooms += floor.rooms.filter(room => room.students.length > 0).length;
  }
  summary.unassigned = unassignedStudents.length;
  return { ...getAttendanceContext(now), capacity: 180, roomCount: 45, roomCapacity: ROOM_CAPACITY, summary, floors, unassignedStudents };
}

module.exports = { buildDormitoryRoster, getAttendanceContext, getStudentAccess, getCheckResetTimes };
