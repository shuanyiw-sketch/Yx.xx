const {
  deliverNotificationJobs,
  enqueueUpcomingReminders,
  expirePendingBookings,
} = require('../jobs');
const { MemoryRepository } = require('../../booking-api/repositories/memory-repository');

function booking(overrides = {}) {
  return {
    id: 'booking-1',
    storeId: 'store-1',
    customerUserId: 'customer-1',
    startMs: 10_000,
    endMs: 20_000,
    occupiedStartMs: 9_000,
    occupiedEndMs: 21_000,
    status: 'confirmed',
    ...overrides,
  };
}

describe('expirePendingBookings', () => {
  it('expires only pending bookings whose hold has passed', async () => {
    const repository = new MemoryRepository({
      bookings: [
        booking({ id: 'expired-one', status: 'pending', lockedUntil: 999 }),
        booking({ id: 'future-one', status: 'pending', lockedUntil: 1001 }),
        booking({ id: 'confirmed-one', status: 'confirmed', lockedUntil: 999 }),
      ],
    });

    const count = await expirePendingBookings(repository, 1000);

    expect(count).toBe(1);
    await expect(repository.getBooking('expired-one')).resolves.toMatchObject({
      status: 'expired',
      expiredAtMs: 1000,
    });
    await expect(repository.getBooking('future-one')).resolves.toMatchObject({ status: 'pending' });
    await expect(repository.getBooking('confirmed-one')).resolves.toMatchObject({
      status: 'confirmed',
    });
  });
});

describe('enqueueUpcomingReminders', () => {
  it('creates each reminder once even when the scheduler window repeats', async () => {
    const repository = new MemoryRepository({
      bookings: [booking()],
    });

    const first = await enqueueUpcomingReminders(repository, 9_000, 11_000);
    const repeated = await enqueueUpcomingReminders(repository, 9_000, 11_000);

    expect(first).toBe(1);
    expect(repeated).toBe(0);
    expect(repository.notificationJobs).toHaveLength(1);
    expect(repository.notificationJobs[0]).toMatchObject({
      bookingId: 'booking-1',
      idempotencyKey: 'booking-1:upcoming:10000',
      status: 'pending',
      type: 'upcoming',
    });
  });
});

describe('deliverNotificationJobs', () => {
  it('marks a delivered job as sent', async () => {
    const repository = new MemoryRepository({
      notificationJobs: [{
        id: 'job-1',
        bookingId: 'booking-1',
        status: 'pending',
        attempts: 0,
        nextAttemptAtMs: 0,
      }],
    });
    const sender = vi.fn().mockResolvedValue({ messageId: 'message-1' });

    const result = await deliverNotificationJobs(repository, sender, 1000);

    expect(result).toEqual({ sent: 1, failed: 0 });
    expect(repository.notificationJobs[0]).toMatchObject({
      status: 'sent',
      sentAtMs: 1000,
      attempts: 1,
    });
  });

  it('retries a temporary failure at most three times', async () => {
    const repository = new MemoryRepository({
      notificationJobs: [{
        id: 'job-1',
        bookingId: 'booking-1',
        status: 'retry',
        attempts: 2,
        nextAttemptAtMs: 0,
      }],
    });
    const sender = vi.fn().mockRejectedValue(Object.assign(new Error('timeout'), {
      code: 'ETIMEDOUT',
    }));

    const result = await deliverNotificationJobs(repository, sender, 1000);

    expect(result).toEqual({ sent: 0, failed: 1 });
    expect(repository.notificationJobs[0]).toMatchObject({ status: 'failed', attempts: 3 });
  });

  it('records a terminal refusal without changing its booking', async () => {
    const original = booking({ id: 'booking-1' });
    const repository = new MemoryRepository({
      bookings: [original],
      notificationJobs: [{
        id: 'job-1',
        bookingId: 'booking-1',
        status: 'pending',
        attempts: 0,
        nextAttemptAtMs: 0,
      }],
    });
    const sender = vi.fn().mockRejectedValue(Object.assign(new Error('refused'), { code: 43101 }));

    const result = await deliverNotificationJobs(repository, sender, 1000);

    expect(result).toEqual({ sent: 0, failed: 1 });
    expect(repository.notificationJobs[0]).toMatchObject({ status: 'failed', attempts: 1 });
    await expect(repository.getBooking('booking-1')).resolves.toEqual(original);
  });
});
