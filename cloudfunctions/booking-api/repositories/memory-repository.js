function copy(value) {
  return value === undefined ? undefined : structuredClone(value);
}

class MemoryRepository {
  constructor(seed = {}) {
    this.availabilityWindows = copy(seed.availabilityWindows || []);
    this.availabilityRules = copy(seed.availabilityRules || []);
    this.bookings = copy(seed.bookings || []);
    this.favorites = copy(seed.favorites || []);
    this.notificationJobs = copy(seed.notificationJobs || []);
    this.portfolio = copy(seed.portfolio || []);
    this.services = copy(seed.services || []);
    this.scheduleExceptions = copy(seed.scheduleExceptions || []);
    this.sessions = copy(seed.sessions || []);
    this.stores = copy(seed.stores || []);
    this.transactionQueue = Promise.resolve();
  }

  async getSession(openId) {
    return copy(this.sessions.find((session) => session.openId === openId) || null);
  }

  async getStore(storeId) {
    return copy(this.stores.find((store) => store.id === storeId) || null);
  }

  async listPublishedPortfolio(storeId, options = {}) {
    const afterSortOrder = Number.isFinite(options.afterSortOrder)
      ? options.afterSortOrder
      : -Infinity;
    const limit = Number.isInteger(options.limit) ? options.limit : this.portfolio.length;
    return copy(this.portfolio.filter((item) => (
      item.storeId === storeId
      && item.status === 'published'
      && (item.sortOrder || 0) > afterSortOrder
    )).sort((first, second) => (
      (first.sortOrder || 0) - (second.sortOrder || 0)
    )).slice(0, limit));
  }

  async getPublishedPortfolioItem(portfolioItemId) {
    return copy(this.portfolio.find((item) => (
      item.id === portfolioItemId && item.status === 'published'
    )) || null);
  }

  async listPublishedServices(storeId) {
    return copy(this.services.filter((service) => (
      service.storeId === storeId && service.status === 'published'
    )));
  }

  async getService(serviceId) {
    return copy(this.services.find((service) => service.id === serviceId) || null);
  }

  async saveService(service) {
    const index = this.services.findIndex((existing) => existing.id === service.id);
    if (index === -1) this.services.push(copy(service));
    else this.services[index] = { ...this.services[index], ...copy(service) };
    return copy(index === -1 ? this.services[this.services.length - 1] : this.services[index]);
  }

  async updateService(serviceId, changes) {
    const index = this.services.findIndex((service) => service.id === serviceId);
    if (index === -1) return null;
    this.services[index] = { ...this.services[index], ...copy(changes) };
    return copy(this.services[index]);
  }

  async getPublishedService(storeId, serviceId) {
    return copy(this.services.find((service) => (
      service.id === serviceId
      && service.storeId === storeId
      && service.status === 'published'
    )) || null);
  }

  async listFavoritesByUser(userId) {
    return copy(this.favorites.filter((favorite) => favorite.userId === userId));
  }

  async getFavorite(userId, portfolioItemId) {
    return copy(this.favorites.find((favorite) => (
      favorite.userId === userId && favorite.portfolioItemId === portfolioItemId
    )) || null);
  }

  async insertFavorite(favorite) {
    this.favorites.push(copy(favorite));
    return copy(favorite);
  }

  async deleteFavorite(favoriteId) {
    const index = this.favorites.findIndex((favorite) => favorite.id === favoriteId);
    if (index === -1) return false;
    this.favorites.splice(index, 1);
    return true;
  }

  async getAvailabilityWindows(storeId, startMs, endMs) {
    return copy(this.availabilityWindows.filter((window) => (
      window.storeId === storeId
      && window.dayStartMs <= startMs
      && window.dayEndMs >= endMs
    )));
  }

  async findBookingByRequestId(customerUserId, requestId) {
    return copy(this.bookings.find((booking) => (
      booking.customerUserId === customerUserId && booking.requestId === requestId
    )) || null);
  }

  async findBlockingPeriods(storeId, startMs, endMs, nowMs) {
    const { isBookingBlocking } = require('../domain/booking-state');
    return copy(this.bookings.filter((booking) => (
      booking.storeId === storeId
      && isBookingBlocking(booking, nowMs)
      && booking.occupiedStartMs < endMs
      && startMs < booking.occupiedEndMs
    )).map((booking) => ({
      bookingId: booking.id,
      startMs: booking.occupiedStartMs,
      endMs: booking.occupiedEndMs,
    })));
  }

  async insertBooking(booking) {
    this.bookings.push(copy(booking));
    return copy(booking);
  }

  async getBooking(bookingId) {
    return copy(this.bookings.find((booking) => booking.id === bookingId) || null);
  }

  async listBookingsByCustomer(customerUserId) {
    return copy(this.bookings.filter((booking) => (
      booking.customerUserId === customerUserId
    )).sort((first, second) => (
      (second.createdAtMs || 0) - (first.createdAtMs || 0)
    )));
  }

  async listBookingsByStore(storeId) {
    return copy(this.bookings.filter((booking) => booking.storeId === storeId));
  }

  async getPortfolioItem(portfolioItemId) {
    return copy(this.portfolio.find((item) => item.id === portfolioItemId) || null);
  }

  async savePortfolioItem(portfolioItem) {
    const index = this.portfolio.findIndex((item) => item.id === portfolioItem.id);
    if (index === -1) this.portfolio.push(copy(portfolioItem));
    else this.portfolio[index] = { ...this.portfolio[index], ...copy(portfolioItem) };
    return copy(index === -1 ? this.portfolio[this.portfolio.length - 1] : this.portfolio[index]);
  }

  async saveAvailabilityRule(rule) {
    const index = this.availabilityRules.findIndex((existing) => existing.id === rule.id);
    if (index === -1) this.availabilityRules.push(copy(rule));
    else this.availabilityRules[index] = { ...this.availabilityRules[index], ...copy(rule) };
    return copy(index === -1
      ? this.availabilityRules[this.availabilityRules.length - 1]
      : this.availabilityRules[index]);
  }

  async listScheduleExceptions(storeId) {
    return copy(this.scheduleExceptions.filter((exception) => exception.storeId === storeId));
  }

  async saveScheduleException(exception) {
    const index = this.scheduleExceptions.findIndex((existing) => existing.id === exception.id);
    if (index === -1) this.scheduleExceptions.push(copy(exception));
    else this.scheduleExceptions[index] = { ...this.scheduleExceptions[index], ...copy(exception) };
    return copy(index === -1
      ? this.scheduleExceptions[this.scheduleExceptions.length - 1]
      : this.scheduleExceptions[index]);
  }

  async updateStore(storeId, changes) {
    const index = this.stores.findIndex((store) => store.id === storeId);
    if (index === -1) return null;
    this.stores[index] = { ...this.stores[index], ...copy(changes) };
    return copy(this.stores[index]);
  }

  async updateBookingIfStatus(bookingId, expectedStatus, changes) {
    const index = this.bookings.findIndex((booking) => (
      booking.id === bookingId && booking.status === expectedStatus
    ));
    if (index === -1) return null;
    this.bookings[index] = { ...this.bookings[index], ...copy(changes) };
    return copy(this.bookings[index]);
  }

  async insertNotificationJob(job) {
    this.notificationJobs.push(copy(job));
    return copy(job);
  }

  async listExpiredPending(nowMs) {
    return copy(this.bookings.filter((booking) => (
      booking.status === 'pending' && booking.lockedUntil <= nowMs
    )));
  }

  async listConfirmedBookingsStartingBetween(windowStartMs, windowEndMs) {
    return copy(this.bookings.filter((booking) => (
      booking.status === 'confirmed'
      && booking.startMs >= windowStartMs
      && booking.startMs < windowEndMs
    )));
  }

  async insertNotificationJobIfAbsent(job) {
    if (this.notificationJobs.some((existing) => (
      existing.idempotencyKey === job.idempotencyKey
    ))) return false;
    this.notificationJobs.push(copy(job));
    return true;
  }

  async listDueNotificationJobs(nowMs) {
    return copy(this.notificationJobs.filter((job) => (
      (job.status === 'pending' || job.status === 'retry')
      && job.nextAttemptAtMs <= nowMs
    )));
  }

  async updateNotificationJobIfStatus(jobId, expectedStatus, changes) {
    const index = this.notificationJobs.findIndex((job) => (
      job.id === jobId && job.status === expectedStatus
    ));
    if (index === -1) return null;
    this.notificationJobs[index] = { ...this.notificationJobs[index], ...copy(changes) };
    return copy(this.notificationJobs[index]);
  }

  async runTransaction(work) {
    const previous = this.transactionQueue;
    let release;
    this.transactionQueue = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      return await work(this);
    } finally {
      release();
    }
  }
}

module.exports = { MemoryRepository };
