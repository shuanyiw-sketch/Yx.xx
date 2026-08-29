const { loadPortfolioDetail } = require('./index');

describe('portfolio detail favorites', () => {
  it('loads the existing favorite state without blocking published detail reads', async () => {
    const callApi = vi.fn(async (action) => {
      if (action === 'catalog.getPortfolioItem') {
        return { id: 'work-1', storeId: 'store-1', serviceIds: [] };
      }
      if (action === 'favorite.listMine') return [{ id: 'work-1' }];
      throw new Error(`unexpected action: ${action}`);
    });

    await expect(loadPortfolioDetail('work-1', callApi)).resolves.toMatchObject({
      item: { id: 'work-1' },
      favorited: true,
      linkedServices: [],
    });
  });
});
