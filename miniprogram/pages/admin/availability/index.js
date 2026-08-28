const { callApi } = require('../../../api/cloud-api');
Page({
  data: { weekday: 1, startHour: 9, endHour: 18 },
  update(event) { this.setData({ [event.currentTarget.dataset.field]: event.detail.value }); },
  async saveRule() { try { await callApi('admin.schedule.saveRule', { storeId: getApp().globalData.storeId, weekday: Number(this.data.weekday), intervals: [{ startMinute: Number(this.data.startHour) * 60, endMinute: Number(this.data.endHour) * 60 }], intervalMinutes: 30 }); wx.showToast({ title: '档期规则已保存' }); } catch (error) { wx.showToast({ title: error.message, icon: 'none' }); } },
});
