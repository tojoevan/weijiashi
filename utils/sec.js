// 内容安全（小程序审核整改：UGC 内容检测）
// ---------------------------------------------------------------------------
// 1) 图片：网关在入库前强制调微信 img_sec_check，前端绕不过（密钥只在网关）。
//    但该接口有 1MB 上限，所以上传前先把图片压到上限内，避免被判「过大」而存不进去。
// 2) 文本：保存前调网关 /api/sec/msg（微信 msg_sec_check v2）。
// 3) 提示：对外一律只说「内容含违规信息」，不暴露任何检测细节——审核要求第 2 条。
// ---------------------------------------------------------------------------
const sync = require('./sync/index.js');

// 对外统一文案：只说明「含违规信息」，不透露命中了哪类违规
const RISK_TIP = '内容含违规信息，请更换后重试';
const TOO_LARGE_TIP = '图片过大，请重新选择';
const BUSY_TIP = '内容检测服务暂不可用，请稍后重试';

// img_sec_check 官方上限 1MB，留约 10% 余量
const MAX_BYTES = 900 * 1024;

function getSize(filePath) {
  return new Promise((resolve, reject) => {
    if (typeof wx.getFileSystemManager !== 'function') return reject(new Error('no fs'));
    wx.getFileSystemManager().getFileInfo({
      filePath,
      success: (r) => resolve(r.size || 0),
      fail: reject
    });
  });
}

function compress(src, quality) {
  return new Promise((resolve, reject) => {
    if (typeof wx.compressImage !== 'function') return reject(new Error('no compressImage'));
    wx.compressImage({ src, quality, success: (r) => resolve(r.tempFilePath), fail: reject });
  });
}

// 保证待上传图片 ≤ MAX_BYTES（img_sec_check 上限）。
// 返回：可用路径；无法压到上限内返回 null（调用方提示「图片过大」）。
// 量不到尺寸（老基础库）时退回原图，交由网关判定。
async function fitForUpload(filePath) {
  if (!filePath) return null;
  let cur = filePath;
  let size = await getSize(cur).catch(() => 0);
  if (size > 0 && size <= MAX_BYTES) return cur;
  for (const q of [70, 45]) {
    const next = await compress(cur, q).catch(() => null);
    if (!next) break;
    cur = next;
    size = await getSize(cur).catch(() => 0);
    if (size > 0 && size <= MAX_BYTES) return cur;
  }
  return size === 0 ? cur : null;
}

// 文本检测：true=可发布。网关未部署该端点时放行（避免新版本小程序在旧网关上无法保存）。
function checkText(content) {
  if (typeof sync.checkText !== 'function') return Promise.resolve(true);
  return sync.checkText(content);
}

// 保存前检测文本：不通过时弹通用提示并返回 false
async function ensureTextOk(content) {
  const ok = await checkText(content).catch(() => true);
  if (!ok) wx.showToast({ title: RISK_TIP, icon: 'none' });
  return ok;
}

// 统一处理上传失败：违规 / 过大 / 检测不可用 各给一句通用文案，其余走通用失败提示
function handleUploadError(e) {
  const m = (e && e.message) || '';
  if (m === 'CONTENT_RISK') wx.showToast({ title: RISK_TIP, icon: 'none' });
  else if (m === 'IMAGE_TOO_LARGE') wx.showToast({ title: TOO_LARGE_TIP, icon: 'none' });
  else if (m === 'SEC_UNAVAILABLE') wx.showToast({ title: BUSY_TIP, icon: 'none' });
  else wx.showToast({ title: '上传失败，请稍后重试', icon: 'none' });
}

module.exports = {
  RISK_TIP,
  TOO_LARGE_TIP,
  BUSY_TIP,
  MAX_BYTES,
  fitForUpload,
  checkText,
  ensureTextOk,
  handleUploadError
};
