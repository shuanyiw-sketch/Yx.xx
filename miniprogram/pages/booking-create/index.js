const { callApi } = require('../../api/cloud-api');
const { BOOKING_STATUS_TEMPLATE_ID } = require('../../config');
const {
  dayRangeFromDateKey,
  formatTime,
  nextDateOptions,
} = require('../../utils/date');

function buildBookingRequest(form, selectedSlot, requestId) {
  return {
    customer: { name: form.name, phone: form.phone },
    location: form.location,
    peopleCount: form.peopleCount,
    notes: form.notes,
    startMs: selectedSlot.startMs,
    requestId,
  };
}

function getOrCreateRequestId(state, generate) {
  if (!state.requestId) state.requestId = generate();
  return state.requestId;
}

async function submitBookingFlow({
  createBooking,
  payload,
  refreshSlots = async () => {},
  requestSubscription = async () => {},
}) {
  try {
    await requestSubscription();
  } catch {
    // Subscription messages are optional; the booking must still be submitted.
  }
  try {
    return await createBooking(payload);
  } catch (error) {
    if (error.code === 'SLOT_TAKEN') {
      await refreshSlots();
      error.publicMessage = '该时段刚刚被预约，请重新选择';
    }
    throw error;
  }
}

function generateRequestId() {
  return `request-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

if (typeof Page === 'function') {
  Page({
    data: {
      dates: nextDateOptions(),
      form: { name: '', phone: '', location: '', peopleCount: 1, notes: '' },
      loading: true,
      selectedDateKey: '',
      selectedSlot: null,
      service: null,
      slots: [],
      submitting: false,
    },

    onLoad(options) {
      this.serviceId = options.serviceId;
      this.storeId = getApp().globalData.storeId;
      this.submissionState = {};
      const selectedDateKey = this.data.dates[0]?.dateKey || '';
      this.setData({ selectedDateKey });
      this.loadPage();
    },

    async loadPage() {
      try {
        const service = await callApi('catalog.getService', {
          storeId: this.storeId,
          serviceId: this.serviceId,
        });
        this.setData({
          service: {
            ...service,
            priceYuan: (service.referencePriceFen / 100).toFixed(0),
          },
        });
        await this.loadSlots();
      } catch (error) {
        wx.showToast({ title: error.message, icon: 'none' });
      } finally {
        this.setData({ loading: false });
      }
    },

    async loadSlots() {
      if (!this.data.selectedDateKey) return;
      const range = dayRangeFromDateKey(this.data.selectedDateKey);
      const slots = await callApi('availability.listSlots', {
        storeId: this.storeId,
        serviceId: this.serviceId,
        ...range,
      });
      this.setData({
        selectedSlot: null,
        slots: slots.map((slot) => ({ ...slot, label: formatTime(slot.startMs) })),
      });
    },

    selectDate(event) {
      this.setData({ selectedDateKey: event.currentTarget.dataset.key });
      this.loadSlots();
    },

    selectSlot(event) {
      const selectedSlot = this.data.slots.find((slot) => (
        slot.startMs === Number(event.currentTarget.dataset.start)
      ));
      this.setData({ selectedSlot });
    },

    updateField(event) {
      const field = event.currentTarget.dataset.field;
      this.setData({ [`form.${field}`]: event.detail.value });
    },

    async submit() {
      const { form, selectedSlot } = this.data;
      if (!form.name.trim() || !/^1\d{10}$/.test(form.phone) || !selectedSlot) {
        wx.showToast({ title: '请填写姓名、正确手机号并选择时间', icon: 'none' });
        return;
      }
      const requestId = getOrCreateRequestId(this.submissionState, generateRequestId);
      const payload = {
        storeId: this.storeId,
        serviceId: this.serviceId,
        ...buildBookingRequest(form, selectedSlot, requestId),
      };
      this.setData({ submitting: true });
      try {
        const booking = await submitBookingFlow({
          payload,
          createBooking: (request) => callApi('booking.create', request),
          refreshSlots: () => this.loadSlots(),
          requestSubscription: () => (
            BOOKING_STATUS_TEMPLATE_ID
              ? wx.requestSubscribeMessage({ tmplIds: [BOOKING_STATUS_TEMPLATE_ID] })
              : Promise.resolve()
          ),
        });
        wx.redirectTo({
          url: `/pages/booking-detail/index?id=${encodeURIComponent(booking.id)}`,
        });
      } catch (error) {
        wx.showToast({ title: error.publicMessage || error.message, icon: 'none' });
      } finally {
        this.setData({ submitting: false });
      }
    },
  });
}

module.exports = {
  buildBookingRequest,
  getOrCreateRequestId,
  submitBookingFlow,
};
