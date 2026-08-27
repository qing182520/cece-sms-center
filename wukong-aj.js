/* ============================================================
 *  📱 悟空分身 + 测测App 自动化脚本 [手机端 Auto.js 版]
 *  文件: wukong-aj.js
 * ============================================================
 *
 *  ✅ 推荐方案：Auto.js 直接在手机上跑，不需要电脑
 *
 *  🛠️ 第一步（准备环境）：
 *    1. 手机下载安装【Auto.js 4.1.1 / AutoX.js】（百度搜索）
 *       - 推荐 AutoX.js v6 或 7（免费、新版）
 *       - 官网：https://github.com/kkevsekk1/AutoX
 *    2. 打开 AutoX.js → 右上角「+」→ 新建文件 → 粘贴本脚本
 *    3. 把系统的「无障碍服务」授权给 AutoX.js（脚本会提示你）
 *    4. 手机已经安装：【悟空分身】 + 测测App（在分身里面）
 *
 *  🧪 第二步（第一次使用，需要你手动记录控件/id）：
 *    1. 在 AutoX.js 主界面 → 工具 → 布局分析 → 开启「布局范围分析」
 *    2. 手动打开悟空分身 → 点「测测」分身启动
 *    3. 对测测里的每个按钮点一下，抄下控件的：
 *         - id/text/desc/content-desc 任一即可
 *    4. 把下面 CONFIG 里的控件 ID 改对
 *
 *  🔄 第三步（每2个分身，清除悟空分身数据的操作）：
 *    因为悟空分身每用2个免费分身后需要清数据再用下一轮2个
 *    脚本里有 CLEAN_WUKONG_EVERY 配置，默认每 2 个号码会触发：
 *         系统设置 → 应用管理 → 悟空分身 → 清除数据
 *    这个需要你在 CONFIG 里填入包名和清除数据的按钮（可选）
 *
 *  🚀 启动：
 *    - 运行脚本 → 弹出浮窗 → 点击「开始」按钮
 *    - 脚本会循环：
 *        ① 从你的管理后台 http://YOUR_IP:3000 拉取「待触发队列」中的手机号
 *        ② 启动悟空分身的下一个分身 → 自动打开测测 → 输入手机号 → 点获取验证码
 *        ③ 查本地短信（如果有短信权限）或 等待后端收到验证码
 *        ④ 循环下一个号码
 *
 * ============================================================ */

// ===================== 👇 配置区 ========================
const CONFIG = {
  // 电脑/服务器地址（把 localhost 改成你电脑在同一个WiFi下的局域网IP！！
  // 比如你电脑IP是 192.168.1.108，这里就填 http://192.168.1.108:3000）
  SERVER: "http://192.168.1.108:3000",

  // 管理后台账号密码（需要登录才能拉待触发队列）
  ADMIN_USER: "hui182h",
  ADMIN_PASS: "hui182h",

  // 悟空分身 App 包名 + 测测App包名
  WUKONG_PKG: "com.wukong.dual",        // 实际包名如果不对请改
  CECE_PKG:   "com.hellotalk.tantan2",   // 测测的包名（需要确认）
  LAUNCHER_PKG: "com.android.launcher3", // 桌面

  // ======== 悟空分身操作控件配置 ========
  WUKONG: {
    // 启动悟空分身后，分身列表里的「测测」分身图标/文字
    appIconText: "测测",
    // 选择分身序号的控件（分身0/分身1）
    cloneItemDescPrefix: "测测 - 分身",
  },

  // ======== 测测 App 登录界面控件配置 ========
  CECE: {
    // 【手机号输入框】的 id/text/desc （任选其一）
    phoneInputId: "",
    phoneInputText: "请输入手机号",
    phoneInputDesc: "",
    // 【同意协议勾选框】的 text 或 id（如果有的话）
    agreeText: "同意",
    // 【获取验证码】按钮
    getCodeBtnText: "获取验证码",
    getCodeBtnDesc: "",
  },

  // ======== 每轮清除数据的配置 ========
  CLEAN_WUKONG_EVERY: 2,   // 每N个号码清除悟空分身数据（免费版限2个）
  CLEAN_METHOD: "auto",    // "auto" = 自动清除；"manual" = 弹窗提示你手动清
};
// ===================== 👆 配置结束 =====================


let adminToken = null;
let doneCount = 0;
let stopFlag = false;

/* ---------------- 工具函数 ---------------- */
function log(msg){
  const line = "[" + new Date().toLocaleTimeString() + "] " + msg;
  console.log(line);
  if(typeof ui !== "undefined" && ui.run) ui.run(function(){ /* if logView exists: append */ });
  toast(msg);
}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}

/* ---------------- HTTP 请求 ---------------- */
function http(url,opt){
  return threads.start(function(){
    try {
      const res = opt ? http.postJson(url, opt) : http.get(url);
      const body = res.body.string();
      return { status: res.statusCode, body: body };
    } catch(e){ return { error: e.message } }
  });
}

async function api(path, method, body){
  const url = CONFIG.SERVER + path;
  const headers = { "Content-Type": "application/json" };
  if(adminToken) headers["x-admin-token"] = adminToken;
  const res = await http(url, method==="POST"? {
    url: url, method: "POST", headers: headers, body: JSON.stringify(body)
  } : null);
  if(res.error){ log("❌ HTTP失败: " + res.error); return null }
  try { return JSON.parse(res.body) } catch(e){ return {} }
}

async function loginAdmin(){
  log("🔐 登录管理后台...");
  const r = await api("/admin/api/login", "POST", {
    username: CONFIG.ADMIN_USER, password: CONFIG.ADMIN_PASS
  });
  if(r && r.ok){ adminToken = r.token; log("✅ 登录成功"); return true }
  log("❌ 登录失败，请检查IP和账号密码"); return false;
}

async function pullQueue(){
  const r = await api("/admin/api/orders/active", "GET");
  if(r && r.ok) return r.list || [];
  return [];
}

/* ---------------- UI 操作 ---------------- */

// 通用：找到控件并点击
function tapControl(findFn, desc){
  for(let i=0;i<5;i++){
    const el = findFn();
    if(el && el.clickable()){ log("  ✅ 点击: "+desc); el.click(); return true }
    if(el && el.bounds()){
      const b = el.bounds(); log("  ✅ 坐标点击: "+desc+" ("+b.centerX()+","+b.centerY()+")");
      click(b.centerX(), b.centerY()); return true;
    }
    sleep(500);
  }
  log("  ❌ 找不到控件: "+desc); return false;
}

// 启动悟空分身并打开测测第 idx 个分身
function openClone(idx){
  log("🚀 启动悟空分身, 打开第 "+idx+" 个测测分身...");
  app.launchPackage(CONFIG.WUKONG_PKG);
  sleep(3000);

  // 找到"测测 - 分身N"并点击
  const target = CONFIG.WUKONG.cloneItemDescPrefix + idx;
  tapControl(()=>desc(target) || text(target).findOne(500), target);
  sleep(5000);  // 等待测测启动
}

// 在测测App里输入手机号并触发验证码
async function sendCodeInCeCe(phone){
  log("📝 在测测App输入手机号: " + phone);

  // 1) 勾同意协议
  if(CONFIG.CECE.agreeText){
    tapControl(()=>text(CONFIG.CECE.agreeText).findOne(2000), "同意协议");
    sleep(500);
  }

  // 2) 点击手机号输入框 + 粘贴号码
  const input = CONFIG.CECE.phoneInputId
    ? id(CONFIG.CECE.phoneInputId).findOne(3000)
    : text(CONFIG.CECE.phoneInputText).findOne(3000);
  if(!input){ log("❌ 找不到手机号输入框"); return false }
  input.click(); sleep(300);
  setText(input, phone); sleep(800);

  // 3) 点击「获取验证码」
  const ok = tapControl(()=>{
    const b = CONFIG.CECE.getCodeBtnText ? text(CONFIG.CECE.getCodeBtnText).findOne(1500) : null;
    return b || (CONFIG.CECE.getCodeBtnDesc ? desc(CONFIG.CECE.getCodeBtnDesc).findOne(1000):null);
  }, "获取验证码");

  if(ok) log("✅ 已点击「获取验证码」，验证码会发送给豪猪接码平台");
  return ok;
}

// 回桌面 + 清除悟空分身数据（每2个分身触发一次）
function cleanWukong(){
  if(CONFIG.CLEAN_METHOD === "manual"){
    dialogs.alert("操作提醒","请手动：系统设置 → 应用 → 悟空分身 → 清除全部数据\n清除完成后点击确定继续。");
    return;
  }
  log("🧹 自动清除悟空分身数据...");
  // 通过 shell 命令清除（需要 Root 或 授权 Device Owner）
  const clearCmd = "pm clear " + CONFIG.WUKONG_PKG;
  try{
    const result = shell(clearCmd, true);
    log("  pm clear 结果: " + result.result + " " + result.msg);
    home(); sleep(1000);
  }catch(e){
    log("  ⚠️ 清除失败（可能没有Root权限），改用手动提示");
    dialogs.alert("需要清除悟空分身数据",
      "悟空分身免费版每2个分身后需要清数据。\n\n"+
      "请手动：系统设置 → 应用管理 → 找到【悟空分身】 → 存储 → 清除全部数据\n\n"+
      "清理完成后点击确定，脚本继续运行。");
  }
}

/* ---------------- 主循环 ---------------- */
async function mainLoop(){
  stopFlag = false;
  while(!stopFlag){
    // 拉队列表
    const list = await pullQueue();
    if(!list.length){
      log("⏳ 暂无待触发手机号，30秒后再查...");
      sleep(30000);
      continue;
    }

    log("📋 取到 "+list.length+" 个待触发号码");

    for(let i=0;i<list.length;i++){
      if(stopFlag) return;
      const item = list[i];
      const cloneIdx = doneCount % 2; // 0,1,0,1,... 两个分身循环

      log("\n===== ["+(i+1)+"/"+list.length+"] "+item.phone+" 卡密:"+item.card_code+" =====");
      log("  用悟空分身 #"+cloneIdx+" 启动");

      openClone(cloneIdx);
      const ok = await sendCodeInCeCe(item.phone);
      if(!ok){ log("  ⚠️  发送失败，跳过"); continue }

      log("  ⌛ 等待 15 秒确保验证码发送到豪猪平台...");
      sleep(15000);

      doneCount++;
      log("  ✅ 已完成 "+doneCount+" 个号码");

      // 每 CLEAN_WUKONG_EVERY 个清一次悟空数据
      if(doneCount % CONFIG.CLEAN_WUKONG_EVERY === 0){
        log("\n📦 已用满 "+CONFIG.CLEAN_WUKONG_EVERY+" 个免费分身 → 清除悟空数据");
        cleanWukong();
        sleep(3000);
      }

      home();
      sleep(3000);
    }

    // 列表处理完，休息一下再拉新队列
    log("\n💤 当前队列处理完，30 秒后拉取下一批...");
    sleep(30000);
  }
}

/* ---------------- 启动入口 ---------------- */
async function start(){
  log("🤖 悟空分身+测测自动化 启动");
  log("🌐 服务器地址: " + CONFIG.SERVER);
  log("⚠️  注意：手机和电脑必须在同一个 WiFi 下！");

  if(!(await loginAdmin())){
    dialogs.alert("无法连接服务器","请检查:\n"+
      "1. CONFIG.SERVER 填的是不是你电脑局域网IP？\n"+
      "   (cmd里 ipconfig，找 WiFi IPv4 地址)\n"+
      "2. 服务器是否已启动 (npm.cmd start)？\n"+
      "3. 电脑防火墙有没有允许 3000 端口？");
    return;
  }

  // 启动主循环（不阻塞UI）
  threads.start(function(){ mainLoop() });
}

// 如果是 Auto.js 带 UI 环境，渲染按钮
try {
  "ui";
  ui.layout(
    <vertical padding="20">
      <text textSize="20sp" textStyle="bold" text="🤖 悟空分身 + 测测自动化"/>
      <text textColor="#888" text="v1.0  (每个分身≈新设备，自动取新人连麦券)"/>
      <card cardCornerRadius="10" marginTop="16" cardBackgroundColor="#F0F7FF">
        <vertical padding="14">
          <text>服务器: {CONFIG.SERVER}</text>
          <text>账号: {CONFIG.ADMIN_USER}</text>
          <text>每 {CONFIG.CLEAN_WUKONG_EVERY} 个号码清除悟空数据</text>
        </vertical>
      </card>
      <button id="startBtn" marginTop="20" style="Widget.AppCompat.Button.Colored">▶️ 开始自动触发</button>
      <button id="stopBtn" marginTop="10">⏹️ 停止</button>
      <input id="logView" h="250" marginTop="14" textSize="11sp" gravity="top" background="#111" textColor="#0f0"/>
    </vertical>
  );
  ui.startBtn.click(() => start());
  ui.stopBtn.click(() => { stopFlag = true; log("⏹️ 已收到停止信号"); });
  log("✅ UI加载完成，点击「开始自动触发」");
} catch(e){
  // 非 UI 环境直接跑
  start();
}
