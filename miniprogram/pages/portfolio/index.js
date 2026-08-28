const { callApi } = require('../../api/cloud-api');

function openLinkedService(serviceId, navigateTo = wx.navigateTo) {
  navigateTo({
    url: `/pages/booking-create/index?serviceId=${encodeURIComponent(serviceId)}`,
  });
}

function shouldShowOwnerEntry(app) {
  return app?.globalData?.isOwner === true;
}

function splitPortfolioColumns(items) {
  return items.reduce((columns, item, index) => {
    (index % 2 === 0 ? columns.left : columns.right).push(item);
    return columns;
  }, { left: [], right: [] });
}

if (typeof Page === 'function') {
  Page({
    data: {
      errorMessage: '',
      left: [],
      loading: true,
      loadingMore: false,
      hasMore: true,
      ownerEntryVisible: false,
      right: [],
    },

    onLoad(options) {
      const app = getApp();
      this.storeId = options.storeId || app.globalData.storeId;
      this.setData({ ownerEntryVisible: shouldShowOwnerEntry(app) });
      this.items = [];
      this.loadPortfolio(true);
    },

    async loadPortfolio(reset = false) {
      if (this.data.loadingMore || (!reset && !this.data.hasMore)) return;
      if (!this.storeId) {
        this.setData({ loading: false, errorMessage: '请先配置经营者主页' });
        return;
      }
      if (!reset) this.setData({ loadingMore: true });
      try {
        const last = reset ? null : this.items[this.items.length - 1];
        const page = await callApi('catalog.listPortfolio', {
          storeId: this.storeId,
          afterSortOrder: last?.sortOrder,
          limit: 12,
        });
        this.items = reset ? page : this.items.concat(page);
        this.setData({
          ...splitPortfolioColumns(this.items),
          errorMessage: '',
          hasMore: page.length === 12,
        });
      } catch (error) {
        this.setData({ errorMessage: error.message });
      } finally {
        this.setData({ loading: false, loadingMore: false });
      }
    },

    onReachBottom() {
      this.loadPortfolio(false);
    },

    openWork(event) {
      wx.navigateTo({
        url: `/pages/portfolio-detail/index?id=${encodeURIComponent(event.detail.id)}`,
      });
    },

    openOwnerPanel() {
      wx.navigateTo({ url: '/pages/owner/index' });
    },
  });
}

module.exports = {
  openLinkedService,
  shouldShowOwnerEntry,
  splitPortfolioColumns,
};
