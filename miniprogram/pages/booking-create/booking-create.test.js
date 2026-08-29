const {
  buildBookingRequest,
  getOrCreateRequestId,
  submitBookingFlow,
} = require('./index');

describe('booking request', () => {
  it('builds a request without trusting client price or duration', () => {
    expect(buildBookingRequest({
      name: '林',
      phone: '13800000000',
      location: '西湖',
      peopleCount: 2,
      notes: '自然风格',
      referencePriceFen: 1,
      durationMinutes: 1,
    }, { startMs: 100 }, 'request-1')).toEqual({
      customer: { name: '林', phone: '13800000000' },
      location: '西湖',
      peopleCount: 2,
      notes: '自然风格',
      startMs: 100,
      requestId: 'request-1',
    });
  });

  it('reuses one request id across retries', () => {
    const state = {};
    const generate = vi.fn().mockReturnValue('stable-request');

    expect(getOrCreateRequestId(state, generate)).toBe('stable-request');
    expect(getOrCreateRequestId(state, generate)).toBe('stable-request');
    expect(generate).toHaveBeenCalledTimes(1);
  });
});

describe('submitBookingFlow', () => {
  it('continues booking when subscription permission is declined', async () => {
    const requestSubscription = vi.fn().mockRejectedValue(new Error('declined'));
    const createBooking = vi.fn().mockResolvedValue({ id: 'booking-1' });

    await expect(submitBookingFlow({
      createBooking,
      payload: { requestId: 'request-1' },
      requestSubscription,
    })).resolves.toEqual({ id: 'booking-1' });
  });

  it('refreshes slots and gives a clear message when a slot was taken', async () => {
    const refreshSlots = vi.fn().mockResolvedValue();
    const error = Object.assign(new Error('taken'), { code: 'SLOT_TAKEN' });

    await expect(submitBookingFlow({
      createBooking: vi.fn().mockRejectedValue(error),
      payload: {},
      refreshSlots,
      requestSubscription: vi.fn().mockResolvedValue(),
    })).rejects.toMatchObject({
      code: 'SLOT_TAKEN',
      publicMessage: '该时段刚刚被预约，请重新选择',
    });
    expect(refreshSlots).toHaveBeenCalledTimes(1);
  });
});
