function copy(value) {
  return value === undefined ? undefined : structuredClone(value);
}

class MemoryRepository {
  constructor(seed = {}) {
    this.availabilityWindows = copy(seed.availabilityWindows || []);
    this.bookings = copy(seed.bookings || []);
    this.notificationJobs = copy(seed.notificationJobs || []);
    this.portfolio = copy(seed.portfolio || []);
    this.services = copy(seed.services || []);
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

  async getPublishedService(storeId, serviceId) {
    return copy(this.services.find((service) => (
      service.id === serviceId
      && service.storeId === storeId
      && service.status === 'published'
    )) || null);
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
