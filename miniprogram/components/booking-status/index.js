const LABELS = {
  pending: '待确认',
  confirmed: '已确认',
  rejected: '已拒绝',
  expired: '已过期',
  cancel_requested: '取消处理中',
  cancelled: '已取消',
  completed: '已完成',
};

Component({
  properties: {
    status: { type: String, value: '' },
  },
  data: { label: '' },
  observers: {
    status(status) {
      this.setData({ label: LABELS[status] || '状态未知' });
    },
  },
});
