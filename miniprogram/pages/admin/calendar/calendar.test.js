const { calendarEntries } = require('./index');

describe('calendar entries', () => {
  it('labels bookings and owner schedule exceptions separately', () => {
    expect(calendarEntries([
      { id: 'booking-1', startMs: 100, status: 'confirmed', serviceSnapshot: { name: '写真' } },
    ], [
      { id: 'exception-1', startMs: 200, endMs: 300, type: 'blocked', note: '外出拍摄' },
      { id: 'offline-1', startMs: 400, endMs: 500, type: 'offline_booking', note: '电话预约' },
    ])).toEqual([
      { id: 'booking-1', kind: 'booking', startMs: 100, status: 'confirmed', serviceSnapshot: { name: '写真' } },
      { id: 'exception-1', kind: 'exception', startMs: 200, endMs: 300, type: 'blocked', note: '外出拍摄' },
      { id: 'offline-1', kind: 'offline_booking', startMs: 400, endMs: 500, type: 'offline_booking', note: '电话预约' },
    ]);
  });
});
