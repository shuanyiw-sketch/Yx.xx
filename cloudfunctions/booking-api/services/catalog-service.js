const crypto = require('node:crypto');
const { requireAuthenticated } = require('../auth');
const { domainError } = require('../domain/validation');

const PORTFOLIO_PUBLIC_FIELDS = [
  'id',
  'storeId',
  'creatorId',
  'coverFileId',
  'imageFileIds',
  'title',
  'summary',
  'tags',
  'serviceIds',
  'status',
  'sortOrder',
];

const SERVICE_PUBLIC_FIELDS = [
  'id',
  'storeId',
  'name',
  'description',
  'referencePriceFen',
  'durationMinutes',
  'bufferBeforeMinutes',
  'bufferAfterMinutes',
  'status',
  'sortOrder',
];

const STORE_PUBLIC_FIELDS = [
  'id',
  'name',
  'introduction',
  'contactText',
  'bookingPolicy',
  'timezone',
];

function pickDefined(record, fields) {
  return Object.fromEntries(fields
    .filter((field) => record[field] !== undefined)
    .map((field) => [field, record[field]]));
}

function assertStoreId(storeId) {
  if (typeof storeId !== 'string' || !storeId.trim()) {
    throw domainError('INVALID_STORE', '店铺信息无效');
  }
}

function createCatalogService(repository) {
  return {
    async getSession(openId) {
      const session = await repository.getSession(openId);
      if (!session) return { isOwner: false, store: null, user: null };
      const store = session.storeId ? await repository.getStore(session.storeId) : null;
      return {
        isOwner: session.isOwner === true,
        store: store ? pickDefined(store, STORE_PUBLIC_FIELDS) : null,
        user: { id: session.userId },
      };
    },

    async getStore(storeId) {
      assertStoreId(storeId);
      const store = await repository.getStore(storeId);
      if (!store) throw domainError('STORE_NOT_FOUND', '店铺不存在');
      return pickDefined(store, STORE_PUBLIC_FIELDS);
    },

    async listPortfolio(storeId, options = {}) {
      assertStoreId(storeId);
      const query = {
        limit: Number.isInteger(options.limit) ? Math.min(Math.max(options.limit, 1), 30) : 20,
      };
      if (Number.isFinite(options.afterSortOrder)) {
        query.afterSortOrder = options.afterSortOrder;
      }
      const items = await repository.listPublishedPortfolio(storeId, query);
      return items.map((item) => pickDefined(item, PORTFOLIO_PUBLIC_FIELDS));
    },

    async getPortfolioItem(portfolioItemId) {
      const item = await repository.getPublishedPortfolioItem(portfolioItemId);
      if (!item) throw domainError('PORTFOLIO_NOT_FOUND', '作品不存在或已下架');
      return pickDefined(item, PORTFOLIO_PUBLIC_FIELDS);
    },

    async listServices(storeId) {
      assertStoreId(storeId);
      const services = await repository.listPublishedServices(storeId);
      return services.map((service) => pickDefined(service, SERVICE_PUBLIC_FIELDS));
    },

    async getService(storeId, serviceId) {
      assertStoreId(storeId);
      const service = await repository.getPublishedService(storeId, serviceId);
      if (!service) throw domainError('SERVICE_NOT_FOUND', '服务不存在或已下架');
      return pickDefined(service, SERVICE_PUBLIC_FIELDS);
    },

    async toggleFavorite(portfolioItemId, session) {
      requireAuthenticated(session);
      const item = await repository.getPublishedPortfolioItem(portfolioItemId);
      if (!item) throw domainError('PORTFOLIO_NOT_FOUND', '作品不存在或已下架');
      return repository.runTransaction(async (transaction) => {
        const existing = await transaction.getFavorite(session.userId, portfolioItemId);
        if (existing) {
          await transaction.deleteFavorite(existing.id);
          return { favorited: false };
        }
        const key = `${session.userId}:${portfolioItemId}`;
        await transaction.insertFavorite({
          id: `favorite-${crypto.createHash('sha256').update(key).digest('hex')}`,
          userId: session.userId,
          portfolioItemId,
          createdAtMs: Date.now(),
        });
        return { favorited: true };
      });
    },

    async listFavorites(session) {
      requireAuthenticated(session);
      const favorites = await repository.listFavoritesByUser(session.userId);
      const items = await Promise.all(favorites.map((favorite) => (
        repository.getPublishedPortfolioItem(favorite.portfolioItemId)
      )));
      return items.filter(Boolean).map((item) => pickDefined(item, PORTFOLIO_PUBLIC_FIELDS));
    },
  };
}

module.exports = {
  createCatalogService,
  pickDefined,
};
