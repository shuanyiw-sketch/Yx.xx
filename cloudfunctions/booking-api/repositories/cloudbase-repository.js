function normalizeDocument(document) {
  if (!document) return null;
  const { _id, ...fields } = document;
  return { id: _id, ...fields };
}

function withoutId(document) {
  const fields = { ...document };
  delete fields.id;
  return fields;
}

function createCloudbaseRepository(database, rootDatabase = database) {
  return {
    async getSession(openId) {
      if (!openId) return null;
      const result = await database.collection('users').where({ openId }).limit(1).get();
      let user = normalizeDocument(result.data[0]);
      if (!user) {
        const crypto = require('node:crypto');
        const id = `user-${crypto.createHash('sha256').update(openId).digest('hex')}`;
        user = { id, openId, role: 'customer', createdAtMs: Date.now() };
        await database.collection('users').doc(id).set({ data: withoutId(user) });
      }
      return {
        isOwner: user.role === 'owner',
        openId,
        storeId: user.storeId || null,
        userId: user.id,
      };
    },

    async getStore(storeId) {
      try {
        const result = await database.collection('stores').doc(storeId).get();
        return normalizeDocument(result.data);
      } catch (error) {
        if (error.errCode === -1 || error.errCode === 'DATABASE_DOCUMENT_NOT_EXIST') return null;
        throw error;
      }
    },

    async listPublishedPortfolio(storeId, options = {}) {
      const query = { storeId, status: 'published' };
      if (Number.isFinite(options.afterSortOrder)) {
        query.sortOrder = rootDatabase.command.gt(options.afterSortOrder);
      }
      const result = await database.collection('portfolioItems')
        .where(query)
        .orderBy('sortOrder', 'asc')
        .limit(options.limit || 20)
        .get();
      return result.data.map(normalizeDocument);
    },

    async getPublishedPortfolioItem(portfolioItemId) {
      try {
        const result = await database.collection('portfolioItems').doc(portfolioItemId).get();
        const item = normalizeDocument(result.data);
        return item?.status === 'published' ? item : null;
      } catch (error) {
        if (error.errCode === -1 || error.errCode === 'DATABASE_DOCUMENT_NOT_EXIST') return null;
        throw error;
      }
    },

    async listPublishedServices(storeId) {
      const result = await database.collection('services')
        .where({ storeId, status: 'published' })
        .orderBy('sortOrder', 'asc')
        .get();
      return result.data.map(normalizeDocument);
    },

    async getPublishedService(storeId, serviceId) {
      try {
        const result = await database.collection('services').doc(serviceId).get();
        const service = normalizeDocument(result.data);
        if (service?.storeId !== storeId || service.status !== 'published') return null;
        return service;
      } catch (error) {
        if (error.errCode === -1 || error.errCode === 'DATABASE_DOCUMENT_NOT_EXIST') return null;
        throw error;
      }
    },

    async listFavoritesByUser(userId) {
      const result = await database.collection('favorites').where({ userId }).get();
      return result.data.map(normalizeDocument);
    },

    async getFavorite(userId, portfolioItemId) {
      const result = await database.collection('favorites')
        .where({ userId, portfolioItemId })
        .limit(1)
        .get();
      return normalizeDocument(result.data[0]);
    },

    async insertFavorite(favorite) {
      await database.collection('favorites').doc(favorite.id).set({ data: withoutId(favorite) });
      return favorite;
    },

    async deleteFavorite(favoriteId) {
      const result = await database.collection('favorites').doc(favoriteId).remove();
      return Boolean(result.stats?.removed);
    },

    async getAvailabilityWindows(storeId, startMs, endMs) {
      const command = rootDatabase.command;
      const result = await database.collection('availabilityWindows').where({
        storeId,
        dayStartMs: command.lte(startMs),
        dayEndMs: command.gte(endMs),
      }).get();
      return result.data.map(normalizeDocument);
    },

    async findBookingByRequestId(customerUserId, requestId) {
      const result = await database.collection('bookings')
        .where({ customerUserId, requestId })
        .limit(1)
        .get();
      return normalizeDocument(result.data[0]);
    },

    async findBlockingPeriods(storeId, startMs, endMs, nowMs) {
      const { isBookingBlocking } = require('../domain/booking-state');
      const command = rootDatabase.command;
      const result = await database.collection('bookings').where({
        storeId,
        occupiedStartMs: command.lt(endMs),
        occupiedEndMs: command.gt(startMs),
      }).get();
      return result.data.map(normalizeDocument)
        .filter((booking) => isBookingBlocking(booking, nowMs))
        .map((booking) => ({
          bookingId: booking.id,
          startMs: booking.occupiedStartMs,
          endMs: booking.occupiedEndMs,
        }));
    },

    async insertBooking(booking) {
      await database.collection('bookings').doc(booking.id).set({ data: withoutId(booking) });
      return booking;
    },

    async getBooking(bookingId) {
      try {
        const result = await database.collection('bookings').doc(bookingId).get();
        return normalizeDocument(result.data);
      } catch (error) {
        if (error.errCode === -1 || error.errCode === 'DATABASE_DOCUMENT_NOT_EXIST') return null;
        throw error;
      }
    },

    async listBookingsByCustomer(customerUserId) {
      const result = await database.collection('bookings')
        .where({ customerUserId })
        .orderBy('createdAtMs', 'desc')
        .get();
      return result.data.map(normalizeDocument);
    },

    async updateBookingIfStatus(bookingId, expectedStatus, changes) {
      const result = await database.collection('bookings')
        .where({ _id: bookingId, status: expectedStatus })
        .update({ data: changes });
      if (!result.stats?.updated) return null;
      return this.getBooking(bookingId);
    },

    async insertNotificationJob(job) {
      await database.collection('notificationJobs').doc(job.id).set({ data: withoutId(job) });
      return job;
    },

    async runTransaction(work) {
      return database.runTransaction(async (transaction) => (
        work(createCloudbaseRepository(transaction, rootDatabase))
      ));
    },
  };
}

module.exports = { createCloudbaseRepository, normalizeDocument, withoutId };
