const { route } = require('../router');
const { MemoryRepository } = require('../repositories/memory-repository');
const { createAdminService } = require('../services/admin-service');
const { createBookingService } = require('../services/booking-service');
const { createCatalogService } = require('../services/catalog-service');
const { createScheduleService } = require('../services/schedule-service');

const HOUR = 3_600_000;

function fixture() {
  const repository = new MemoryRepository({
    availabilityWindows: [{
      storeId: 'store-1', dayStartMs: 0, dayEndMs: 12 * HOUR, intervalMinutes: 30,
    }],
    portfolio: [{
      id: 'work-1', storeId: 'store-1', status: 'published', title: '湖边',
      serviceIds: ['service-1'], sortOrder: 1, ownerNote: '不可公开',
    }],
    services: [{
      id: 'service-1', storeId: 'store-1', status: 'published', name: '双人写真',
      referencePriceFen: 129900, durationMinutes: 120,
      bufferBeforeMinutes: 30, bufferAfterMinutes: 30,
    }],
    sessions: [
      { openId: 'customer-1', userId: 'customer-1', isOwner: false, storeId: null },
      { openId: 'customer-2', userId: 'customer-2', isOwner: false, storeId: null },
      { openId: 'owner-1', userId: 'owner-1', isOwner: true, storeId: 'store-1' },
    ],
    stores: [{ id: 'store-1', name: '一瞬摄影', timezone: 'Asia/Shanghai' }],
  });
  const services = {
    admin: createAdminService(repository),
    booking: createBookingService(repository),
    catalog: createCatalogService(repository),
    schedule: createScheduleService(repository),
  };
  const api = (openId) => async (action, payload = {}) => {
    const result = await route({ action, openId, payload }, { repository, services });
    if (!result.ok) throw Object.assign(new Error(result.error.message), result.error);
    return result.data;
  };
  return { customerApi: api('customer-1'), otherApi: api('customer-2'), ownerApi: api('owner-1') };
}

describe('portfolio-to-confirmed acceptance flow', () => {
  it('completes booking without leaking private catalog data', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(0);
    const { customerApi, otherApi, ownerApi } = fixture();

    const works = await customerApi('catalog.listPortfolio', { storeId: 'store-1' });
    expect(works[0]).not.toHaveProperty('ownerNote');
    const slots = await customerApi('availability.listSlots', {
      storeId: 'store-1', serviceId: works[0].serviceIds[0],
      dayStartMs: 0, dayEndMs: 12 * HOUR,
    });
    const slot = slots.find((candidate) => candidate.startMs === 3 * HOUR);
    const pending = await customerApi('booking.create', {
      storeId: 'store-1', serviceId: 'service-1', startMs: slot.startMs,
      customer: { name: '林女士', phone: '13800000000' },
      location: '西湖边', peopleCount: 2, notes: '自然风格', requestId: 'acceptance-1',
    });
    expect(pending.status).toBe('pending');

    await expect(otherApi('booking.getMine', { bookingId: pending.id }))
      .rejects.toMatchObject({ code: 'BOOKING_NOT_FOUND' });
    const confirmed = await ownerApi('admin.booking.command', {
      storeId: 'store-1', bookingId: pending.id, command: 'confirm',
    });
    expect(confirmed.status).toBe('confirmed');
  });
});
