const { callApi } = require('../../api/cloud-api');
const { formatDateTime } = require('../../utils/date');

Page({
  data: {
    bookings: [],
    errorMessage: '',
    loading: true,
  },

  onShow() {
    this.loadBookings();
  },

  async loadBookings() {
    this.setData({ loading: true });
    try {
      const bookings = await callApi('booking.listMine');
      this.setData({
        bookings: bookings.map((booking) => ({
          ...booking,
          displayTime: formatDateTime(booking.startMs),
        })),
        errorMessage: '',
      });
    } catch (error) {
      this.setData({ errorMessage: error.message });
    } finally {
      this.setData({ loading: false });
    }
  },

  openBooking(event) {
    wx.navigateTo({
      url: `/pages/booking-detail/index?id=${encodeURIComponent(event.currentTarget.dataset.id)}`,
    });
  },
});
