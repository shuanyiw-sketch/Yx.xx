const crypto = require('node:crypto');
const { requireAuthenticated, requireOwner } = require('../auth');
const { calculateAvailableSlots } = require('../domain/availability');
const { nextStatus } = require('../domain/booking-state');
const { assertSameStoreDay, domainError, localDateKey } = require('../domain/validation');

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MAX_ADVANCE_MS = 90 * DAY_MS;
const OWNER_COMMANDS = new Set(['confirm', 'reject', 'acceptCancel', 'complete']);
const CUSTOMER_COMMANDS = new Set(['withdraw', 'requestCancel']);
const COMMAND_RESULTS = {
  confirm: 'confirmed',
  reject: 'rejected',
  withdraw: 'cancelled',
  requestCancel: 'cancel_requested',
  acceptCancel: 'cancelled',
  complete: 'completed',
};

function stableId(prefix, value) {
  return `${prefix}-${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function assertCreateInput(input) {
  if (typeof input?.storeId !== 'string' || !input.storeId.trim()
    || typeof input?.serviceId !== 'string' || !input.serviceId.trim()
    || typeof input?.requestId !== 'string' || !input.requestId.trim()
    || input.requestId.length > 128) {
    throw domainError('INVALID_INPUT', '预约信息不完整');
  }
  if (!Number.isFinite(input.startMs) || !Number.isFinite(input.nowMs)) {
    throw domainError('INVALID_TIME_RANGE', '预约时间无效');
  }
  if (typeof input.customer?.name !== 'string'
    || !input.customer.name.trim()
    || input.customer.name.trim().length > 50
    || typeof input.customer?.phone !== 'string'
    || !/^1\d{10}$/.test(input.customer.phone)) {
    throw domainError('INVALID_CUSTOMER', '请填写联系人姓名和手机号');
  }
  if (input.location !== undefined
    && (typeof input.location !== 'string' || input.location.length > 200)) {
    throw domainError('INVALID_LOCATION', '服务地点不能超过 200 个字');
  }
  if (input.notes !== undefined
    && (typeof input.notes !== 'string' || input.notes.length > 500)) {
    throw domainError('INVALID_NOTES', '预约备注不能超过 500 个字');
  }
  if (input.peopleCount !== undefined && input.peopleCount !== null
    && (!Number.isInteger(input.peopleCount)
      || input.peopleCount < 1
      || input.peopleCount > 100)) {
    throw domainError('INVALID_PEOPLE_COUNT', '服务人数必须是 1 到 100 的整数');
  }
}

function historyEntry(fromStatus, toStatus, command, actorUserId, atMs) {
  return { fromStatus, toStatus, command, actorUserId, atMs };
}

function serviceSnapshot(service) {
  return {
    name: service.name,
    referencePriceFen: service.referencePriceFen,
    durationMinutes: service.durationMinutes,
    bufferBeforeMinutes: service.bufferBeforeMinutes,
    bufferAfterMinutes: service.bufferAfterMinutes,
  };
}

function timezoneOffsetMs(timestampMs, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    month: '2-digit',
    second: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(new Date(timestampMs));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const representedAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );
  return representedAsUtc - Math.floor(timestampMs / 1000) * 1000;
}

function timestampInZone(dateKey, minuteOfDay, timeZone) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const wallClockUtc = Date.UTC(
    year,
    month - 1,
    day,
    Math.floor(minuteOfDay / 60),
    minuteOfDay % 60,
  );
  let timestampMs = wallClockUtc;
  for (let iteration = 0; iteration < 2; iteration += 1) {
    timestampMs = wallClockUtc - timezoneOffsetMs(timestampMs, timeZone);
  }
  return timestampMs;
}

async function resolveAvailabilityWindows(repository, store, startMs, endMs) {
  const materialized = await repository.getAvailabilityWindows(store.id, startMs, endMs);
  const exceptions = await repository.listScheduleExceptions(store.id);
  const overtimeWindows = exceptions.filter((exception) => (
    exception.type === 'overtime'
    && exception.startMs < endMs
    && startMs < exception.endMs
  )).map((exception) => ({
    storeId: store.id,
    dayStartMs: exception.startMs,
    dayEndMs: exception.endMs,
    intervalMinutes: exception.intervalMinutes || 30,
  }));
  if (materialized.length) return [...materialized, ...overtimeWindows];
  const timeZone = store.timezone || 'Asia/Shanghai';
  const dateKey = localDateKey(startMs + Math.floor((endMs - startMs) / 2), timeZone);
  const weekday = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  const rules = await repository.listAvailabilityRules(store.id, weekday);
  const weeklyWindows = rules.flatMap((rule) => rule.intervals.map((interval) => ({
    storeId: store.id,
    dayStartMs: timestampInZone(dateKey, interval.startMinute, timeZone),
    dayEndMs: timestampInZone(dateKey, interval.endMinute, timeZone),
    intervalMinutes: rule.intervalMinutes || 30,
  })));
  return [...weeklyWindows, ...overtimeWindows];
}

function createBookingService(repository) {
  return {
    async listAvailableSlots(input) {
      if (!input?.storeId || !input?.serviceId
        || !Number.isFinite(input.dayStartMs)
        || !Number.isFinite(input.dayEndMs)
        || !Number.isFinite(input.nowMs)) {
        throw domainError('INVALID_INPUT', '档期查询参数无效');
      }
      const service = await repository.getPublishedService(input.storeId, input.serviceId);
      if (!service) throw domainError('SERVICE_NOT_FOUND', '服务不存在或已下架');
      const store = await repository.getStore(input.storeId);
      if (!store) throw domainError('STORE_NOT_FOUND', '经营者主页不存在');
      const windows = await resolveAvailabilityWindows(
        repository,
        store,
        input.dayStartMs,
        input.dayEndMs,
      );
      const slotGroups = await Promise.all(windows.map(async (window) => {
        const busy = await repository.findBlockingPeriods(
          input.storeId,
          window.dayStartMs,
          window.dayEndMs,
          input.nowMs,
        );
        return calculateAvailableSlots({
          dayStartMs: window.dayStartMs,
          dayEndMs: window.dayEndMs,
          minimumStartMs: input.nowMs + 2 * HOUR_MS,
          intervalMinutes: window.intervalMinutes,
          serviceMinutes: service.durationMinutes,
          bufferBeforeMinutes: service.bufferBeforeMinutes,
          bufferAfterMinutes: service.bufferAfterMinutes,
          busy,
        });
      }));
      const uniqueSlots = new Map(slotGroups.flat().map((slot) => (
        [`${slot.startMs}:${slot.endMs}`, slot]
      )));
      return [...uniqueSlots.values()].sort((first, second) => first.startMs - second.startMs);
    },

    async listMine(session) {
      requireAuthenticated(session);
      return repository.listBookingsByCustomer(session.userId);
    },

    async getMine(bookingId, session) {
      requireAuthenticated(session);
      const booking = await repository.getBooking(bookingId);
      if (!booking || booking.customerUserId !== session.userId) {
        throw domainError('BOOKING_NOT_FOUND', '预约不存在');
      }
      return booking;
    },

    async createBooking(input, session) {
      requireAuthenticated(session);
      assertCreateInput(input);

      return repository.runTransaction(async (transaction) => {
        const existing = await transaction.findBookingByRequestId(
          session.userId,
          input.requestId,
        );
        if (existing) return existing;

        const service = await transaction.getPublishedService(input.storeId, input.serviceId);
        if (!service) {
          throw domainError('SERVICE_NOT_FOUND', '服务不存在或已下架');
        }
        const store = await transaction.getStore(input.storeId);
        if (!store) throw domainError('STORE_NOT_FOUND', '经营者主页不存在');

        const minimumStartMs = input.nowMs + 2 * HOUR_MS;
        if (input.startMs < minimumStartMs || input.startMs > input.nowMs + MAX_ADVANCE_MS) {
          throw domainError('OUTSIDE_BOOKING_RANGE', '请选择 2 小时后至 90 天内的档期');
        }

        const serviceEndMs = input.startMs + service.durationMinutes * 60_000;
        assertSameStoreDay(input.startMs, serviceEndMs, store.timezone || 'Asia/Shanghai');
        const occupiedStartMs = input.startMs - service.bufferBeforeMinutes * 60_000;
        const occupiedEndMs = serviceEndMs + service.bufferAfterMinutes * 60_000;
        const windows = await resolveAvailabilityWindows(
          transaction,
          store,
          occupiedStartMs,
          occupiedEndMs,
        );
        const window = windows.find((candidate) => (
          candidate.dayStartMs <= occupiedStartMs && candidate.dayEndMs >= occupiedEndMs
        ));
        if (!window) throw domainError('SLOT_UNAVAILABLE', '该时间不在可预约档期内');
        if (input.startMs % (window.intervalMinutes * 60_000) !== 0) {
          throw domainError('INVALID_SLOT_GRANULARITY', '请选择列表中的标准档期');
        }

        await transaction.touchScheduleGuard(input.storeId, window.dayStartMs, input.nowMs);

        const busy = await transaction.findBlockingPeriods(
          input.storeId,
          window.dayStartMs,
          window.dayEndMs,
          input.nowMs,
        );
        const available = calculateAvailableSlots({
          dayStartMs: window.dayStartMs,
          dayEndMs: window.dayEndMs,
          minimumStartMs,
          intervalMinutes: window.intervalMinutes,
          serviceMinutes: service.durationMinutes,
          bufferBeforeMinutes: service.bufferBeforeMinutes,
          bufferAfterMinutes: service.bufferAfterMinutes,
          busy,
        }).some((slot) => slot.startMs === input.startMs);
        if (!available) throw domainError('SLOT_TAKEN', '该档期刚刚被占用，请选择其他时间');

        const booking = {
          id: stableId('booking', `${session.userId}:${input.requestId}`),
          storeId: input.storeId,
          serviceId: input.serviceId,
          requestId: input.requestId,
          customerUserId: session.userId,
          customer: {
            name: input.customer.name.trim(),
            phone: input.customer.phone,
          },
          location: input.location?.trim() || '',
          peopleCount: input.peopleCount || null,
          notes: input.notes?.trim() || '',
          startMs: input.startMs,
          endMs: serviceEndMs,
          occupiedStartMs,
          occupiedEndMs,
          status: 'pending',
          lockedUntil: input.nowMs + DAY_MS,
          serviceSnapshot: serviceSnapshot(service),
          history: [historyEntry(null, 'pending', 'create', session.userId, input.nowMs)],
          createdAtMs: input.nowMs,
          updatedAtMs: input.nowMs,
        };
        await transaction.insertBooking(booking);
        await transaction.insertNotificationJob({
          id: stableId('notification', `${booking.id}:booking_created`),
          type: 'booking_created',
          bookingId: booking.id,
          status: 'pending',
          attempts: 0,
          nextAttemptAtMs: input.nowMs,
          createdAtMs: input.nowMs,
        });
        return booking;
      });
    },

    async transitionBooking(input, session) {
      requireAuthenticated(session);
      if (!input?.bookingId || !input?.command || !Number.isFinite(input.nowMs)) {
        throw domainError('INVALID_INPUT', '预约操作参数无效');
      }

      const result = await repository.runTransaction(async (transaction) => {
        const booking = await transaction.getBooking(input.bookingId);
        if (!booking) throw domainError('BOOKING_NOT_FOUND', '预约不存在');

        if (OWNER_COMMANDS.has(input.command)) {
          requireOwner(session, booking.storeId);
        } else if (CUSTOMER_COMMANDS.has(input.command)) {
          if (booking.customerUserId !== session.userId) {
            throw domainError('FORBIDDEN', '无权操作该预约');
          }
        } else {
          throw domainError('INVALID_TRANSITION', '当前预约状态不支持此操作');
        }

        if (booking.status === 'pending' && booking.lockedUntil <= input.nowMs) {
          const history = [
            ...(booking.history || []),
            historyEntry('pending', 'expired', 'expire', session.userId, input.nowMs),
          ];
          const expired = await transaction.updateBookingIfStatus(
            booking.id,
            'pending',
            {
              status: 'expired', expiredAtMs: input.nowMs, updatedAtMs: input.nowMs, history,
            },
          );
          if (!expired) throw domainError('BOOKING_CHANGED', '预约状态已变化，请刷新后重试');
          return { booking: expired, expired: true };
        }

        if (booking.status === COMMAND_RESULTS[input.command]
          && booking.lastCommand === input.command) {
          return { booking, expired: false };
        }

        const status = nextStatus(booking.status, input.command);
        const history = [
          ...(booking.history || []),
          historyEntry(booking.status, status, input.command, session.userId, input.nowMs),
        ];
        const updated = await transaction.updateBookingIfStatus(
          booking.id,
          booking.status,
          { status, lastCommand: input.command, updatedAtMs: input.nowMs, history },
        );
        if (!updated) throw domainError('BOOKING_CHANGED', '预约状态已变化，请刷新后重试');
        if (input.command === 'confirm' || input.command === 'reject') {
          const type = input.command === 'confirm' ? 'booking_confirmed' : 'booking_rejected';
          await transaction.insertNotificationJob({
            id: stableId('notification', `${booking.id}:${type}`),
            type,
            bookingId: booking.id,
            customerUserId: booking.customerUserId,
            storeId: booking.storeId,
            status: 'pending',
            attempts: 0,
            nextAttemptAtMs: input.nowMs,
            createdAtMs: input.nowMs,
          });
        }
        return { booking: updated, expired: false };
      });
      if (result.expired) {
        throw domainError('BOOKING_EXPIRED', '待确认预约已过期，不能继续操作');
      }
      return result.booking;
    },
  };
}

module.exports = { createBookingService };
