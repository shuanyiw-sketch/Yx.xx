const { callApi } = require('../../../api/cloud-api');
const { dayRangeFromDateKey, dateKeyFromTimestamp } = require('../../../utils/date');

function groupDashboard(bookings, { nowMs, dayStartMs, dayEndMs }) {
  return {
    today: bookings.filter((booking) => (
      booking.startMs >= dayStartMs
      && booking.startMs < dayEndMs
      && ['confirmed', 'cancel_requested'].includes(booking.status)
    )),
    pending: bookings.filter((booking) => booking.status === 'pending'),
    expiringSoon: bookings.filter((booking) => (
      booking.status === 'pending' && booking.lockedUntil <= nowMs + 3_600_000
    )),
  };
}

if (typeof Page === 'function') {
  Page({
    data: {
      expiringSoon: [],
      loading: true,
      pending: [],
      today: [],
    },

    onShow() {
      this.loadDashboard();
    },

    async loadDashboard() {
      const app = getApp();
      const storeId = app.globalData.storeId;
      if (!app.globalData.isOwner) {
        wx.showToast({ title: '仅经营者可进入', icon: 'none' });
        wx.navigateBack();
        return;
      }
      try {
        const result = await callApi('admin.dashboard.get', { storeId });
        const nowMs = Date.now();
        const range = dayRangeFromDateKey(dateKeyFromTimestamp(nowMs));
        this.setData(groupDashboard(result.bookings, { nowMs, ...range }));
      } catch (error) {
        wx.showToast({ title: error.message, icon: 'none' });
      } finally {
        this.setData({ loading: false });
      }
    },

    openSection(event) {
      wx.navigateTo({ url: event.currentTarget.dataset.url });
    },
  });
}

module.exports = { groupDashboard };
