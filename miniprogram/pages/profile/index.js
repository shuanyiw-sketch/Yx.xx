const { callApi } = require('../../api/cloud-api');

async function loadProfileData(storeId, api = callApi) {
  const [store, works, favoriteWorks] = await Promise.all([
    api('catalog.getStore', { storeId }),
    api('catalog.listPortfolio', { storeId }),
    api('favorite.listMine').catch(() => []),
  ]);
  return { store, representativeWorks: works.slice(0, 3), favoriteWorks };
}

if (typeof Page === 'function') {
  Page({
    data: {
      errorMessage: '', favoriteWorks: [], loading: true, ownerEntryVisible: false,
      representativeWorks: [], store: null,
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
      try { this.setData(await loadProfileData(this.storeId)); }
      catch (error) { this.setData({ errorMessage: error.message }); }
      finally { this.setData({ loading: false }); }
    },
    copyContact() {
      if (!this.data.store?.contactText) return;
      wx.setClipboardData({ data: this.data.store.contactText });
    },
    openWork(event) {
      wx.navigateTo({ url: `/pages/portfolio-detail/index?id=${encodeURIComponent(event.detail.id)}` });
    },
    openOwnerPanel() { wx.navigateTo({ url: '/pages/admin/dashboard/index' }); },
  });
}

module.exports = { loadProfileData };
