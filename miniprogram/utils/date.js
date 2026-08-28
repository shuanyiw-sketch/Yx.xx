const DAY_MS = 24 * 60 * 60 * 1000;

function pad(value) {
  return String(value).padStart(2, '0');
}

function dateKeyFromTimestamp(timestampMs, offsetMinutes = 480) {
  const date = new Date(timestampMs + offsetMinutes * 60_000);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function dayRangeFromDateKey(dateKey, offsetMinutes = 480) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const dayStartMs = Date.UTC(year, month - 1, day) - offsetMinutes * 60_000;
  return { dayStartMs, dayEndMs: dayStartMs + DAY_MS };
}

function formatDateLabel(dateKey) {
  const [, month, day] = dateKey.split('-');
  return `${Number(month)}月${Number(day)}日`;
}

function formatTime(timestampMs, offsetMinutes = 480) {
  const date = new Date(timestampMs + offsetMinutes * 60_000);
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

function nextDateOptions(nowMs = Date.now(), count = 14, offsetMinutes = 480) {
  const today = dateKeyFromTimestamp(nowMs, offsetMinutes);
  const { dayStartMs } = dayRangeFromDateKey(today, offsetMinutes);
  return Array.from({ length: count }, (_, index) => {
    const dateKey = dateKeyFromTimestamp(dayStartMs + index * DAY_MS, offsetMinutes);
    return { dateKey, label: formatDateLabel(dateKey) };
  });
}

function formatDateTime(timestampMs, offsetMinutes = 480) {
  const dateKey = dateKeyFromTimestamp(timestampMs, offsetMinutes);
  return `${formatDateLabel(dateKey)} ${formatTime(timestampMs, offsetMinutes)}`;
}

module.exports = {
  dateKeyFromTimestamp,
  dayRangeFromDateKey,
  formatDateLabel,
  formatDateTime,
  formatTime,
  nextDateOptions,
};
