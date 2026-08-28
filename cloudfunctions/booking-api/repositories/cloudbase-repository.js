function normalizeDocument(document) {
  if (!document) return null;
  const { _id, ...fields } = document;
  return { id: _id, ...fields };
}

function createCloudbaseRepository(database) {
  return {
    async getSession(openId) {
      const result = await database.collection('users').where({ openId }).limit(1).get();
      const user = normalizeDocument(result.data[0]);
      if (!user) return null;
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

    async listPublishedPortfolio(storeId) {
      const result = await database.collection('portfolioItems')
        .where({ storeId, status: 'published' })
        .orderBy('sortOrder', 'asc')
        .get();
      return result.data.map(normalizeDocument);
    },

    async listPublishedServices(storeId) {
      const result = await database.collection('services')
        .where({ storeId, status: 'published' })
        .orderBy('sortOrder', 'asc')
        .get();
      return result.data.map(normalizeDocument);
    },

    async runTransaction(work) {
      return database.runTransaction(async (transaction) => (
        work(createCloudbaseRepository(transaction))
      ));
    },
  };
}

module.exports = { createCloudbaseRepository, normalizeDocument };
