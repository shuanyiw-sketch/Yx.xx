const { callApi } = require('../../api/cloud-api');

function displayService(service) {
  return {
    ...service,
    priceYuan: (service.referencePriceFen / 100).toFixed(0),
  };
}

Page({
  data: {
    errorMessage: '',
    loading: true,
    services: [],
    store: null,
  },

  onLoad(options) {
    this.storeId = options.storeId || getApp().globalData.storeId;
    this.loadServices();
  },

  async loadServices() {
    if (!this.storeId) {
      this.setData({ errorMessage: '请先配置经营者主页', loading: false });
      return;
    }
    try {
      const [store, services] = await Promise.all([
        callApi('catalog.getStore', { storeId: this.storeId }),
        callApi('catalog.listServices', { storeId: this.storeId }),
      ]);
      this.setData({ store, services: services.map(displayService) });
    } catch (error) {
      this.setData({ errorMessage: error.message });
    } finally {
      this.setData({ loading: false });
    }
  },

  book(event) {
    wx.navigateTo({
      url: `/pages/booking-create/index?serviceId=${encodeURIComponent(event.detail.serviceId)}`,
    });
  },
});
