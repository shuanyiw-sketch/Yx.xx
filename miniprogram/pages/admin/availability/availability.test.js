global.Page = vi.fn();
const { buildExceptionPayload } = require('./index');

describe('availability exception form', () => {
  it('preserves the selected exception type for server-side scheduling semantics', () => {
    expect(buildExceptionPayload({
      storeId: 'store-1',
      startMs: '100',
      endMs: '200',
      type: 'overtime',
      note: '晚间加班',
    })).toEqual({
      storeId: 'store-1',
      startMs: 100,
      endMs: 200,
      type: 'overtime',
      note: '晚间加班',
    });
  });
});
