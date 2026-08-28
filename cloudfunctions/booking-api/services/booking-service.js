const crypto = require('node:crypto');
const { requireAuthenticated, requireOwner } = require('../auth');
const { calculateAvailableSlots } = require('../domain/availability');
const { nextStatus } = require('../domain/booking-state');
const { domainError } = require('../domain/validation');

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

function createId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function assertCreateInput(input) {
  if (!input?.storeId || !input?.serviceId || !input?.requestId) {
    throw domainError('INVALID_INPUT', '预约信息不完整');
  }
  if (!Number.isFinite(input.startMs) || !Number.isFinite(input.nowMs)) {
    throw domainError('INVALID_TIME_RANGE', '预约时间无效');
  }
  if (!input.customer?.name || !input.customer?.phone) {
    throw domainError('INVALID_CUSTOMER', '请填写联系人姓名和手机号');
  }
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

function createBookingService(repository) {
  return {
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
        const occupiedStartMs = input.startMs - service.bufferBeforeMinutes * 60_000;
        const occupiedEndMs = serviceEndMs + service.bufferAfterMinutes * 60_000;
        const windows = await transaction.getAvailabilityWindows(
          input.storeId,
          occupiedStartMs,
          occupiedEndMs,
        );
        const window = windows[0];
        if (!window) throw domainError('SLOT_UNAVAILABLE', '该时间不在可预约档期内');

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
          id: createId('booking'),
          storeId: input.storeId,
          serviceId: input.serviceId,
          requestId: input.requestId,
          customerUserId: session.userId,
          customer: { ...input.customer },
          location: input.location || '',
          peopleCount: input.peopleCount || null,
          notes: input.notes || '',
          startMs: input.startMs,
          endMs: serviceEndMs,
          occupiedStartMs,
          occupiedEndMs,
          status: 'pending',
          lockedUntil: input.nowMs + DAY_MS,
          serviceSnapshot: serviceSnapshot(service),
          createdAtMs: input.nowMs,
          updatedAtMs: input.nowMs,
        };
        await transaction.insertBooking(booking);
        await transaction.insertNotificationJob({
          id: createId('notification'),
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

      return repository.runTransaction(async (transaction) => {
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

        if (booking.status === COMMAND_RESULTS[input.command]
          && booking.lastCommand === input.command) {
          return booking;
        }

        const status = nextStatus(booking.status, input.command);
        const updated = await transaction.updateBookingIfStatus(
          booking.id,
          booking.status,
          { status, lastCommand: input.command, updatedAtMs: input.nowMs },
        );
        if (!updated) throw domainError('BOOKING_CHANGED', '预约状态已变化，请刷新后重试');
        return updated;
      });
    },
  };
}

module.exports = { createBookingService };
