const { requireAuthenticated, requireOwner } = require('./auth');
const { domainError } = require('./domain/validation');

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
    execute: ({ payload, services }) => services.catalog.listPortfolio(payload.storeId),
  },
  'catalog.listServices': {
    access: 'public',
    execute: ({ payload, services }) => services.catalog.listServices(payload.storeId),
  },
  'admin.service.save': {
    access: 'owner',
    execute: ({ payload, services, session }) => services.admin.saveService(payload, session),
  },
  'booking.create': {
    access: 'authenticated',
    execute: ({ payload, services, session }) => services.booking.createBooking(payload, session),
  },
  'booking.command': {
    access: 'authenticated',
    execute: ({ payload, services, session }) => services.booking.transitionBooking(payload, session),
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
    return { ok: true, data };
  } catch (error) {
    return publicFailure(error);
  }
}

module.exports = { ACTIONS, publicFailure, route };
