const { callApi } = require('../../../api/cloud-api');
Page({
  data: { items: [], title: '', summary: '', imageFileIds: [], saving: false },
  onShow() { this.load(); },
  async load() { try { this.setData({ items: await callApi('catalog.listPortfolio', { storeId: getApp().globalData.storeId, limit: 30 }) }); } catch (error) { wx.showToast({ title: error.message, icon: 'none' }); } },
  update(event) { this.setData({ [event.currentTarget.dataset.field]: event.detail.value }); },
  async createDraft() {
    return callApi('admin.portfolio.save', { storeId: getApp().globalData.storeId, title: this.data.title || '未命名作品', summary: this.data.summary, imageFileIds: this.data.imageFileIds, coverFileId: this.data.imageFileIds[0] || '', tags: [], serviceIds: [], status: 'draft' });
  },
  async chooseAndUpload() {
    this.setData({ saving: true });
    try {
      const draft = await this.createDraft();
      const choice = await wx.chooseMedia({ count: 9, mediaType: ['image'] });
      const imageFileIds = [...this.data.imageFileIds];
      for (const file of choice.tempFiles) {
        const result = await wx.cloud.uploadFile({ cloudPath: `portfolio/${draft.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`, filePath: file.tempFilePath });
        imageFileIds.push(result.fileID);
        await callApi('admin.portfolio.save', { storeId: getApp().globalData.storeId, portfolioItemId: draft.id, title: this.data.title || '未命名作品', summary: this.data.summary, imageFileIds, coverFileId: imageFileIds[0], tags: [], serviceIds: [], status: 'draft' });
      }
      this.setData({ imageFileIds }); wx.showToast({ title: '草稿已保存' });
    } catch (error) { wx.showToast({ title: `草稿已保留：${error.message}`, icon: 'none' }); }
    finally { this.setData({ saving: false }); }
  },
  async publish(event) { try { await callApi('admin.portfolio.publish', { storeId: getApp().globalData.storeId, portfolioItemId: event.currentTarget.dataset.id }); await this.load(); } catch (error) { wx.showToast({ title: error.message, icon: 'none' }); } },
});
