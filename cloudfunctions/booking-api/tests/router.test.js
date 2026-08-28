const { route } = require('../router');
const { createCatalogService } = require('../services/catalog-service');
const { MemoryRepository } = require('../repositories/memory-repository');

function createDependencies(seed = {}) {
  const repository = new MemoryRepository(seed);
  return {
    repository,
    services: {
      admin: {
        saveService: vi.fn().mockResolvedValue({ id: 'service-1' }),
      },
      catalog: createCatalogService(repository),
    },
  };
}

describe('route', () => {
  it('allows an anonymous user to read only published portfolio items', async () => {
    const dependencies = createDependencies({
      portfolio: [
        { id: 'live', storeId: 'store-1', status: 'published', title: '海边写真' },
        { id: 'draft', storeId: 'store-1', status: 'draft', title: '未发布' },
        { id: 'other', storeId: 'store-2', status: 'published', title: '其他店铺' },
      ],
    });

    const result = await route({
      action: 'catalog.listPortfolio',
      payload: { storeId: 'store-1' },
    }, dependencies);

    expect(result).toEqual({
      ok: true,
      data: [{ id: 'live', storeId: 'store-1', status: 'published', title: '海边写真' }],
    });
  });

  it('rejects a customer calling an owner action', async () => {
    const dependencies = createDependencies({
      sessions: [{
        openId: 'openid-customer',
        userId: 'customer-1',
        isOwner: false,
        storeId: null,
      }],
    });

    const result = await route({
      action: 'admin.service.save',
      openId: 'openid-customer',
      payload: { storeId: 'store-1', name: '写真' },
    }, dependencies);

    expect(result).toEqual({
      ok: false,
      error: { code: 'FORBIDDEN', message: '无权执行该操作' },
    });
  });

  it('allows the bound owner to call their store action', async () => {
    const dependencies = createDependencies({
      sessions: [{
        openId: 'openid-owner',
        userId: 'owner-1',
        isOwner: true,
        storeId: 'store-1',
      }],
    });

    const result = await route({
      action: 'admin.service.save',
      openId: 'openid-owner',
      payload: { storeId: 'store-1', name: '写真' },
    }, dependencies);

    expect(result).toEqual({ ok: true, data: { id: 'service-1' } });
  });

  it('rejects actions outside the allowlist', async () => {
    const result = await route({ action: 'database.deleteEverything' }, createDependencies());

    expect(result).toEqual({
      ok: false,
      error: { code: 'UNKNOWN_ACTION', message: '不支持的操作' },
    });
  });
});
