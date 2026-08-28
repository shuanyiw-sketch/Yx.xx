const { callApi } = require('./api/cloud-api');

App({
  globalData: {
    isOwner: false,
    sessionReady: null,
    store: null,
    user: null,
  },

  onLaunch() {
    if (!wx.cloud) {
      console.error('当前微信版本不支持云开发');
      return;
    }

    wx.cloud.init({ traceUser: true });
    this.globalData.sessionReady = this.bootstrapSession();
  },

  async bootstrapSession() {
    try {
      const session = await callApi('session.get');
      this.globalData.user = session.user || null;
      this.globalData.store = session.store || null;
      this.globalData.isOwner = session.isOwner === true;
      return session;
    } catch (error) {
      console.error('登录状态初始化失败', error);
      return null;
    }
  },
});
