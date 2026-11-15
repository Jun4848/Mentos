const test = require('node:test');
const assert = require('node:assert/strict');
const { attendanceCsv } = require('../src/lib/attendanceExport');

test('CSV는 한글 BOM과 한국 시각을 포함하고 쉼표·따옴표·줄바꿈을 보존한다', () => {
  const csv = attendanceCsv([{ date: '2026-11-15', period: 'LUNCH', studentId: '261208',
    name: '오,"건우"\n학생', roomNumber: '403', status: 'PRESENT', checkedAt: '2026-11-15T03:45:00Z' }]);
  assert.equal(csv.charCodeAt(0), 0xFEFF);
  assert.ok(csv.includes('"오,""건우""\n학생"'));
  assert.ok(csv.includes('"2026-11-15 12:45:00"'));
  assert.ok(csv.includes('"점심"'));
});

test('CSV 셀의 수식 실행을 막고 빈 기록도 머리글을 다운로드할 수 있다', () => {
  for (const name of ['=SUM(1,2)', '+cmd', '-1+2', '@formula', '  =1', '\t=1', '\r=1']) {
    const csv = attendanceCsv([{ date: '2026-11-15', period: 'EVENING', studentId: '261208', name, roomNumber: '403', status: 'PRESENT' }]);
    assert.ok(csv.includes(`"'${name}"`), name);
  }
  assert.equal(attendanceCsv([]).split('\r\n').length, 2);
});
