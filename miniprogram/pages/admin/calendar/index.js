const { callApi } = require('../../../api/cloud-api');
const { formatDateTime } = require('../../../utils/date');

Page({
  data: { bookings: [], loading: true },
  onShow() { this.load(); },
  async load() {
    try {
      const storeId = getApp().globalData.storeId;
      const result = await callApi('admin.dashboard.get', { storeId });
      this.setData({ bookings: result.bookings
        .sort((a, b) => a.startMs - b.startMs)
        .map((booking) => ({ ...booking, displayTime: formatDateTime(booking.startMs) })) });
    } catch (error) { wx.showToast({ title: error.message, icon: 'none' }); }
    finally { this.setData({ loading: false }); }
  },
  open(event) {
    wx.navigateTo({ url: `/pages/admin/booking-detail/index?id=${event.currentTarget.dataset.id}` });
  },
});
