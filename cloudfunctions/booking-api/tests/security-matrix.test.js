const { ACTIONS, route } = require('../router');
const { MemoryRepository } = require('../repositories/memory-repository');

const EXPECTED_ACCESS = {
  'session.get': 'session',
  'catalog.getStore': 'public',
  'catalog.listPortfolio': 'public',
  'catalog.getPortfolioItem': 'public',
  'catalog.listServices': 'public',
  'catalog.getService': 'public',
  'availability.listSlots': 'public',
  'favorite.toggle': 'authenticated',
  'favorite.listMine': 'authenticated',
  'booking.create': 'authenticated',
  'booking.command': 'authenticated',
  'booking.listMine': 'authenticated',
  'booking.getMine': 'authenticated',
  'admin.dashboard.get': 'owner',
  'admin.booking.command': 'owner',
  'admin.booking.recordReceipt': 'owner',
  'admin.service.save': 'owner',
  'admin.service.unpublish': 'owner',
  'admin.portfolio.save': 'owner',
  'admin.portfolio.publish': 'owner',
  'admin.portfolio.reorder': 'owner',
  'admin.schedule.saveRule': 'owner',
  'admin.schedule.saveException': 'owner',
  'admin.customer.list': 'owner',
  'admin.customer.get': 'owner',
  'admin.store.save': 'owner',
};

function inertServices() {
  const noop = async () => null;
  return new Proxy({}, {
    get: () => new Proxy({}, { get: () => noop }),
  });
}

describe('router security matrix', () => {
  it('classifies every allowlisted action explicitly', () => {
    expect(Object.fromEntries(Object.entries(ACTIONS).map(([name, value]) => (
      [name, value.access]
    )))).toEqual(EXPECTED_ACCESS);
  });

  it.each(Object.entries(EXPECTED_ACCESS).filter(([, access]) => access === 'authenticated'))(
    'rejects anonymous access to %s',
    async (action) => {
      const result = await route({ action, payload: { storeId: 'store-1' } }, {
        repository: new MemoryRepository(),
        services: inertServices(),
      });
      expect(result).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });
    },
  );

  it.each(Object.entries(EXPECTED_ACCESS).filter(([, access]) => access === 'owner'))(
    'rejects a different-store owner from %s',
    async (action) => {
      const result = await route({
        action,
        openId: 'owner-other',
        payload: { storeId: 'store-1' },
      }, {
        repository: new MemoryRepository({
          sessions: [{
            openId: 'owner-other',
            userId: 'owner-2',
            isOwner: true,
            storeId: 'store-2',
          }],
        }),
        services: inertServices(),
      });
      expect(result).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    },
  );
});
