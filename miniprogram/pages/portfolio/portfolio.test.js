const {
  openLinkedService,
  shouldShowOwnerEntry,
  splitPortfolioColumns,
} = require('./index');

describe('portfolio page helpers', () => {
  it('uses the linked service in the booking call to action', () => {
    const navigateTo = vi.fn();

    openLinkedService('service / 1', navigateTo);

    expect(navigateTo).toHaveBeenCalledWith({
      url: '/pages/booking-create/index?serviceId=service%20%2F%201',
    });
  });

  it('splits works into two stable masonry columns', () => {
    expect(splitPortfolioColumns([{ id: 1 }, { id: 2 }, { id: 3 }])).toEqual({
      left: [{ id: 1 }, { id: 3 }],
      right: [{ id: 2 }],
    });
  });

  it('shows the owner entry only in owner mode', () => {
    expect(shouldShowOwnerEntry({ globalData: { isOwner: true } })).toBe(true);
    expect(shouldShowOwnerEntry({ globalData: { isOwner: false } })).toBe(false);
  });
});
