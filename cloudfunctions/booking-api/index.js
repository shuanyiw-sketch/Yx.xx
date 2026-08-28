const cloud = require('wx-server-sdk');
const { createCloudbaseRepository } = require('./repositories/cloudbase-repository');
const { createCatalogService } = require('./services/catalog-service');
const { createBookingService } = require('./services/booking-service');
const { route } = require('./router');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const repository = createCloudbaseRepository(cloud.database());

exports.main = async (event) => {
  const { OPENID: openId } = cloud.getWXContext();
  return route({
    action: event.action,
    openId,
    payload: event.payload || {},
  }, {
    repository,
    services: {
      booking: createBookingService(repository),
      catalog: createCatalogService(repository),
    },
  });
};
