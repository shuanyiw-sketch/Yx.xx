const crypto = require('node:crypto');
const { requireOwner } = require('../auth');
const { domainError } = require('../domain/validation');
const { createBookingService } = require('./booking-service');

function id(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function assertMinutes(value) {
  if (!Number.isInteger(value) || value < 0) {
    throw domainError('INVALID_DURATION', '服务时长和缓冲时间必须是整数分钟');
  }
}

function createAdminService(repository) {
  const bookingService = createBookingService(repository);
  return {
    async getDashboard(storeId, session) {
      requireOwner(session, storeId);
      return { bookings: await repository.listBookingsByStore(storeId) };
    },

    async saveService(input, session) {
      requireOwner(session, input?.storeId);
      if (!input.name?.trim()) throw domainError('INVALID_SERVICE', '请填写服务名称');
      if (!Number.isInteger(input.durationMinutes) || input.durationMinutes <= 0) {
        throw domainError('INVALID_DURATION', '服务时长必须是正整数分钟');
      }
      assertMinutes(input.bufferBeforeMinutes);
      assertMinutes(input.bufferAfterMinutes);
      const existing = input.serviceId ? await repository.getService(input.serviceId) : null;
      if (existing && existing.storeId !== input.storeId) {
        throw domainError('FORBIDDEN', '无权执行该操作');
      }
      return repository.saveService({
        ...existing,
        id: existing?.id || id('service'),
        storeId: input.storeId,
        name: input.name.trim(),
        description: input.description || '',
        referencePriceFen: input.referencePriceFen || 0,
        durationMinutes: input.durationMinutes,
        bufferBeforeMinutes: input.bufferBeforeMinutes,
        bufferAfterMinutes: input.bufferAfterMinutes,
        status: input.status || existing?.status || 'draft',
        updatedAtMs: input.nowMs || Date.now(),
      });
    },

    async unpublishService(input, session) {
      requireOwner(session, input?.storeId);
      const service = await repository.getService(input.serviceId);
      if (!service || service.storeId !== input.storeId) {
        throw domainError('SERVICE_NOT_FOUND', '服务不存在');
      }
      return repository.updateService(service.id, {
        status: 'unpublished',
        updatedAtMs: input.nowMs || Date.now(),
      });
    },

    async commandBooking(input, session) {
      requireOwner(session, input?.storeId);
      const booking = await repository.getBooking(input.bookingId);
      if (!booking || booking.storeId !== input.storeId) {
        throw domainError('BOOKING_NOT_FOUND', '预约不存在');
      }
      return bookingService.transitionBooking(input, session);
    },

    async recordReceipt(input, session) {
      requireOwner(session, input?.storeId);
      const booking = await repository.getBooking(input.bookingId);
      if (!booking || booking.storeId !== input.storeId) {
        throw domainError('BOOKING_NOT_FOUND', '预约不存在');
      }
      if (!Number.isInteger(input.amountFen) || input.amountFen <= 0
        || !['deposit', 'final'].includes(input.type)
        || !Number.isFinite(input.receivedAtMs)) {
        throw domainError('INVALID_RECEIPT', '收款记录无效');
      }
      const receipts = [...(booking.receipts || []), {
        id: id('receipt'),
        amountFen: input.amountFen,
        type: input.type,
        receivedAtMs: input.receivedAtMs,
        note: input.note || '',
      }];
      return repository.updateBookingIfStatus(booking.id, booking.status, {
        receipts,
        receivedTotalFen: receipts.reduce((sum, receipt) => sum + receipt.amountFen, 0),
        updatedAtMs: input.nowMs || Date.now(),
      });
    },

    async savePortfolio(input, session) {
      requireOwner(session, input?.storeId);
      const existing = input.portfolioItemId
        ? await repository.getPortfolioItem(input.portfolioItemId)
        : null;
      if (existing && existing.storeId !== input.storeId) {
        throw domainError('FORBIDDEN', '无权执行该操作');
      }
      return repository.savePortfolioItem({
        ...existing,
        ...input,
        id: existing?.id || id('portfolio'),
        status: input.status || existing?.status || 'draft',
      });
    },

    async publishPortfolio(input, session) {
      requireOwner(session, input?.storeId);
      const item = await repository.getPortfolioItem(input.portfolioItemId);
      if (!item || item.storeId !== input.storeId) {
        throw domainError('PORTFOLIO_NOT_FOUND', '作品不存在');
      }
      return repository.savePortfolioItem({ ...item, status: 'published' });
    },

    async reorderPortfolio(input, session) {
      requireOwner(session, input?.storeId);
      const updated = [];
      for (const [sortOrder, portfolioItemId] of input.portfolioItemIds.entries()) {
        const item = await repository.getPortfolioItem(portfolioItemId);
        if (!item || item.storeId !== input.storeId) {
          throw domainError('PORTFOLIO_NOT_FOUND', '作品不存在');
        }
        updated.push(await repository.savePortfolioItem({ ...item, sortOrder }));
      }
      return updated;
    },

    async listCustomers(storeId, session) {
      requireOwner(session, storeId);
      const bookings = await repository.listBookingsByStore(storeId);
      const customers = new Map();
      for (const booking of bookings) {
        customers.set(booking.customerUserId, {
          userId: booking.customerUserId,
          customer: booking.customer,
        });
      }
      return [...customers.values()];
    },

    async getCustomer(input, session) {
      requireOwner(session, input?.storeId);
      const bookings = (await repository.listBookingsByStore(input.storeId))
        .filter((booking) => booking.customerUserId === input.customerUserId);
      if (!bookings.length) throw domainError('CUSTOMER_NOT_FOUND', '客户不存在');
      return { customer: bookings[0].customer, bookings };
    },

    async saveStore(input, session) {
      requireOwner(session, input?.storeId);
      const updated = await repository.updateStore(input.storeId, {
        name: input.name,
        introduction: input.introduction || '',
        contactText: input.contactText || '',
        bookingPolicy: input.bookingPolicy || '',
      });
      if (!updated) throw domainError('STORE_NOT_FOUND', '店铺不存在');
      return updated;
    },
  };
}

module.exports = { createAdminService };
