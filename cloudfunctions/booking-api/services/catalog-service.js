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

    async listPortfolio(storeId) {
      assertStoreId(storeId);
      const items = await repository.listPublishedPortfolio(storeId);
      return items.map((item) => pickDefined(item, PORTFOLIO_PUBLIC_FIELDS));
    },

    async listServices(storeId) {
      assertStoreId(storeId);
      const services = await repository.listPublishedServices(storeId);
      return services.map((service) => pickDefined(service, SERVICE_PUBLIC_FIELDS));
    },
  };
}

module.exports = {
  createCatalogService,
  pickDefined,
};
