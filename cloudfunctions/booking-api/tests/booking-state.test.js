const {
  isBookingBlocking,
  nextStatus,
} = require('../domain/booking-state');

describe('nextStatus', () => {
  it.each([
    ['pending', 'confirm', 'confirmed'],
    ['pending', 'reject', 'rejected'],
    ['pending', 'withdraw', 'cancelled'],
    ['confirmed', 'requestCancel', 'cancel_requested'],
    ['confirmed', 'complete', 'completed'],
    ['cancel_requested', 'acceptCancel', 'cancelled'],
  ])('moves %s through %s to %s', (status, command, expected) => {
    expect(nextStatus(status, command)).toBe(expected);
  });

  it('rejects an invalid transition', () => {
    expect(() => nextStatus('completed', 'confirm'))
      .toThrow(expect.objectContaining({ code: 'INVALID_TRANSITION' }));
  });
});

describe('isBookingBlocking', () => {
  it('keeps a cancellation request blocking', () => {
    expect(isBookingBlocking({ status: 'cancel_requested' }, 100)).toBe(true);
  });

  it('ignores an expired pending hold even before cleanup runs', () => {
    expect(isBookingBlocking({ status: 'pending', lockedUntil: 99 }, 100)).toBe(false);
  });
});
