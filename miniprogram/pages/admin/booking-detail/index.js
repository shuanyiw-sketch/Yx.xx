const { callApi } = require('../../../api/cloud-api');
const { formatDateTime } = require('../../../utils/date');

Page({
  data: { booking: null, amountYuan: '', receiptType: 'deposit' },
  onLoad(options) { this.bookingId = options.id; },
  onShow() { this.load(); },
  async load() {
    try {
      const storeId = getApp().globalData.storeId;
      const result = await callApi('admin.dashboard.get', { storeId });
      const booking = result.bookings.find((item) => item.id === this.bookingId);
      this.setData({ booking: booking ? { ...booking, displayTime: formatDateTime(booking.startMs) } : null });
    } catch (error) { wx.showToast({ title: error.message, icon: 'none' }); }
  },
  updateAmount(event) { this.setData({ amountYuan: event.detail.value }); },
  chooseReceiptType(event) { this.setData({ receiptType: event.currentTarget.dataset.type }); },
  async command(event) {
    const storeId = getApp().globalData.storeId;
    try {
      await callApi('admin.booking.command', { storeId, bookingId: this.bookingId, command: event.currentTarget.dataset.command });
      await this.load();
    } catch (error) { wx.showToast({ title: error.message, icon: 'none' }); }
  },
  async recordReceipt() {
    const amountFen = Math.round(Number(this.data.amountYuan) * 100);
    try {
      await callApi('admin.booking.recordReceipt', {
        storeId: getApp().globalData.storeId,
        bookingId: this.bookingId,
        amountFen,
        type: this.data.receiptType,
        receivedAtMs: Date.now(),
        note: '',
      });
      this.setData({ amountYuan: '' });
      await this.load();
    } catch (error) { wx.showToast({ title: error.message, icon: 'none' }); }
  },
});
