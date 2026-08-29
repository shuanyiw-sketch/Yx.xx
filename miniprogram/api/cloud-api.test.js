const { createCloudApi } = require('./cloud-api.js');

describe('createCloudApi', () => {
  it('returns action data from a successful cloud response', async () => {
    const callFunction = vi.fn().mockResolvedValue({
      result: { ok: true, data: { id: 'store-1' } },
    });
    const api = createCloudApi(callFunction);

    await expect(
      api('catalog.getStore', { storeId: 'store-1' }),
    ).resolves.toEqual({ id: 'store-1' });
  });

  it('throws a stable public error from a failed cloud response', async () => {
    const callFunction = vi.fn().mockResolvedValue({
      result: {
        ok: false,
        error: { code: 'SLOT_TAKEN', message: '档期已被占用' },
      },
    });
    const api = createCloudApi(callFunction);

    await expect(api('booking.create')).rejects.toMatchObject({
      code: 'SLOT_TAKEN',
      message: '档期已被占用',
    });
  });
});
