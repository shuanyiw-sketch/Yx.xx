const { domainError } = require('./validation');

const TRANSITIONS = {
  pending: {
    confirm: 'confirmed',
    reject: 'rejected',
    withdraw: 'cancelled',
  },
  confirmed: {
    complete: 'completed',
    requestCancel: 'cancel_requested',
  },
  cancel_requested: {
    acceptCancel: 'cancelled',
  },
};

function nextStatus(status, command) {
  const next = TRANSITIONS[status]?.[command];
  if (!next) {
    throw domainError('INVALID_TRANSITION', '当前预约状态不支持此操作');
  }
  return next;
}

function isBookingBlocking(booking, nowMs) {
  if (booking.status === 'pending') {
    return booking.lockedUntil > nowMs;
  }
  return booking.status === 'confirmed' || booking.status === 'cancel_requested';
}

module.exports = {
  isBookingBlocking,
  nextStatus,
};
