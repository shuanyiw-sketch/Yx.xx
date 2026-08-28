const { callApi } = require('../../../api/cloud-api');
Page({
  data: { services: [], form: { name: '', description: '', referencePriceYuan: '', durationMinutes: 120, bufferBeforeMinutes: 30, bufferAfterMinutes: 30 } },
  onShow() { this.load(); },
  async load() { try { this.setData({ services: await callApi('catalog.listServices', { storeId: getApp().globalData.storeId }) }); } catch (error) { wx.showToast({ title: error.message, icon: 'none' }); } },
  update(event) { this.setData({ [`form.${event.currentTarget.dataset.field}`]: event.detail.value }); },
  async save() {
    const form = this.data.form;
    try {
      await callApi('admin.service.save', {
        storeId: getApp().globalData.storeId,
        name: form.name,
        description: form.description,
        referencePriceFen: Math.round(Number(form.referencePriceYuan) * 100),
        durationMinutes: Number(form.durationMinutes),
        bufferBeforeMinutes: Number(form.bufferBeforeMinutes),
        bufferAfterMinutes: Number(form.bufferAfterMinutes),
        status: 'published',
      });
      wx.showToast({ title: '服务已保存' }); await this.load();
    } catch (error) { wx.showToast({ title: error.message, icon: 'none' }); }
  },
  async unpublish(event) { try { await callApi('admin.service.unpublish', { storeId: getApp().globalData.storeId, serviceId: event.currentTarget.dataset.id }); await this.load(); } catch (error) { wx.showToast({ title: error.message, icon: 'none' }); } },
});
