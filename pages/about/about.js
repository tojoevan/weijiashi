const theme = require("../../utils/theme.js");
const icons = require('../../utils/icons.js');

Page({
  data: {
    themeStyle: theme.getThemeStyle(),
    icons
  },
  goBack() {
    wx.navigateBack();
  },
  toast(e) {
    wx.showToast({ title: e.currentTarget.dataset.t, icon: 'none' });
  },
  onShow() {
    this.setData({ themeStyle: theme.getThemeStyle() });
  }
});