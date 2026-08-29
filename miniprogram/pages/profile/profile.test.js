const { loadProfileData } = require('./index');

describe('profile favorites', () => {
  it('includes the signed-in customer\'s favorite works', async () => {
    const callApi = vi.fn(async (action) => {
      if (action === 'catalog.getStore') return { id: 'store-1', name: '一瞬摄影' };
      if (action === 'catalog.listPortfolio') return [{ id: 'work-1' }];
      if (action === 'favorite.listMine') return [{ id: 'favorite-work', title: '收藏的作品' }];
      throw new Error(`unexpected action: ${action}`);
    });

    await expect(loadProfileData('store-1', callApi)).resolves.toEqual({
      store: { id: 'store-1', name: '一瞬摄影' },
      representativeWorks: [{ id: 'work-1' }],
      favoriteWorks: [{ id: 'favorite-work', title: '收藏的作品' }],
    });
  });
});
