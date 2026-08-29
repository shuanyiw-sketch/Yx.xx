const { createBookingService } = require('../services/booking-service');
const { MemoryRepository } = require('../repositories/memory-repository');

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function createFixture(overrides = {}) {
  const repository = new MemoryRepository({
    availabilityWindows: overrides.availabilityWindows || [{
      storeId: 'store-1',
      dayStartMs: 0,
      dayEndMs: 12 * HOUR,
      intervalMinutes: 30,
    }],
    bookings: overrides.bookings || [],
    services: [{
      id: 'service-1',
      storeId: 'store-1',
      status: 'published',
      name: '双人写真',
      referencePriceFen: 129900,
      durationMinutes: 120,
      bufferBeforeMinutes: 30,
      bufferAfterMinutes: 30,
    }],
    scheduleExceptions: overrides.scheduleExceptions || [],
    stores: [{ id: 'store-1', name: '一瞬摄影', timezone: 'Asia/Shanghai' }],
  });
  return { repository, service: createBookingService(repository) };
}

const customerSession = {
  isOwner: false,
  storeId: null,
  userId: 'customer-1',
};

const ownerSession = {
  isOwner: true,
  storeId: 'store-1',
  userId: 'owner-1',
};

function validRequest(overrides = {}) {
  return {
    storeId: 'store-1',
    serviceId: 'service-1',
    startMs: 3 * HOUR,
    customer: { name: '林女士', phone: '13800000000' },
    location: '西湖边',
    peopleCount: 2,
    notes: '自然风格',
    requestId: 'request-1',
    nowMs: 0,
    ...overrides,
  };
}

describe('createBooking', () => {
  it('creates a 24-hour pending hold with a stable service snapshot', async () => {
    const { repository, service } = createFixture();

    const booking = await service.createBooking(validRequest(), customerSession);

    expect(booking).toMatchObject({
      status: 'pending',
      lockedUntil: DAY,
      customerUserId: 'customer-1',
      history: [{
        fromStatus: null,
        toStatus: 'pending',
        command: 'create',
        actorUserId: 'customer-1',
        atMs: 0,
      }],
      serviceSnapshot: {
        name: '双人写真',
        referencePriceFen: 129900,
        durationMinutes: 120,
        bufferBeforeMinutes: 30,
        bufferAfterMinutes: 30,
      },
    });
    expect(repository.notificationJobs).toHaveLength(1);
    expect(repository.notificationJobs[0]).toMatchObject({
      attempts: 0,
      nextAttemptAtMs: 0,
      status: 'pending',
      type: 'booking_created',
    });
  });

  it('returns the original booking for a repeated request id', async () => {
    const { repository, service } = createFixture();

    const first = await service.createBooking(validRequest(), customerSession);
    const second = await service.createBooking(validRequest(), customerSession);

    expect(second.id).toBe(first.id);
    expect(repository.bookings).toHaveLength(1);
  });

  it('allows only one of two simultaneous requests for the same slot', async () => {
    const { repository, service } = createFixture();

    const results = await Promise.allSettled([
      service.createBooking(validRequest({ requestId: 'request-a' }), customerSession),
      service.createBooking(validRequest({ requestId: 'request-b' }), customerSession),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(results.find((result) => result.status === 'rejected').reason)
      .toMatchObject({ code: 'SLOT_TAKEN' });
    expect(repository.bookings).toHaveLength(1);
  });
});

describe('transitionBooking', () => {
  it('lets the owner confirm a pending booking', async () => {
    const { repository, service } = createFixture();
    const pending = await service.createBooking(validRequest(), customerSession);

    const confirmed = await service.transitionBooking({
      bookingId: pending.id,
      command: 'confirm',
      nowMs: HOUR,
    }, ownerSession);

    expect(confirmed.status).toBe('confirmed');
    expect(confirmed.history).toEqual([
      expect.objectContaining({ command: 'create', toStatus: 'pending' }),
      {
        fromStatus: 'pending',
        toStatus: 'confirmed',
        command: 'confirm',
        actorUserId: 'owner-1',
        atMs: HOUR,
      },
    ]);
    expect(repository.notificationJobs.at(-1)).toMatchObject({
      bookingId: pending.id,
      customerUserId: 'customer-1',
      type: 'booking_confirmed',
    });
  });

  it('queues a customer notification when the owner rejects a booking', async () => {
    const { repository, service } = createFixture();
    const pending = await service.createBooking(validRequest(), customerSession);

    await service.transitionBooking({
      bookingId: pending.id,
      command: 'reject',
      nowMs: HOUR,
    }, ownerSession);

    expect(repository.notificationJobs.at(-1)).toMatchObject({
      bookingId: pending.id,
      customerUserId: 'customer-1',
      type: 'booking_rejected',
    });
  });

  it('expires a stale hold instead of confirming it after the slot was rebooked', async () => {
    const { repository, service } = createFixture({
      availabilityWindows: [{
        storeId: 'store-1',
        dayStartMs: 0,
        dayEndMs: 48 * HOUR,
        intervalMinutes: 30,
      }],
    });
    const startMs = 30 * HOUR;
    const stale = await service.createBooking(validRequest({ startMs }), customerSession);

    const secondCustomer = { ...customerSession, userId: 'customer-2' };
    await service.createBooking(validRequest({
      startMs,
      requestId: 'request-2',
      nowMs: DAY + 1,
    }), secondCustomer);

    await expect(service.transitionBooking({
      bookingId: stale.id,
      command: 'confirm',
      nowMs: DAY + 2,
    }, ownerSession)).rejects.toMatchObject({ code: 'BOOKING_EXPIRED' });
    await expect(repository.getBooking(stale.id)).resolves.toMatchObject({ status: 'expired' });
    expect(repository.bookings.filter((booking) => booking.status === 'confirmed')).toHaveLength(0);
  });

  it('keeps the slot occupied while cancellation waits for owner approval', async () => {
    const { repository, service } = createFixture();
    const pending = await service.createBooking(validRequest(), customerSession);
    await service.transitionBooking({
      bookingId: pending.id,
      command: 'confirm',
      nowMs: HOUR,
    }, ownerSession);

    const requested = await service.transitionBooking({
      bookingId: pending.id,
      command: 'requestCancel',
      nowMs: 2 * HOUR,
    }, customerSession);

    expect(requested.status).toBe('cancel_requested');
    await expect(repository.findBlockingPeriods(
      'store-1',
      2 * HOUR,
      6 * HOUR,
      2 * HOUR,
    )).resolves.toHaveLength(1);
  });

  it('rejects a customer trying to confirm a booking', async () => {
    const { service } = createFixture();
    const pending = await service.createBooking(validRequest(), customerSession);

    await expect(service.transitionBooking({
      bookingId: pending.id,
      command: 'confirm',
      nowMs: HOUR,
    }, customerSession)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('returns the same result when an owner repeats a completed command', async () => {
    const { repository, service } = createFixture();
    const pending = await service.createBooking(validRequest(), customerSession);

    const first = await service.transitionBooking({
      bookingId: pending.id,
      command: 'confirm',
      nowMs: HOUR,
    }, ownerSession);
    const repeated = await service.transitionBooking({
      bookingId: pending.id,
      command: 'confirm',
      nowMs: 2 * HOUR,
    }, ownerSession);

    expect(repeated).toEqual(first);
    expect(repository.bookings).toHaveLength(1);
  });
});

describe('customer booking reads', () => {
  it('lists only the authenticated customer bookings', async () => {
    const { service } = createFixture({
      bookings: [
        { id: 'mine', customerUserId: 'customer-1', createdAtMs: 2 },
        { id: 'other', customerUserId: 'customer-2', createdAtMs: 3 },
      ],
    });

    await expect(service.listMine(customerSession)).resolves.toEqual([
      expect.objectContaining({ id: 'mine' }),
    ]);
    await expect(service.getMine('other', customerSession)).rejects.toMatchObject({
      code: 'BOOKING_NOT_FOUND',
    });
  });

  it('calculates public slots from server-side service duration and busy periods', async () => {
    const { service } = createFixture({
      bookings: [{
        id: 'busy',
        storeId: 'store-1',
        status: 'confirmed',
        occupiedStartMs: 2.5 * HOUR,
        occupiedEndMs: 5.5 * HOUR,
      }],
    });

    const slots = await service.listAvailableSlots({
      storeId: 'store-1',
      serviceId: 'service-1',
      dayStartMs: 0,
      dayEndMs: 12 * HOUR,
      nowMs: 0,
    });

    expect(slots.some((slot) => slot.startMs === 3 * HOUR)).toBe(false);
    expect(slots.some((slot) => slot.startMs === 6 * HOUR)).toBe(true);
  });

  it('turns an owner weekly rule into real slots without pre-generated windows', async () => {
    const { repository, service } = createFixture();
    repository.availabilityWindows = [];
    repository.availabilityRules = [{
      id: 'rule-1',
      storeId: 'store-1',
      weekday: 4,
      intervals: [{ startMinute: 540, endMinute: 1080 }],
      intervalMinutes: 30,
    }];
    const localDayStart = -8 * HOUR;

    const slots = await service.listAvailableSlots({
      storeId: 'store-1',
      serviceId: 'service-1',
      dayStartMs: localDayStart,
      dayEndMs: localDayStart + DAY,
      nowMs: 0,
    });

    expect(slots.some((slot) => slot.startMs === 2 * HOUR)).toBe(true);
  });

  it('adds overtime exceptions as availability outside normal windows', async () => {
    const { service } = createFixture({
      scheduleExceptions: [{
        id: 'overtime-1', storeId: 'store-1', startMs: 12 * HOUR,
        endMs: 18 * HOUR, type: 'overtime', intervalMinutes: 30,
      }],
    });

    const slots = await service.listAvailableSlots({
      storeId: 'store-1', serviceId: 'service-1',
      dayStartMs: 0, dayEndMs: 20 * HOUR, nowMs: 0,
    });

    expect(slots.some((slot) => slot.startMs === 13 * HOUR)).toBe(true);
  });

  it.each(['blocked', 'offline_booking'])('%s exceptions remove overlapping slots', async (type) => {
    const { service } = createFixture({
      scheduleExceptions: [{
        id: `${type}-1`, storeId: 'store-1', startMs: 2.5 * HOUR,
        endMs: 5.5 * HOUR, type,
      }],
    });

    const slots = await service.listAvailableSlots({
      storeId: 'store-1', serviceId: 'service-1',
      dayStartMs: 0, dayEndMs: 12 * HOUR, nowMs: 0,
    });
    expect(slots.some((slot) => slot.startMs === 3 * HOUR)).toBe(false);
  });
});

describe('createBooking validation', () => {
  it('normalizes customer text fields before persistence', async () => {
    const { service } = createFixture();
    const booking = await service.createBooking(validRequest({
      customer: { name: '  林女士  ', phone: '13800000000' },
      location: '  西湖边  ',
      notes: '  自然风格  ',
    }), customerSession);
    expect(booking).toMatchObject({
      customer: { name: '林女士', phone: '13800000000' },
      location: '西湖边',
      notes: '自然风格',
    });
  });

  it.each([
    ['non-string customer name', { customer: { name: {}, phone: '13800000000' } }, 'INVALID_CUSTOMER'],
    ['invalid phone', { customer: { name: '林女士', phone: '123' } }, 'INVALID_CUSTOMER'],
    ['oversized location', { location: '地'.repeat(201) }, 'INVALID_LOCATION'],
    ['oversized notes', { notes: '字'.repeat(501) }, 'INVALID_NOTES'],
    ['non-positive people count', { peopleCount: 0 }, 'INVALID_PEOPLE_COUNT'],
    ['fractional people count', { peopleCount: 1.5 }, 'INVALID_PEOPLE_COUNT'],
  ])('rejects %s', async (_label, overrides, code) => {
    const { service } = createFixture();
    await expect(service.createBooking(validRequest(overrides), customerSession))
      .rejects.toMatchObject({ code });
  });

  it('rejects a start time that is not aligned to the store slot interval', async () => {
    const { service } = createFixture();
    await expect(service.createBooking(validRequest({ startMs: 3 * HOUR + 1 }), customerSession))
      .rejects.toMatchObject({ code: 'INVALID_SLOT_GRANULARITY' });
  });

  it('rejects a service that crosses midnight in the store timezone', async () => {
    const { service } = createFixture({
      availabilityWindows: [{
        storeId: 'store-1', dayStartMs: 0, dayEndMs: 48 * HOUR, intervalMinutes: 30,
      }],
    });
    await expect(service.createBooking(validRequest({ startMs: 15 * HOUR }), customerSession))
      .rejects.toMatchObject({ code: 'CROSS_DAY_SERVICE' });
  });
});
