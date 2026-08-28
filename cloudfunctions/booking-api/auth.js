const { domainError } = require('./domain/validation');

function requireAuthenticated(session) {
  if (!session?.userId) {
    throw domainError('UNAUTHENTICATED', '请先登录');
  }
}

function requireOwner(session, storeId) {
  requireAuthenticated(session);
  if (!session.isOwner || !storeId || session.storeId !== storeId) {
    throw domainError('FORBIDDEN', '无权执行该操作');
  }
}

function requireSelf(session, userId) {
  requireAuthenticated(session);
  if (!userId || session.userId !== userId) {
    throw domainError('FORBIDDEN', '无权查看该客户资料');
  }
}

module.exports = {
  requireAuthenticated,
  requireOwner,
  requireSelf,
};
