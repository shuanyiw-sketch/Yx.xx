const { callApi } = require('../../../api/cloud-api');
Page({
  data: { customers: [], selected: null },
  onShow() { this.load(); },
  async load() { try { this.setData({ customers: await callApi('admin.customer.list', { storeId: getApp().globalData.storeId }) }); } catch (error) { wx.showToast({ title: error.message, icon: 'none' }); } },
  async open(event) { try { this.setData({ selected: await callApi('admin.customer.get', { storeId: getApp().globalData.storeId, customerUserId: event.currentTarget.dataset.id }) }); } catch (error) { wx.showToast({ title: error.message, icon: 'none' }); } },
});
