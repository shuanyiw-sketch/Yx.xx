function domainError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.publicMessage = message;
  return error;
}

function assertFiniteNumber(value, code, message) {
  if (!Number.isFinite(value)) {
    throw domainError(code, message);
  }
}

function validateAvailabilityInput(input) {
  if (!input || typeof input !== 'object') {
    throw domainError('INVALID_INPUT', '档期参数无效');
  }

  for (const key of ['dayStartMs', 'dayEndMs', 'minimumStartMs']) {
    assertFiniteNumber(input[key], 'INVALID_TIME_RANGE', '营业时间无效');
  }

  if (input.dayEndMs <= input.dayStartMs) {
    throw domainError('INVALID_TIME_RANGE', '营业结束时间必须晚于开始时间');
  }
  if (!Number.isInteger(input.intervalMinutes) || input.intervalMinutes <= 0) {
    throw domainError('INVALID_INTERVAL', '时间间隔必须是正整数分钟');
  }
  if (!Number.isInteger(input.serviceMinutes) || input.serviceMinutes <= 0) {
    throw domainError('INVALID_DURATION', '服务时长必须是正整数分钟');
  }

  for (const key of ['bufferBeforeMinutes', 'bufferAfterMinutes']) {
    if (!Number.isInteger(input[key]) || input[key] < 0) {
      throw domainError('INVALID_BUFFER', '缓冲时间必须是非负整数分钟');
    }
  }

  if (!Array.isArray(input.busy)) {
    throw domainError('INVALID_BUSY_PERIODS', '占用时间格式无效');
  }
  for (const period of input.busy) {
    if (!Number.isFinite(period?.startMs)
      || !Number.isFinite(period?.endMs)
      || period.endMs <= period.startMs) {
      throw domainError('INVALID_BUSY_PERIODS', '占用时间格式无效');
    }
  }
}

function localDateKey(timestampMs, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(new Date(timestampMs));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function assertSameStoreDay(startMs, endMs, timeZone) {
  assertFiniteNumber(startMs, 'INVALID_TIME_RANGE', '预约开始时间无效');
  assertFiniteNumber(endMs, 'INVALID_TIME_RANGE', '预约结束时间无效');
  if (endMs <= startMs) {
    throw domainError('INVALID_TIME_RANGE', '预约结束时间必须晚于开始时间');
  }

  try {
    if (localDateKey(startMs, timeZone) !== localDateKey(endMs, timeZone)) {
      throw domainError('CROSS_DAY_SERVICE', '首版暂不支持跨日预约');
    }
  } catch (error) {
    if (error.code) throw error;
    throw domainError('INVALID_TIME_ZONE', '店铺时区无效');
  }
}

module.exports = {
  assertSameStoreDay,
  domainError,
  localDateKey,
  validateAvailabilityInput,
};
