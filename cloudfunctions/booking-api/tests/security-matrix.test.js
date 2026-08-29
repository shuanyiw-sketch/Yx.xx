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
  'admin.portfolio.list': 'owner',
  'admin.portfolio.reorder': 'owner',
  'admin.schedule.saveRule': 'owner',
  'admin.schedule.saveException': 'owner',
  'admin.schedule.listExceptions': 'owner',
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

const ROLES = {
  anonymous: { openId: undefined },
  customer: { openId: 'customer-openid' },
  sameStoreOwner: { openId: 'same-store-owner-openid' },
  differentStoreOwner: { openId: 'different-store-owner-openid' },
};

const EXPECTED_RESULT = {
  session: {
    anonymous: 'UNAUTHENTICATED',
    customer: 'ok',
    sameStoreOwner: 'ok',
    differentStoreOwner: 'ok',
  },
  public: {
    anonymous: 'ok',
    customer: 'ok',
    sameStoreOwner: 'ok',
    differentStoreOwner: 'ok',
  },
  authenticated: {
    anonymous: 'UNAUTHENTICATED',
    customer: 'ok',
    sameStoreOwner: 'ok',
    differentStoreOwner: 'ok',
  },
  owner: {
    anonymous: 'UNAUTHENTICATED',
    customer: 'FORBIDDEN',
    sameStoreOwner: 'ok',
    differentStoreOwner: 'FORBIDDEN',
  },
};

function securityRepository() {
  return new MemoryRepository({
    sessions: [
      { openId: 'customer-openid', userId: 'customer-1', isOwner: false, storeId: null },
      {
        openId: 'same-store-owner-openid', userId: 'owner-1', isOwner: true, storeId: 'store-1',
      },
      {
        openId: 'different-store-owner-openid', userId: 'owner-2', isOwner: true, storeId: 'store-2',
      },
    ],
  });
}

function requestFor(action, role) {
  return {
    action,
    openId: ROLES[role].openId,
    payload: { storeId: 'store-1' },
  };
}

describe('router security matrix', () => {
  it('classifies every allowlisted action explicitly', () => {
    expect(Object.fromEntries(Object.entries(ACTIONS).map(([name, value]) => (
      [name, value.access]
    )))).toEqual(EXPECTED_ACCESS);
  });

  it.each(Object.entries(EXPECTED_ACCESS).flatMap(([action, access]) => (
    Object.keys(ROLES).map((role) => [action, access, role, EXPECTED_RESULT[access][role]])
  )))('enforces %s access for %s (%s)', async (action, _access, role, expected) => {
    const result = await route(requestFor(action, role), {
      repository: securityRepository(),
      services: inertServices(),
    });

    if (expected === 'ok') {
      expect(result).toEqual({ ok: true, data: null });
    } else {
      expect(result).toMatchObject({ ok: false, error: { code: expected } });
    }
  });

  it('does not disclose owner-only booking fields to the booking customer', async () => {
    const booking = {
      id: 'booking-1',
      storeId: 'store-1',
      serviceId: 'service-1',
      customerUserId: 'customer-1',
      customer: { name: '林女士', phone: '13800000000' },
      location: '西湖边',
      notes: '自然风格',
      startMs: 100,
      endMs: 200,
      status: 'confirmed',
      history: [{ command: 'confirm', atMs: 90 }],
      ownerNote: '客户偏好胶片风格',
      receipts: [{ amountFen: 30000, type: 'deposit' }],
      receivedTotalFen: 30000,
      internalDispatchId: 'dispatch-private',
    };
    const result = await route(requestFor('booking.getMine', 'customer'), {
      repository: securityRepository(),
      services: {
        booking: { getMine: async () => booking },
      },
    });

    expect(result).toEqual({
      ok: true,
      data: {
        id: 'booking-1',
        storeId: 'store-1',
        serviceId: 'service-1',
        customer: { name: '林女士', phone: '13800000000' },
        location: '西湖边',
        notes: '自然风格',
        startMs: 100,
        endMs: 200,
        status: 'confirmed',
        history: [{ command: 'confirm', atMs: 90 }],
      },
    });
  });

  it('keeps owner booking fields while filtering fields outside the owner response contract', async () => {
    const booking = {
      id: 'booking-1',
      storeId: 'store-1',
      serviceId: 'service-1',
      customerUserId: 'customer-1',
      customer: { name: '林女士', phone: '13800000000' },
      status: 'confirmed',
      history: [{ command: 'confirm', atMs: 90 }],
      ownerNote: '客户偏好胶片风格',
      receipts: [{ amountFen: 30000, type: 'deposit' }],
      receivedTotalFen: 30000,
      internalDispatchId: 'dispatch-private',
    };
    const result = await route(requestFor('admin.dashboard.get', 'sameStoreOwner'), {
      repository: securityRepository(),
      services: {
        admin: { getDashboard: async () => ({ bookings: [booking] }) },
      },
    });

    expect(result).toEqual({
      ok: true,
      data: {
        bookings: [{
          id: 'booking-1',
          storeId: 'store-1',
          serviceId: 'service-1',
          customerUserId: 'customer-1',
          customer: { name: '林女士', phone: '13800000000' },
          status: 'confirmed',
          history: [{ command: 'confirm', atMs: 90 }],
          ownerNote: '客户偏好胶片风格',
          receipts: [{ amountFen: 30000, type: 'deposit' }],
          receivedTotalFen: 30000,
        }],
      },
    });
  });
});
