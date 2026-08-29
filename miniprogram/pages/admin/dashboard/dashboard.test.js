const { groupDashboard } = require('./index');

describe('groupDashboard', () => {
  it('groups today, pending, and soon-to-expire bookings', () => {
    const bookings = [
      { id: 'today', status: 'confirmed', startMs: 150, lockedUntil: 0 },
      { id: 'cancel', status: 'cancel_requested', startMs: 160, lockedUntil: 0 },
      { id: 'pending-soon', status: 'pending', startMs: 300, lockedUntil: 150 },
      { id: 'pending-later', status: 'pending', startMs: 400, lockedUntil: 5_000_000 },
    ];

    const grouped = groupDashboard(bookings, {
      nowMs: 100,
      dayStartMs: 100,
      dayEndMs: 200,
    });

    expect(grouped.today.map((item) => item.id)).toEqual(['today', 'cancel']);
    expect(grouped.pending.map((item) => item.id)).toEqual(['pending-soon', 'pending-later']);
    expect(grouped.expiringSoon.map((item) => item.id)).toEqual(['pending-soon']);
  });
});
