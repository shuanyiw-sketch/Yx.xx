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
  it('lists an owner\'s published and draft portfolio items for publishing', async () => {
    const { admin, repository } = createFixture();
    repository.portfolio.push(
      { id: 'published-work', storeId: 'store-1', status: 'published', title: '已发布作品' },
      { id: 'draft-work', storeId: 'store-1', status: 'draft', title: '待发布草稿' },
      { id: 'other-draft', storeId: 'store-2', status: 'draft', title: '其他店铺草稿' },
    );

    await expect(admin.listPortfolio('store-1', owner)).resolves.toEqual([
      { id: 'published-work', storeId: 'store-1', status: 'published', title: '已发布作品' },
      { id: 'draft-work', storeId: 'store-1', status: 'draft', title: '待发布草稿' },
    ]);
    await expect(admin.listPortfolio('store-1', otherOwner)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

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
  it('rejects unsupported schedule exception types', async () => {
    const { schedule } = createFixture();
    await expect(schedule.saveException({
      storeId: 'store-1', startMs: 100, endMs: 200, type: 'mystery',
    }, owner)).rejects.toMatchObject({ code: 'INVALID_EXCEPTION_TYPE' });
  });

  it('lists only the owner store\'s schedule exceptions', async () => {
    const { repository, schedule } = createFixture();
    repository.scheduleExceptions.push(
      { id: 'exception-1', storeId: 'store-1', startMs: 100, endMs: 200, type: 'blocked' },
      { id: 'exception-2', storeId: 'store-2', startMs: 300, endMs: 400, type: 'offline' },
    );

    await expect(schedule.listExceptions('store-1', owner)).resolves.toEqual([
      { id: 'exception-1', storeId: 'store-1', startMs: 100, endMs: 200, type: 'blocked' },
    ]);
    await expect(schedule.listExceptions('store-1', otherOwner)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

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
