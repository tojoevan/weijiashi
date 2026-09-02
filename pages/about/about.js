const theme = require("../../utils/theme.js");
const icons = require('../../utils/icons.js');
const version = require('../../utils/version.js');

Page({
  data: {
    themeStyle: theme.getThemeStyle(),
    icons,
    appVersion: version.APP_VERSION
  },
  goBack() {
    wx.navigateBack();
  },
  onShow() {
    this.setData({ themeStyle: theme.getThemeStyle() });
  }
});