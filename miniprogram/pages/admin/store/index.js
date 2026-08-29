const { callApi } = require('../../../api/cloud-api');
Page({
  data: { form: { name: '', introduction: '', contactText: '', bookingPolicy: '' } },
  onLoad() { this.load(); },
  async load() { try { this.setData({ form: await callApi('catalog.getStore', { storeId: getApp().globalData.storeId }) }); } catch (error) { wx.showToast({ title: error.message, icon: 'none' }); } },
  update(event) { this.setData({ [`form.${event.currentTarget.dataset.field}`]: event.detail.value }); },
  async save() { try { await callApi('admin.store.save', { storeId: getApp().globalData.storeId, ...this.data.form }); wx.showToast({ title: '主页已保存' }); } catch (error) { wx.showToast({ title: error.message, icon: 'none' }); } },
});
