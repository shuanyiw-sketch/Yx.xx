function copy(value) {
  return value === undefined ? undefined : structuredClone(value);
}

class MemoryRepository {
  constructor(seed = {}) {
    this.portfolio = copy(seed.portfolio || []);
    this.services = copy(seed.services || []);
    this.sessions = copy(seed.sessions || []);
    this.stores = copy(seed.stores || []);
  }

  async getSession(openId) {
    return copy(this.sessions.find((session) => session.openId === openId) || null);
  }

  async getStore(storeId) {
    return copy(this.stores.find((store) => store.id === storeId) || null);
  }

  async listPublishedPortfolio(storeId) {
    return copy(this.portfolio.filter((item) => (
      item.storeId === storeId && item.status === 'published'
    )));
  }

  async listPublishedServices(storeId) {
    return copy(this.services.filter((service) => (
      service.storeId === storeId && service.status === 'published'
    )));
  }

  async runTransaction(work) {
    return work(this);
  }
}

module.exports = { MemoryRepository };
