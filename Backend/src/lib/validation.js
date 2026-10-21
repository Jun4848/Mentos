const { HttpError } = require('./http');

function text(value, label, max, { optional = false } = {}) {
  if (optional && value === undefined) return '';
  if (typeof value !== 'string' || (!optional && !value.trim()) || value.trim().length > max) {
    throw new HttpError(400, `${label} 값을 확인해주세요.`);
  }
  return value.trim();
}

function oneOf(value, values, label) {
  if (!values.includes(value)) throw new HttpError(400, `${label} 값을 확인해주세요.`);
  return value;
}

function dateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpError(400, '날짜는 YYYY-MM-DD 형식이어야 합니다.');
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || value < '1000-01-01') {
    throw new HttpError(400, '유효한 날짜를 입력해주세요.');
  }
  return value;
}

function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new HttpError(400, '시간은 시간대가 포함된 ISO 8601 형식이어야 합니다.');
  }
  dateOnly(value.slice(0, 10));
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1000 || date.getUTCFullYear() > 9999 || Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59) {
    throw new HttpError(400, '유효한 시간을 입력해주세요.');
  }
  return date;
}

function positiveId(value) {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) > 4294967295) {
    throw new HttpError(400, '유효한 신청 번호를 입력해주세요.');
  }
  return Number(value);
}

function todayInSeoul() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

module.exports = { text, oneOf, dateOnly, timestamp, positiveId, todayInSeoul };
