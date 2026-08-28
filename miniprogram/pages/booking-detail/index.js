const { callApi } = require('../../api/cloud-api');
const { formatDateTime } = require('../../utils/date');

function allowedCustomerActions(status) {
  if (status === 'pending') return ['withdraw'];
  if (status === 'confirmed') return ['requestCancel'];
  return [];
}

if (typeof Page === 'function') {
  Page({
    data: {
      actions: [],
      booking: null,
      canRequestCancel: false,
      canWithdraw: false,
      errorMessage: '',
      loading: true,
    },

    onLoad(options) {
      this.bookingId = options.id;
    },

    onShow() {
      if (this.bookingId) this.loadBooking();
    },

    async loadBooking() {
      try {
        const booking = await callApi('booking.getMine', { bookingId: this.bookingId });
        const actions = allowedCustomerActions(booking.status);
        this.setData({
          actions,
          booking: { ...booking, displayTime: formatDateTime(booking.startMs) },
          canRequestCancel: actions.includes('requestCancel'),
          canWithdraw: actions.includes('withdraw'),
          errorMessage: '',
        });
      } catch (error) {
        this.setData({ errorMessage: error.message });
      } finally {
        this.setData({ loading: false });
      }
    },

    async command(event) {
      const command = event.currentTarget.dataset.command;
      try {
        await callApi('booking.command', { bookingId: this.bookingId, command });
        await this.loadBooking();
      } catch (error) {
        wx.showToast({ title: error.message, icon: 'none' });
      }
    },
  });
}

module.exports = { allowedCustomerActions };
