const { requireOwner, requireSelf } = require('../auth');

describe('requireOwner', () => {
  it('accepts the owner bound to the requested store', () => {
    expect(() => requireOwner({
      isOwner: true,
      storeId: 'store-1',
      userId: 'owner-1',
    }, 'store-1')).not.toThrow();
  });

  it('rejects an owner bound to another store', () => {
    expect(() => requireOwner({
      isOwner: true,
      storeId: 'store-2',
      userId: 'owner-2',
    }, 'store-1')).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
  });

  it('rejects a customer', () => {
    expect(() => requireOwner({
      isOwner: false,
      storeId: null,
      userId: 'customer-1',
    }, 'store-1')).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
  });
});

describe('requireSelf', () => {
  it('accepts a user reading their own resource', () => {
    expect(() => requireSelf({ userId: 'customer-1' }, 'customer-1')).not.toThrow();
  });

  it('rejects a user reading another customer resource', () => {
    expect(() => requireSelf({ userId: 'customer-1' }, 'customer-2'))
      .toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
  });
});
