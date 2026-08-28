const { allowedCustomerActions } = require('./index');

describe('allowedCustomerActions', () => {
  it.each([
    ['pending', ['withdraw']],
    ['confirmed', ['requestCancel']],
    ['cancel_requested', []],
    ['completed', []],
    ['expired', []],
  ])('maps %s to customer actions', (status, expected) => {
    expect(allowedCustomerActions(status)).toEqual(expected);
  });
});
