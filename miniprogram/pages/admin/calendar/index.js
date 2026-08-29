const { callApi } = require('../../../api/cloud-api');
const { formatDateTime } = require('../../../utils/date');

function calendarEntries(bookings, exceptions) {
  return [
    ...bookings.map((booking) => ({ ...booking, kind: 'booking' })),
    ...exceptions.map((exception) => ({
      ...exception,
      kind: exception.type === 'offline_booking' ? 'offline_booking' : 'exception',
    })),
  ];
}

if (typeof Page === 'function') {
  Page({
    data: { entries: [], loading: true },
    onShow() { this.load(); },
    async load() {
      try {
        const storeId = getApp().globalData.storeId;
        const [dashboard, exceptions] = await Promise.all([
          callApi('admin.dashboard.get', { storeId }),
          callApi('admin.schedule.listExceptions', { storeId }),
        ]);
        this.setData({
          entries: calendarEntries(dashboard.bookings, exceptions)
            .sort((first, second) => first.startMs - second.startMs)
            .map((entry) => ({ ...entry, displayTime: formatDateTime(entry.startMs) })),
        });
      } catch (error) { wx.showToast({ title: error.message, icon: 'none' }); }
      finally { this.setData({ loading: false }); }
    },
    open(event) {
      if (event.currentTarget.dataset.kind !== 'booking') return;
      wx.navigateTo({ url: `/pages/admin/booking-detail/index?id=${event.currentTarget.dataset.id}` });
    },
  });
}

module.exports = { calendarEntries };
