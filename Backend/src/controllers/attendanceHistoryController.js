const historyRepository = require('../repositories/attendanceHistoryRepository');
const { dateOnly, todayInSeoul } = require('../lib/validation');
const { attendanceCsv } = require('../lib/attendanceExport');

async function readHistory(requestedDate) {
  const input = requestedDate === undefined ? null : dateOnly(requestedDate);
  const latestDate = await historyRepository.latestDate();
  const date = input || latestDate || todayInSeoul();
  const records = await historyRepository.listByDate(date);
  return { date, latestDate, records, total: records.length, timeZone: 'Asia/Seoul' };
}

async function list(req, res) {
  res.set('Cache-Control', 'no-store');
  res.json(await readHistory(req.query.date));
}

async function download(req, res) {
  const history = await readHistory(req.query.date);
  res.set({
    'Cache-Control': 'no-store',
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="attendance-${history.date}.csv"`,
    'X-Content-Type-Options': 'nosniff',
  });
  res.send(attendanceCsv(history.records));
}

module.exports = { list, download };
