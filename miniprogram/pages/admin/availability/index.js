const { callApi } = require('../../../api/cloud-api');
const { formatDateTime } = require('../../../utils/date');

const EXCEPTION_TYPE_OPTIONS = [
  { label: '休息 / 临时占用', value: 'blocked' },
  { label: '线下预约', value: 'offline_booking' },
  { label: '临时加班', value: 'overtime' },
];

function buildExceptionPayload(input) {
  return {
    storeId: input.storeId,
    startMs: Number(input.startMs),
    endMs: Number(input.endMs),
    type: input.type,
    note: input.note,
  };
}

Page({
  data: {
    weekday: 1,
    startHour: 9,
    endHour: 18,
    exceptionStartMs: '',
    exceptionEndMs: '',
    exceptionNote: '',
    exceptionTypeIndex: 0,
    exceptionTypeOptions: EXCEPTION_TYPE_OPTIONS,
    exceptions: [],
  },
  onShow() { this.loadExceptions(); },
  update(event) { this.setData({ [event.currentTarget.dataset.field]: event.detail.value }); },
  selectExceptionType(event) {
    this.setData({ exceptionTypeIndex: Number(event.detail.value) });
  },
  async loadExceptions() {
    try {
      const exceptions = await callApi('admin.schedule.listExceptions', {
        storeId: getApp().globalData.storeId,
      });
      this.setData({ exceptions: exceptions.map((exception) => ({
        ...exception,
        displayTime: `${formatDateTime(exception.startMs)} 至 ${formatDateTime(exception.endMs)}`,
        typeLabel: EXCEPTION_TYPE_OPTIONS.find((option) => option.value === exception.type)?.label
          || exception.type,
      })) });
    } catch (error) { wx.showToast({ title: error.message, icon: 'none' }); }
  },
  async saveRule() {
    try {
      await callApi('admin.schedule.saveRule', {
        storeId: getApp().globalData.storeId,
        weekday: Number(this.data.weekday),
        intervals: [{
          startMinute: Number(this.data.startHour) * 60,
          endMinute: Number(this.data.endHour) * 60,
        }],
        intervalMinutes: 30,
      });
      wx.showToast({ title: '档期规则已保存' });
    } catch (error) { wx.showToast({ title: error.message, icon: 'none' }); }
  },
  async saveException() {
    try {
      await callApi('admin.schedule.saveException', buildExceptionPayload({
        storeId: getApp().globalData.storeId,
        startMs: this.data.exceptionStartMs,
        endMs: this.data.exceptionEndMs,
        type: EXCEPTION_TYPE_OPTIONS[this.data.exceptionTypeIndex].value,
        note: this.data.exceptionNote,
      }));
      this.setData({ exceptionStartMs: '', exceptionEndMs: '', exceptionNote: '' });
      await this.loadExceptions();
      wx.showToast({ title: '特殊档期已保存' });
    } catch (error) { wx.showToast({ title: error.message, icon: 'none' }); }
  },
});

module.exports = { buildExceptionPayload, EXCEPTION_TYPE_OPTIONS };
