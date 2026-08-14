const icons = require('../../utils/icons.js');
const theme = require('../../utils/theme.js');

Page({
  data: {
    icons,
    themes: theme.THEMES,
    active: theme.getActiveThemeId(),
    themeStyle: theme.getThemeStyle()
  },
  onShow() {
    this.setData({ active: theme.getActiveThemeId(), themeStyle: theme.getThemeStyle() });
  },
  pick(e) {
    const id = e.currentTarget.dataset.id;
    theme.setTheme(id);
    this.setData({ active: id, themeStyle: theme.getThemeStyle(id) });
  },
  goBack() {
    wx.navigateBack();
  }
});
