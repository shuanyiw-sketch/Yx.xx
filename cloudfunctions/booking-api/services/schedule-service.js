const crypto = require('node:crypto');
const { requireOwner } = require('../auth');
const { overlaps } = require('../domain/availability');
const { domainError } = require('../domain/validation');

const EXCEPTION_TYPES = new Set(['blocked', 'offline_booking', 'overtime']);

function createScheduleService(repository) {
  return {
    async listExceptions(storeId, session) {
      requireOwner(session, storeId);
      return repository.listScheduleExceptions(storeId);
    },

    async saveRule(input, session) {
      requireOwner(session, input?.storeId);
      if (!Number.isInteger(input.weekday) || input.weekday < 0 || input.weekday > 6
        || !Array.isArray(input.intervals)) {
        throw domainError('INVALID_RULE', '每周可预约规则无效');
      }
      const sorted = [...input.intervals].sort((a, b) => a.startMinute - b.startMinute);
      for (let index = 0; index < sorted.length; index += 1) {
        const interval = sorted[index];
        if (!Number.isInteger(interval.startMinute) || !Number.isInteger(interval.endMinute)
          || interval.startMinute < 0 || interval.endMinute > 1440
          || interval.endMinute <= interval.startMinute) {
          throw domainError('INVALID_RULE', '营业时间段无效');
        }
        if (index > 0 && sorted[index - 1].endMinute > interval.startMinute) {
          throw domainError('OVERLAPPING_INTERVALS', '营业时间段不能重叠');
        }
      }
      return repository.saveAvailabilityRule({
        id: input.ruleId || `rule-${input.storeId}-${input.weekday}`,
        storeId: input.storeId,
        weekday: input.weekday,
        intervals: sorted,
        intervalMinutes: input.intervalMinutes || 30,
      });
    },

    async saveException(input, session) {
      requireOwner(session, input?.storeId);
      if (!Number.isFinite(input.startMs) || !Number.isFinite(input.endMs)
        || input.endMs <= input.startMs) {
        throw domainError('INVALID_EXCEPTION', '特殊档期时间无效');
      }
      if (!EXCEPTION_TYPES.has(input.type || 'blocked')) {
        throw domainError('INVALID_EXCEPTION_TYPE', '特殊档期类型无效');
      }
      const existing = await repository.listScheduleExceptions(input.storeId);
      if (existing.some((exception) => (
        exception.id !== input.exceptionId
        && overlaps(input.startMs, input.endMs, exception.startMs, exception.endMs)
      ))) {
        throw domainError('OVERLAPPING_EXCEPTION', '特殊档期不能重叠');
      }
      return repository.saveScheduleException({
        id: input.exceptionId || `exception-${crypto.randomUUID()}`,
        storeId: input.storeId,
        startMs: input.startMs,
        endMs: input.endMs,
        type: input.type || 'blocked',
        note: input.note || '',
      });
    },
  };
}

module.exports = { createScheduleService };
