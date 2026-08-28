function normalize(document) {
  if (!document) return null;
  const fields = { ...document };
  const id = fields._id;
  delete fields._id;
  return { id, ...fields };
}

function createSchedulerRepository(database) {
  const command = database.command;
  return {
    async listExpiredPending(nowMs) {
      const result = await database.collection('bookings').where({
        status: 'pending',
        lockedUntil: command.lte(nowMs),
      }).get();
      return result.data.map(normalize);
    },

    async updateBookingIfStatus(bookingId, expectedStatus, changes) {
      const result = await database.collection('bookings')
        .where({ _id: bookingId, status: expectedStatus })
        .update({ data: changes });
      return result.stats?.updated ? { id: bookingId, ...changes } : null;
    },

    async listConfirmedBookingsStartingBetween(windowStartMs, windowEndMs) {
      const result = await database.collection('bookings').where({
        status: 'confirmed',
        startMs: command.and(command.gte(windowStartMs), command.lt(windowEndMs)),
      }).get();
      return result.data.map(normalize);
    },

    async insertNotificationJobIfAbsent(job) {
      return database.runTransaction(async (transaction) => {
        try {
          await transaction.collection('notificationJobs').doc(job.id).get();
          return false;
        } catch (error) {
          if (error.errCode !== -1 && error.errCode !== 'DATABASE_DOCUMENT_NOT_EXIST') throw error;
        }
        const fields = { ...job };
        delete fields.id;
        await transaction.collection('notificationJobs').doc(job.id).set({ data: fields });
        return true;
      });
    },

    async listDueNotificationJobs(nowMs) {
      const result = await database.collection('notificationJobs').where({
        status: command.in(['pending', 'retry']),
        nextAttemptAtMs: command.lte(nowMs),
      }).get();
      return result.data.map(normalize);
    },

    async updateNotificationJobIfStatus(jobId, expectedStatus, changes) {
      const result = await database.collection('notificationJobs')
        .where({ _id: jobId, status: expectedStatus })
        .update({ data: changes });
      return result.stats?.updated ? { id: jobId, ...changes } : null;
    },
  };
}

module.exports = { createSchedulerRepository };
