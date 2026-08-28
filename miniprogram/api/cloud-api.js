function createCloudApi(callFunction) {
  return async function callApi(action, payload = {}) {
    const { result } = await callFunction({
      name: 'booking-api',
      data: { action, payload },
    });

    if (!result?.ok) {
      const error = new Error(result?.error?.message || '请求失败，请稍后重试');
      error.code = result?.error?.code || 'UNKNOWN';
      throw error;
    }

    return result.data;
  };
}

const callApi = createCloudApi((options) => wx.cloud.callFunction(options));

module.exports = { callApi, createCloudApi };
