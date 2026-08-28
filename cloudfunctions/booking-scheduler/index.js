const cloud = require('wx-server-sdk');
const {
  deliverNotificationJobs,
  enqueueUpcomingReminders,
  expirePendingBookings,
} = require('./jobs');
const { createSchedulerRepository } = require('./repository');

const HOUR_MS = 60 * 60 * 1000;

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const database = cloud.database();
const repository = createSchedulerRepository(database);

async function sendSubscriptionMessage(job) {
  const bookingResult = await database.collection('bookings').doc(job.bookingId).get();
  const booking = bookingResult.data;
  let recipient;
  let templateId;
  if (job.type === 'booking_created') {
    const ownerResult = await database.collection('users').where({
      role: 'owner',
      storeId: booking.storeId,
    }).limit(1).get();
    recipient = ownerResult.data[0];
    templateId = process.env.BOOKING_CREATED_TEMPLATE_ID;
  } else {
    const customerResult = await database.collection('users')
      .doc(booking.customerUserId)
      .get();
    recipient = customerResult.data;
    templateId = process.env.BOOKING_REMINDER_TEMPLATE_ID;
  }
  if (!recipient?.openId || !templateId) {
    const error = new Error('订阅消息接收人或模板未配置');
    error.code = 'MESSAGE_CONFIG_MISSING';
    throw error;
  }
  return cloud.openapi.subscribeMessage.send({
    touser: recipient.openId,
    page: `pages/booking-detail/index?id=${encodeURIComponent(job.bookingId)}`,
    lang: 'zh_CN',
    miniprogramState: process.env.MINIPROGRAM_STATE || 'formal',
    templateId,
    data: {
      thing1: { value: booking.serviceSnapshot.name.slice(0, 20) },
      time2: { value: new Date(booking.startMs).toISOString() },
    },
  });
}

exports.main = async () => {
  const nowMs = Date.now();
  const expirationCount = await expirePendingBookings(repository, nowMs);
  const reminderCount = await enqueueUpcomingReminders(
    repository,
    nowMs + 24 * HOUR_MS,
    nowMs + 24 * HOUR_MS + 5 * 60 * 1000,
  );
  const delivery = await deliverNotificationJobs(repository, sendSubscriptionMessage, nowMs);
  return { expirationCount, reminderCount, ...delivery };
};
