/**
 * ============================================================
 *  🚀 测测App 验证码自动触发脚手架 (cece-trigger.js)
 * ============================================================
 *
 *  ⚠️  重要说明（你必须先做的事情）：
 *
 *  测测App为了防止机器人注册，对每个请求都有：
 *   - 设备指纹校验 (IMEI / OAID / Android-ID / deviceId)
 *   - 请求签名 (sign 参数，通常 MD5/SHA1 拼字段)
 *   - 时间戳+nonce 防重放
 *   - 版本号、渠道号、UA 校验
 *   - 可能有 SSL Pinning（证书绑定，普通Fiddler抓不到HTTPS）
 *
 *  ============================================================
 *  🛠️ 第一步：用手机抓包工具获取"发送验证码"接口的完整请求
 *  ============================================================
 *
 *  推荐工具（任选其一）：
 *   - Android: HttpCanary（推荐，免root，需安装CA证书）
 *   - Android: Charles + 绕过SSL Pinning（可用 Frida / Objection / LSPosed 等）
 *   - iOS: Stream / Thor / Charles
 *
 *  抓包流程：
 *   1. 准备一台测试手机，安装证书 + 设置代理
 *   2. 打开测测App → 新用户登录 → 输入任意手机号 → 点击「获取验证码」
 *   3. 在抓包里找到发送验证码的请求
 *   4. 复制下面的信息填入 CONFIG 对象里
 *
 *  ============================================================
 *  📋 要从抓包里提取的字段：
 *  ============================================================
 *   - 请求方法 (POST / GET)
 *   - 完整 URL (如 https://xxx.xxx.com/xxx/sms/send)
 *   - Headers 全部内容（最重要：User-Agent / sign / token / device-id 等）
 *   - Body 请求体参数：字段名和示例值
 *     通常：phone, scene(场景), entranceCode, timestamp, sign, nonce, deviceId, version 等
 *   - 手机号字段的参数名
 *
 *  ============================================================
 *  🧪 填入后测试：
 *     node cece-trigger.js --phone 13800138000
 *  如果成功会返回类似 {code:200, success:true, ...}
 *  然后将它和系统集成，读取待触发队列自动发送。
 * ============================================================
 */

const axios = require("axios");

// ============= 👇 在这里粘贴你抓包的结果 =============
const CONFIG = {
  // 接口URL
  url: "https://enjoy-club-app-api.yuexiuproperty.cn/open/api/api/v1/verifyCode/get",

  // 请求方法 GET 或 POST
  method: "GET",

  // 手机号参数名（抓包里用于传手机号的字段名）
  phoneField: "phone",

  // 其他固定参数（GET query 参数，或 POST 的 body/json 参数）
  params: {
    // === CSDN 博客里看到的参数格式（可能已过时，请替换为真实抓包内容）===
    entranceCode: 3,
    scene: 0,
    phoneCode: 86,
    // ====== 抓包后补齐：timestamp / sign / nonce / deviceId 等 ======
    // timestamp: Math.floor(Date.now()/1000),
    // nonce: "random-string",
    // deviceId: "你的设备ID",
    // version: "10.53.0",
    // sign: "签名算法结果(抓包研究算法)",
  },

  // 如果是 POST JSON: "json"；POST 表单: "form"；GET 参数就用上面 params
  bodyType: "query",   // "query" | "json" | "form"

  // Headers（从抓包完整复制，特别是 App 带的自定义 Header）
  headers: {
    "User-Agent": "okhttp/4.3.1",   // 示例，请替换为真实
    // "device-id": "xxx",
    // "token": "",
    // "sign": "",
    // "app-version": "10.53.0",
    // "channel": "official",
    // "platform": "android",
  },

  // 超时（毫秒）
  timeout: 10000,
};
// ============= 👆 配置结束 =============


/**
 * 调用测测API发送验证码
 * @param {string} phone  11位手机号
 */
async function sendCodeCeCe(phone) {
  if (!/^1\d{10}$/.test(phone)) throw new Error("手机号格式不正确：" + phone);

  const payload = { ...CONFIG.params };
  payload[CONFIG.phoneField] = phone;

  const axiosOpts = {
    method: CONFIG.method,
    url: CONFIG.url,
    headers: CONFIG.headers,
    timeout: CONFIG.timeout,
    validateStatus: () => true,
  };

  if (CONFIG.method === "GET" || CONFIG.bodyType === "query") {
    axiosOpts.params = payload;
  } else if (CONFIG.bodyType === "json") {
    axiosOpts.data = payload;
    if (!axiosOpts.headers["Content-Type"]) axiosOpts.headers["Content-Type"] = "application/json";
  } else if (CONFIG.bodyType === "form") {
    const { URLSearchParams } = require("url");
    const sp = new URLSearchParams();
    Object.keys(payload).forEach(k => sp.append(k, payload[k]));
    axiosOpts.data = sp.toString();
    if (!axiosOpts.headers["Content-Type"]) axiosOpts.headers["Content-Type"] = "application/x-www-form-urlencoded";
  }

  try {
    const r = await axios(axiosOpts);
    console.log(`\n[${new Date().toLocaleTimeString()}] 请求 ${CONFIG.method} ${CONFIG.url}`);
    console.log("  参数:", JSON.stringify(payload));
    console.log(`  状态: HTTP ${r.status}`);
    console.log("  响应:", JSON.stringify(r.data));
    return { ok: r.status === 200, status: r.status, data: r.data };
  } catch (e) {
    console.error("  错误:", e.message);
    return { ok: false, error: e.message };
  }
}

/* ============================================================
 *  📡 与管理系统集成：自动轮询「待触发面板」队列，自动发码
 *  取消下面注释即可使用（抓包配置正确后）
 * ============================================================ */
/*
const BACKEND = "http://localhost:3000";
let running = true;
async function loopTrigger() {
  console.log("\n🤖 自动触发脚本启动，连接后端:", BACKEND);
  while (running) {
    try {
      // 这里不登录管理后台，直接从公开用户API拿活跃号码不方便，可以从自定义API拉取
      // 简易做法：你把待触发号码放在 backend 的 orders.active 列表，用管理token读取
      console.log("  [待接入] 请先完善登录管理后台获取活跃订单列表逻辑");
    } catch (e) {
      console.error("loopTrigger error:", e.message);
    }
    await sleep(15000);  // 每15秒扫一次
  }
}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
*/


// ========= CLI 入口：node cece-trigger.js --phone 13800138000 =========
if (require.main === module) {
  const args = process.argv.slice(2);
  const phoneIdx = args.indexOf("--phone");
  const phone = phoneIdx >= 0 ? args[phoneIdx + 1] : null;

  console.log("=".repeat(60));
  console.log("🚀 测测App 验证码发送触发器 (脚手架)");
  console.log("=".repeat(60));

  if (!phone) {
    console.log("\nℹ️  用法示例:");
    console.log("   node cece-trigger.js --phone 13800138000");
    console.log("\n⚠️  请先抓包，并编辑本脚本 CONFIG 对象填入真实接口参数！");
    console.log("   现在用的是占位配置，大概率无法成功。\n");
    process.exit(0);
  }

  console.log("\n📱 目标手机号:", phone);
  console.log("⏳ 正在调用测测 API 发送验证码...");
  sendCodeCeCe(phone).then(r => {
    console.log(r.ok ? "\n✅ 发送请求完成（请以测测App返回结果为准）" : "\n❌ 发送失败");
  });
}

module.exports = { sendCodeCeCe, CONFIG };
