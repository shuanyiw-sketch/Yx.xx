const { createCatalogService } = require('../services/catalog-service');
const { MemoryRepository } = require('../repositories/memory-repository');

function createFixture() {
  const repository = new MemoryRepository({
    portfolio: [
      { id: 'live', storeId: 'store-1', status: 'published', title: '海边写真', sortOrder: 1 },
      { id: 'draft', storeId: 'store-1', status: 'draft', title: '未发布', sortOrder: 2 },
    ],
    services: [
      { id: 'service-live', storeId: 'store-1', status: 'published', name: '写真' },
      { id: 'service-draft', storeId: 'store-1', status: 'draft', name: '秘密服务' },
    ],
  });
  return { repository, service: createCatalogService(repository) };
}

describe('catalog detail reads', () => {
  it('never returns drafts in the public portfolio', async () => {
    const { service } = createFixture();

    await expect(service.listPortfolio('store-1')).resolves.toEqual([
      { id: 'live', storeId: 'store-1', status: 'published', title: '海边写真', sortOrder: 1 },
    ]);
    await expect(service.getPortfolioItem('draft')).rejects.toMatchObject({
      code: 'PORTFOLIO_NOT_FOUND',
    });
  });

  it('paginates published works by their stable sort order', async () => {
    const { repository, service } = createFixture();
    repository.portfolio.push(
      { id: 'live-2', storeId: 'store-1', status: 'published', title: '山野', sortOrder: 2 },
      { id: 'live-3', storeId: 'store-1', status: 'published', title: '城市', sortOrder: 3 },
    );

    const page = await service.listPortfolio('store-1', { afterSortOrder: 1, limit: 1 });

    expect(page.map((item) => item.id)).toEqual(['live-2']);
  });

  it('returns only a published service detail', async () => {
    const { service } = createFixture();

    await expect(service.getService('store-1', 'service-live')).resolves.toMatchObject({
      id: 'service-live',
      name: '写真',
    });
    await expect(service.getService('store-1', 'service-draft')).rejects.toMatchObject({
      code: 'SERVICE_NOT_FOUND',
    });
  });
});

describe('favorites', () => {
  it('toggles and lists favorites only for the authenticated customer', async () => {
    const { service } = createFixture();
    const customer = { userId: 'customer-1' };
    const other = { userId: 'customer-2' };

    await expect(service.toggleFavorite('live', customer)).resolves.toEqual({ favorited: true });
    await expect(service.listFavorites(customer)).resolves.toHaveLength(1);
    await expect(service.listFavorites(other)).resolves.toEqual([]);
    await expect(service.toggleFavorite('live', customer)).resolves.toEqual({ favorited: false });
  });
});
