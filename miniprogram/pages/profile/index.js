const { callApi } = require('../../api/cloud-api');

Page({
  data: {
    errorMessage: '',
    loading: true,
    ownerEntryVisible: false,
    representativeWorks: [],
    store: null,
  },

  onLoad(options) {
    const app = getApp();
    this.storeId = options.storeId || app.globalData.storeId;
    this.setData({ ownerEntryVisible: app.globalData.isOwner === true });
    this.loadProfile();
  },

  async loadProfile() {
    if (!this.storeId) {
      this.setData({ errorMessage: '请先配置经营者主页', loading: false });
      return;
    }
    try {
      const [store, works] = await Promise.all([
        callApi('catalog.getStore', { storeId: this.storeId }),
        callApi('catalog.listPortfolio', { storeId: this.storeId }),
      ]);
      this.setData({ store, representativeWorks: works.slice(0, 3) });
    } catch (error) {
      this.setData({ errorMessage: error.message });
    } finally {
      this.setData({ loading: false });
    }
  },

  copyContact() {
    if (!this.data.store?.contactText) return;
    wx.setClipboardData({ data: this.data.store.contactText });
  },

  openWork(event) {
    wx.navigateTo({
      url: `/pages/portfolio-detail/index?id=${encodeURIComponent(event.detail.id)}`,
    });
  },

  openOwnerPanel() {
    wx.navigateTo({ url: '/pages/admin/dashboard/index' });
  },
});
