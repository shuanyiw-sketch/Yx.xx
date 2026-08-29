const crypto = require('node:crypto');

const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 5 * 60 * 1000;
const TERMINAL_ERROR_CODES = new Set([40037, 43101, '40037', '43101']);

function reminderId(idempotencyKey) {
  return `reminder-${crypto.createHash('sha256').update(idempotencyKey).digest('hex')}`;
}

async function expirePendingBookings(repository, nowMs) {
  const expired = await repository.listExpiredPending(nowMs);
  let count = 0;
  for (const booking of expired) {
    const history = [
      ...(booking.history || []),
      {
        fromStatus: 'pending',
        toStatus: 'expired',
        command: 'expire',
        actorUserId: 'system',
        atMs: nowMs,
      },
    ];
    const updated = await repository.updateBookingIfStatus(booking.id, 'pending', {
      status: 'expired',
      expiredAtMs: nowMs,
      updatedAtMs: nowMs,
      history,
    });
    if (updated) count += 1;
  }
  return count;
}

async function enqueueUpcomingReminders(repository, windowStartMs, windowEndMs) {
  const bookings = await repository.listConfirmedBookingsStartingBetween(
    windowStartMs,
    windowEndMs,
  );
  let count = 0;
  for (const booking of bookings) {
    const type = 'upcoming';
    for (const recipientRole of ['customer', 'owner']) {
      const idempotencyKey = `${booking.id}:${type}:${recipientRole}:${booking.startMs}`;
      const inserted = await repository.insertNotificationJobIfAbsent({
        id: reminderId(idempotencyKey),
        idempotencyKey,
        bookingId: booking.id,
        customerUserId: booking.customerUserId,
        storeId: booking.storeId,
        type,
        recipientRole,
        scheduledAtMs: booking.startMs,
        status: 'pending',
        attempts: 0,
        nextAttemptAtMs: windowStartMs,
        createdAtMs: windowStartMs,
      });
      if (inserted) count += 1;
    }
  }
  return count;
}

function notificationDeliveryConfig(job) {
  const configs = {
    booking_created: { recipientRole: 'owner', templateEnv: 'BOOKING_CREATED_TEMPLATE_ID' },
    booking_confirmed: {
      recipientRole: 'customer', templateEnv: 'BOOKING_CONFIRMED_TEMPLATE_ID',
    },
    booking_rejected: {
      recipientRole: 'customer', templateEnv: 'BOOKING_REJECTED_TEMPLATE_ID',
    },
  };
  if (job.type === 'upcoming') {
    return {
      recipientRole: job.recipientRole === 'owner' ? 'owner' : 'customer',
      templateEnv: 'BOOKING_REMINDER_TEMPLATE_ID',
    };
  }
  const config = configs[job.type];
  if (!config) {
    const error = new Error('不支持的通知类型');
    error.code = 'UNKNOWN_NOTIFICATION_TYPE';
    throw error;
  }
  return config;
}

function errorDetails(error) {
  return {
    lastErrorCode: error?.code || 'UNKNOWN',
    lastErrorMessage: String(error?.message || '发送失败').slice(0, 200),
  };
}

async function deliverNotificationJobs(repository, sender, nowMs) {
  const jobs = await repository.listDueNotificationJobs(nowMs);
  const result = { sent: 0, failed: 0 };

  for (const job of jobs) {
    const attempts = (job.attempts || 0) + 1;
    try {
      await sender(job);
      const updated = await repository.updateNotificationJobIfStatus(job.id, job.status, {
        status: 'sent',
        attempts,
        sentAtMs: nowMs,
        updatedAtMs: nowMs,
      });
      if (updated) result.sent += 1;
    } catch (error) {
      const terminal = TERMINAL_ERROR_CODES.has(error?.code) || attempts >= MAX_ATTEMPTS;
      const changes = {
        status: terminal ? 'failed' : 'retry',
        attempts,
        updatedAtMs: nowMs,
        ...errorDetails(error),
      };
      if (!terminal) {
        changes.nextAttemptAtMs = nowMs + RETRY_BASE_MS * (2 ** (attempts - 1));
      }
      const updated = await repository.updateNotificationJobIfStatus(
        job.id,
        job.status,
        changes,
      );
      if (updated) result.failed += 1;
    }
  }
  return result;
}

module.exports = {
  deliverNotificationJobs,
  enqueueUpcomingReminders,
  expirePendingBookings,
  notificationDeliveryConfig,
};
