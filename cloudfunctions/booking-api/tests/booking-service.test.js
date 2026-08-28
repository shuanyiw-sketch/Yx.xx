const { createBookingService } = require('../services/booking-service');
const { MemoryRepository } = require('../repositories/memory-repository');

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function createFixture(overrides = {}) {
  const repository = new MemoryRepository({
    availabilityWindows: [{
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
      serviceSnapshot: {
        name: '双人写真',
        referencePriceFen: 129900,
        durationMinutes: 120,
        bufferBeforeMinutes: 30,
        bufferAfterMinutes: 30,
      },
    });
    expect(repository.notificationJobs).toHaveLength(1);
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
    const { service } = createFixture();
    const pending = await service.createBooking(validRequest(), customerSession);

    const confirmed = await service.transitionBooking({
      bookingId: pending.id,
      command: 'confirm',
      nowMs: HOUR,
    }, ownerSession);

    expect(confirmed.status).toBe('confirmed');
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
