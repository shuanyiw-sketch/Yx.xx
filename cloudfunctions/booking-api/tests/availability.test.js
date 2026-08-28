const {
  calculateAvailableSlots,
  overlaps,
} = require('../domain/availability');
const {
  assertSameStoreDay,
  validateAvailabilityInput,
} = require('../domain/validation');

const MINUTE = 60_000;

describe('calculateAvailableSlots', () => {
  it('excludes a start whose buffers overlap an existing booking', () => {
    const slots = calculateAvailableSlots({
      dayStartMs: 0,
      dayEndMs: 480 * MINUTE,
      intervalMinutes: 30,
      serviceMinutes: 120,
      bufferBeforeMinutes: 30,
      bufferAfterMinutes: 30,
      minimumStartMs: 0,
      busy: [{ startMs: 180 * MINUTE, endMs: 240 * MINUTE }],
    });

    expect(slots).not.toContainEqual({
      startMs: 120 * MINUTE,
      endMs: 240 * MINUTE,
    });
    expect(slots).toContainEqual({
      startMs: 270 * MINUTE,
      endMs: 390 * MINUTE,
    });
  });

  it('does not offer a service that would finish after closing', () => {
    const slots = calculateAvailableSlots({
      dayStartMs: 0,
      dayEndMs: 300 * MINUTE,
      intervalMinutes: 30,
      serviceMinutes: 120,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      minimumStartMs: 240 * MINUTE,
      busy: [],
    });

    expect(slots).toEqual([]);
  });

  it('aligns the first offered start to the store day interval', () => {
    const slots = calculateAvailableSlots({
      dayStartMs: 10 * MINUTE,
      dayEndMs: 200 * MINUTE,
      intervalMinutes: 30,
      serviceMinutes: 30,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      minimumStartMs: 31 * MINUTE,
      busy: [],
    });

    expect(slots[0]).toEqual({
      startMs: 40 * MINUTE,
      endMs: 70 * MINUTE,
    });
  });
});

describe('overlaps', () => {
  it('allows periods that only touch at a boundary', () => {
    expect(overlaps(0, 30, 30, 60)).toBe(false);
  });

  it('detects a strict intersection', () => {
    expect(overlaps(0, 31, 30, 60)).toBe(true);
  });
});

describe('availability validation', () => {
  it('rejects a zero-minute slot interval', () => {
    expect(() => validateAvailabilityInput({
      dayStartMs: 0,
      dayEndMs: 100,
      intervalMinutes: 0,
      serviceMinutes: 30,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      minimumStartMs: 0,
      busy: [],
    })).toThrow(expect.objectContaining({ code: 'INVALID_INTERVAL' }));
  });

  it('rejects a service that crosses a local calendar day', () => {
    const startMs = Date.parse('2026-09-01T15:30:00.000Z');
    const endMs = Date.parse('2026-09-01T16:30:00.000Z');

    expect(() => assertSameStoreDay(startMs, endMs, 'Asia/Shanghai'))
      .toThrow(expect.objectContaining({ code: 'CROSS_DAY_SERVICE' }));
  });
});
