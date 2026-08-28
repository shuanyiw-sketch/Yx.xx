const { createAdminService } = require('../services/admin-service');
const { createScheduleService } = require('../services/schedule-service');
const { MemoryRepository } = require('../repositories/memory-repository');

const owner = { isOwner: true, storeId: 'store-1', userId: 'owner-1' };
const otherOwner = { isOwner: true, storeId: 'store-2', userId: 'owner-2' };

function createFixture() {
  const repository = new MemoryRepository({
    bookings: [{
      id: 'booking-1',
      storeId: 'store-1',
      customerUserId: 'customer-1',
      status: 'confirmed',
      serviceSnapshot: { name: '旧版写真', referencePriceFen: 100000 },
      receipts: [],
    }],
    services: [{
      id: 'service-1',
      storeId: 'store-1',
      status: 'published',
      name: '写真',
      durationMinutes: 120,
      bufferBeforeMinutes: 30,
      bufferAfterMinutes: 30,
    }],
    stores: [{ id: 'store-1', name: '一瞬摄影' }],
  });
  return {
    admin: createAdminService(repository),
    repository,
    schedule: createScheduleService(repository),
  };
}

describe('admin service authorization and snapshots', () => {
  it('rejects every mutation for a different store', async () => {
    const { admin } = createFixture();

    await expect(admin.saveService({
      storeId: 'store-1',
      name: '写真',
      durationMinutes: 120,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
    }, otherOwner)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('unpublishes a service without changing booking snapshots', async () => {
    const { admin, repository } = createFixture();

    await admin.unpublishService({ storeId: 'store-1', serviceId: 'service-1' }, owner);

    await expect(repository.getService('service-1')).resolves.toMatchObject({
      status: 'unpublished',
    });
    await expect(repository.getBooking('booking-1')).resolves.toMatchObject({
      serviceSnapshot: { name: '旧版写真' },
    });
  });

  it('records deposit and final receipts as append-only entries', async () => {
    const { admin } = createFixture();

    await admin.recordReceipt({
      storeId: 'store-1',
      bookingId: 'booking-1',
      amountFen: 30000,
      type: 'deposit',
      receivedAtMs: 100,
      note: '微信线下收款',
    }, owner);
    const booking = await admin.recordReceipt({
      storeId: 'store-1',
      bookingId: 'booking-1',
      amountFen: 70000,
      type: 'final',
      receivedAtMs: 200,
      note: '',
    }, owner);

    expect(booking.receipts).toHaveLength(2);
    expect(booking.receivedTotalFen).toBe(100000);
  });
});

describe('schedule validation', () => {
  it('rejects overlapping weekly intervals', async () => {
    const { schedule } = createFixture();

    await expect(schedule.saveRule({
      storeId: 'store-1',
      weekday: 1,
      intervals: [
        { startMinute: 540, endMinute: 720 },
        { startMinute: 700, endMinute: 780 },
      ],
    }, owner)).rejects.toMatchObject({ code: 'OVERLAPPING_INTERVALS' });
  });
});
