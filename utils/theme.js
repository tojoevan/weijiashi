// 微家事 · 主题（多色调）配置
// 每个主题同时接管：强调色(品牌/家庭) + 中性底色(背景/弱表面/边框/占位渐变) + 语义色(提醒 warn)
// 切换后整页氛围统一变化，提醒卡与提醒标签也随主题协调。

const THEMES = [
  { id: 'pine', name: '松绿',
    brand: '#4F7A5C', brandSoft: '#E4EEE7', family: '#6E9C7A', familySoft: '#E8F1EB',
    bg: '#F7FAF7', surfaceMuted: '#EDF3EE', borderSubtle: '#E2EAE3', borderStrong: '#CBD8CE',
    gA: '#E4EDE7 0%, #D3E0D7 100%', gB: '#D3E0D7 0%, #B9CCBF 100%', gC: '#DEF0E3 0%, #C7DBCF 100%',
    warn: '#4F7A5C', warnSoft: '#E4EEE7' },
  { id: 'original', name: '木棕',
    brand: '#8B6F47', brandSoft: '#F0E9DE', family: '#7A8471', familySoft: '#E7EBE3',
    bg: '#FAFAF7', surfaceMuted: '#F2EFE8', borderSubtle: '#E8E4DD', borderStrong: '#D6D2C8',
    gA: '#EDE8DE 0%, #DBD4C7 100%', gB: '#DBD4C7 0%, #BFB5A3 100%', gC: '#E5E0D4 0%, #D1C9BA 100%',
    warn: '#D4A64A', warnSoft: '#F9F1DD' },
  { id: 'indigo', name: '黛蓝',
    brand: '#4A5D7E', brandSoft: '#E6EAF1', family: '#6B8CAE', familySoft: '#E8EEF3',
    bg: '#F7F8FB', surfaceMuted: '#EEF1F6', borderSubtle: '#E1E6EE', borderStrong: '#CBD3DF',
    gA: '#E4E9F1 0%, #D2DAE6 100%', gB: '#D2DAE6 0%, #B6C2D4 100%', gC: '#DCE3EE 0%, #C6D0DE 100%',
    warn: '#4A5D7E', warnSoft: '#E6EAF1' },
  { id: 'rose', name: '胭脂',
    brand: '#A65C5C', brandSoft: '#F4E7E7', family: '#B07A8C', familySoft: '#F1E6EA',
    bg: '#FBF8F7', surfaceMuted: '#F6EFEE', borderSubtle: '#EFE6E4', borderStrong: '#E0D2CF',
    gA: '#F1E7E6 0%, #E4D3D1 100%', gB: '#E4D3D1 0%, #D2BBB8 100%', gC: '#EDE2E1 0%, #DAC9C7 100%',
    warn: '#A65C5C', warnSoft: '#F4E7E7' },
  { id: 'amber', name: '暖橙',
    brand: '#B5793F', brandSoft: '#F5EADF', family: '#C99A4E', familySoft: '#F6EEDF',
    bg: '#FBF9F5', surfaceMuted: '#F6EFE4', borderSubtle: '#EFE7D9', borderStrong: '#E0D2BD',
    gA: '#F1E8DB 0%, #E5D6C2 100%', gB: '#E5D6C2 0%, #D2BEA4 100%', gC: '#EDE3D4 0%, #DBC9B3 100%',
    warn: '#B5793F', warnSoft: '#F5EADF' },
  { id: 'violet', name: '墨紫',
    brand: '#6B5B8E', brandSoft: '#ECE8F2', family: '#8A7BAE', familySoft: '#EFEBF4',
    bg: '#FAF8FB', surfaceMuted: '#F1EDF4', borderSubtle: '#E8E2EE', borderStrong: '#D6CCDD',
    gA: '#ECE6F1 0%, #DBD0E4 100%', gB: '#DBD0E4 0%, #C3B6D4 100%', gC: '#E7E0EE 0%, #D2C6DD 100%',
    warn: '#6B5B8E', warnSoft: '#ECE8F2' }
];

function getThemeById(id) {
  return THEMES.find(t => t.id === id) || THEMES[0];
}

function getActiveThemeId() {
  try {
    return wx.getStorageSync('theme') || THEMES[0].id;
  } catch (e) {
    return THEMES[0].id;
  }
}

// 返回可内联到根节点 style 的 CSS 变量覆盖串（强调色 + 中性底色 + 占位渐变 + 语义提醒色）
function getThemeStyle(id) {
  const t = getThemeById(id || getActiveThemeId());
  return '--brand:' + t.brand + ';--brand-soft:' + t.brandSoft +
         ';--family:' + t.family + ';--family-soft:' + t.familySoft +
         ';--bg-canvas:' + t.bg + ';--surface-muted:' + t.surfaceMuted +
         ';--border-subtle:' + t.borderSubtle + ';--border-strong:' + t.borderStrong +
         ';--g-a:' + t.gA + ';--g-b:' + t.gB + ';--g-c:' + t.gC +
         ';--warning:' + t.warn + ';--warning-soft:' + t.warnSoft + ';';
}

function setTheme(id) {
  try { wx.setStorageSync('theme', id); } catch (e) {}
}

module.exports = { THEMES, getThemeById, getActiveThemeId, getThemeStyle, setTheme };
