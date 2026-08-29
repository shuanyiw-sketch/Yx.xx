const { requireAuthenticated, requireOwner } = require('./auth');
const { domainError } = require('./domain/validation');

const CUSTOMER_BOOKING_FIELDS = [
  'id',
  'storeId',
  'serviceId',
  'customer',
  'location',
  'peopleCount',
  'notes',
  'startMs',
  'endMs',
  'status',
  'history',
  'lockedUntil',
  'serviceSnapshot',
  'createdAtMs',
  'updatedAtMs',
];

const OWNER_BOOKING_FIELDS = [
  ...CUSTOMER_BOOKING_FIELDS,
  'customerUserId',
  'occupiedStartMs',
  'occupiedEndMs',
  'lastCommand',
  'ownerNote',
  'receipts',
  'receivedTotalFen',
];

function pickDefined(record, fields) {
  if (!record || typeof record !== 'object') return record;
  return Object.fromEntries(fields
    .filter((field) => record[field] !== undefined)
    .map((field) => [field, record[field]]));
}

function filterBooking(data, fields) {
  return Array.isArray(data)
    ? data.map((booking) => pickDefined(booking, fields))
    : pickDefined(data, fields);
}

function filterResponse(action, data, session) {
  if (data === null || data === undefined) return data;
  if (['booking.create', 'booking.listMine', 'booking.getMine'].includes(action)) {
    return filterBooking(data, CUSTOMER_BOOKING_FIELDS);
  }
  if (action === 'booking.command') {
    return filterBooking(data, session?.isOwner ? OWNER_BOOKING_FIELDS : CUSTOMER_BOOKING_FIELDS);
  }
  if (['admin.booking.command', 'admin.booking.recordReceipt'].includes(action)) {
    return filterBooking(data, OWNER_BOOKING_FIELDS);
  }
  if (action === 'admin.dashboard.get') {
    return {
      ...data,
      bookings: filterBooking(data?.bookings || [], OWNER_BOOKING_FIELDS),
    };
  }
  if (action === 'admin.customer.get') {
    return {
      ...data,
      bookings: filterBooking(data?.bookings || [], OWNER_BOOKING_FIELDS),
    };
  }
  return data;
}

const ACTIONS = {
  'session.get': {
    access: 'session',
    execute: ({ openId, services }) => services.catalog.getSession(openId),
  },
  'catalog.getStore': {
    access: 'public',
    execute: ({ payload, services }) => services.catalog.getStore(payload.storeId),
  },
  'catalog.listPortfolio': {
    access: 'public',
    execute: ({ payload, services }) => services.catalog.listPortfolio(payload.storeId, {
      afterSortOrder: payload.afterSortOrder,
      limit: payload.limit,
    }),
  },
  'catalog.getPortfolioItem': {
    access: 'public',
    execute: ({ payload, services }) => services.catalog.getPortfolioItem(payload.portfolioItemId),
  },
  'catalog.listServices': {
    access: 'public',
    execute: ({ payload, services }) => services.catalog.listServices(payload.storeId),
  },
  'catalog.getService': {
    access: 'public',
    execute: ({ payload, services }) => services.catalog.getService(
      payload.storeId,
      payload.serviceId,
    ),
  },
  'favorite.toggle': {
    access: 'authenticated',
    execute: ({ payload, services, session }) => services.catalog.toggleFavorite(
      payload.portfolioItemId,
      session,
    ),
  },
  'favorite.listMine': {
    access: 'authenticated',
    execute: ({ services, session }) => services.catalog.listFavorites(session),
  },
  'admin.service.save': {
    access: 'owner',
    execute: ({ payload, services, session }) => services.admin.saveService(payload, session),
  },
  'admin.dashboard.get': {
    access: 'owner',
    execute: ({ payload, services, session }) => services.admin.getDashboard(
      payload.storeId,
      session,
    ),
  },
  'admin.booking.command': {
    access: 'owner',
    execute: ({ payload, services, session }) => services.admin.commandBooking({
      ...payload,
      nowMs: Date.now(),
    }, session),
  },
  'admin.booking.recordReceipt': {
    access: 'owner',
    execute: ({ payload, services, session }) => services.admin.recordReceipt({
      ...payload,
      nowMs: Date.now(),
    }, session),
  },
  'admin.service.unpublish': {
    access: 'owner',
    execute: ({ payload, services, session }) => services.admin.unpublishService(payload, session),
  },
  'admin.portfolio.save': {
    access: 'owner',
    execute: ({ payload, services, session }) => services.admin.savePortfolio(payload, session),
  },
  'admin.portfolio.publish': {
    access: 'owner',
    execute: ({ payload, services, session }) => services.admin.publishPortfolio(payload, session),
  },
  'admin.portfolio.list': {
    access: 'owner',
    execute: ({ payload, services, session }) => services.admin.listPortfolio(payload.storeId, session),
  },
  'admin.portfolio.reorder': {
    access: 'owner',
    execute: ({ payload, services, session }) => services.admin.reorderPortfolio(payload, session),
  },
  'admin.schedule.saveRule': {
    access: 'owner',
    execute: ({ payload, services, session }) => services.schedule.saveRule(payload, session),
  },
  'admin.schedule.saveException': {
    access: 'owner',
    execute: ({ payload, services, session }) => services.schedule.saveException(payload, session),
  },
  'admin.schedule.listExceptions': {
    access: 'owner',
    execute: ({ payload, services, session }) => services.schedule.listExceptions(
      payload.storeId,
      session,
    ),
  },
  'admin.customer.list': {
    access: 'owner',
    execute: ({ payload, services, session }) => services.admin.listCustomers(
      payload.storeId,
      session,
    ),
  },
  'admin.customer.get': {
    access: 'owner',
    execute: ({ payload, services, session }) => services.admin.getCustomer(payload, session),
  },
  'admin.store.save': {
    access: 'owner',
    execute: ({ payload, services, session }) => services.admin.saveStore(payload, session),
  },
  'booking.create': {
    access: 'authenticated',
    execute: ({ payload, services, session }) => services.booking.createBooking({
      ...payload,
      nowMs: Date.now(),
    }, session),
  },
  'booking.command': {
    access: 'authenticated',
    execute: ({ payload, services, session }) => services.booking.transitionBooking({
      ...payload,
      nowMs: Date.now(),
    }, session),
  },
  'booking.listMine': {
    access: 'authenticated',
    execute: ({ services, session }) => services.booking.listMine(session),
  },
  'booking.getMine': {
    access: 'authenticated',
    execute: ({ payload, services, session }) => services.booking.getMine(
      payload.bookingId,
      session,
    ),
  },
  'availability.listSlots': {
    access: 'public',
    execute: ({ payload, services }) => services.booking.listAvailableSlots({
      ...payload,
      nowMs: Date.now(),
    }),
  },
};

function publicFailure(error) {
  return {
    ok: false,
    error: {
      code: error.code || 'INTERNAL',
      message: error.publicMessage || '请求失败，请稍后重试',
    },
  };
}

async function route(request, dependencies) {
  try {
    const definition = ACTIONS[request?.action];
    if (!definition) {
      throw domainError('UNKNOWN_ACTION', '不支持的操作');
    }

    let session = null;
    if (definition.access === 'owner' || definition.access === 'authenticated') {
      session = await dependencies.repository.getSession(request.openId);
      if (definition.access === 'owner') {
        requireOwner(session, request.payload?.storeId);
      } else {
        requireAuthenticated(session);
      }
    }
    if (definition.access === 'session' && !request.openId) {
      throw domainError('UNAUTHENTICATED', '请先登录');
    }

    const data = await definition.execute({
      openId: request.openId,
      payload: request.payload || {},
      services: dependencies.services,
      session,
    });
    return { ok: true, data: filterResponse(request.action, data, session) };
  } catch (error) {
    return publicFailure(error);
  }
}

module.exports = {
  ACTIONS,
  CUSTOMER_BOOKING_FIELDS,
  OWNER_BOOKING_FIELDS,
  filterResponse,
  publicFailure,
  route,
};
