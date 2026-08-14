const theme = require("../../utils/theme.js");
const icons = require('../../utils/icons.js');

Page({
  data: {
    themeStyle: theme.getThemeStyle(),
    icons
  },
  goBack() { wx.navigateBack(); },
  subscribe() {
    wx.showToast({ title: '微家事永久免费', icon: 'none' });
  },
  onShow() {
    this.setData({ themeStyle: theme.getThemeStyle() });
  }
});
