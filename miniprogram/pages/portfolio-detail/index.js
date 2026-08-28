const { callApi } = require('../../api/cloud-api');

function openLinkedService(serviceId) {
  wx.navigateTo({
    url: `/pages/booking-create/index?serviceId=${encodeURIComponent(serviceId)}`,
  });
}

function displayService(service) {
  return {
    ...service,
    priceYuan: (service.referencePriceFen / 100).toFixed(0),
  };
}

Page({
  data: {
    errorMessage: '',
    favorited: false,
    item: null,
    linkedServices: [],
    loading: true,
  },

  onLoad(options) {
    this.portfolioItemId = options.id;
    this.loadDetail();
  },

  async loadDetail() {
    try {
      const item = await callApi('catalog.getPortfolioItem', {
        portfolioItemId: this.portfolioItemId,
      });
      const services = await Promise.all((item.serviceIds || []).map((serviceId) => (
        callApi('catalog.getService', { storeId: item.storeId, serviceId })
      )));
      this.setData({ item, linkedServices: services.map(displayService) });
    } catch (error) {
      this.setData({ errorMessage: error.message });
    } finally {
      this.setData({ loading: false });
    }
  },

  book(event) {
    openLinkedService(event.detail.serviceId);
  },

  async toggleFavorite() {
    try {
      const result = await callApi('favorite.toggle', {
        portfolioItemId: this.portfolioItemId,
      });
      this.setData({ favorited: result.favorited });
      wx.showToast({ title: result.favorited ? '已收藏' : '已取消收藏', icon: 'none' });
    } catch (error) {
      wx.showToast({ title: error.message, icon: 'none' });
    }
  },
});
