/**
 * ============================================================
 *  🖥️ 悟空分身 + 测测App 自动化 [电脑端 Node.js + ADB 版]
 *  文件: wukong-adb.js
 * ============================================================
 *
 *  这个脚本在你自己的电脑上运行，控制通过 USB/WiFi ADB 连接的安卓手机。
 *
 *  =============== 准备工作 ================
 *  1. 电脑安装 ADB 工具（安卓开发者桥）：
 *     - Windows: 下载 Android SDK Platform Tools
 *       https://dl.google.com/android/repository/platform-tools-latest-windows.zip
 *       解压后把路径加入系统 PATH
 *
 *  2. 手机开启「开发者选项」 + 「USB 调试」：
 *     - 设置 → 系统 → 关于手机 → 连续点击版本号 7 次 → 开启开发者选项
 *     - 返回 → 开发者选项 → 打开「USB 调试」+「USB安装」+「模拟点击」
 *     - USB 数据线连接电脑，手机弹窗「允许此PC调试」点确定
 *
 *  3. 验证连接：
 *     cmd: adb devices
 *     应该看到一个设备号（不是 unauthorized）
 *
 *  4. 手机上安装【悟空分身】+ 在悟空里创建 2 个【测测】分身
 *
 *  =============== 第一次使用 ================
 *  1. 运行脚本的「坐标录制模式」:
 *     node wukong-adb.js --record
 *     → 它会告诉你每一步操作的坐标 / 或用截图记录控件位置
 *
 *  2. 把坐标记录到下面 CONFIG 对象里
 *
 *  =============== 启动 ================
 *  node wukong-adb.js      # 开始自动循环拉队列 + 控制手机
 */

const { execSync, spawn } = require("child_process");
const axios = require("axios");
const fs = require("fs");

// ================== 👇 配置区 =====================
const CONFIG = {
  // 服务器（一般就是本机，但是手机和电脑要同WiFi所以用局域网IP）
  SERVER: "http://localhost:3000",
  ADMIN_USER: "hui182h",
  ADMIN_PASS: "hui182h",

  // ADB 可执行文件路径（如果 adb 不在 PATH 里，就写绝对路径）
  ADB: "adb",
  // 设备号（adb devices 看到的那个。多设备时要填，单设备留空）
  DEVICE: "",

  // ======== 悟空分身 App 包名 / Activity 入口 ========
  WUKONG_PKG: "com.wukong.dual",
  WUKONG_LAUNCH: "com.wukong.dual/.MainActivity",   // 替换成真实入口
  CECE_PKG: "com.hellotalk.tantan2",                 // 测测包名（请验证）

  // ======== 坐标（用 --record 模式录制）========
  // 说明：坐标是屏幕绝对像素点，用「adb shell screencap -p /sdcard/x.png; adb pull /sdcard/x.png」截图取像素
  //       也可以用 Android Studio Device Explorer 截图看坐标
  COORDS: {
    // 悟空主界面：两个「测测」分身图标的中心坐标 [x, y]
    clone0: [540, 1200],   // 测测 - 分身0（第一个）
    clone1: [540, 1700],   // 测测 - 分身1（第二个）
    launchBtn: [540, 2000],// 点击「启动」或直接点图标后弹出的启动按钮

    // 测测登录界面（以 1080x2340 屏幕为例）
    agreeCheckbox:  [100, 2000],  // 同意协议勾选框
    phoneInput:     [540, 1200],  // 手机号输入框
    getCodeBtn:     [540, 1600],  // 「获取验证码」按钮
  },

  // 获取验证码步骤数（循环 2 次就清悟空数据）
  CLONE_CYCLE: 2,
  CLONE_WAIT_MS: 6000,   // 启动每个分身等待 App 打开的时间
  STEP_WAIT_MS: 2000,    // 每步 UI 操作的等待（秒）
};
// ================== 👆 配置结束 =====================


let adminToken = null;
let doneCount = 0;

/* ---------------- ADB 工具 ---------------- */
function adb(args){
  const cmd = CONFIG.ADB + (CONFIG.DEVICE ? " -s " + CONFIG.DEVICE : "") + " " + args;
  try { return execSync(cmd, { timeout: 15000 }).toString().trim() }
  catch(e) { return e.stderr ? e.stderr.toString().trim() : "" }
}
function tap(x,y){ return adb("shell input tap " + x + " " + y) }
function type(text){ return adb('shell input text "' + String(text) + '"') }
function key(n){ return adb("shell input keyevent " + n) }
function home(){ return key(3) }
function launch(pkg,activity){
  if(activity) return adb("shell am start -n " + pkg + "/" + activity);
  return adb("shell monkey -p " + pkg + " -c android.intent.category.LAUNCHER 1");
}
function clearApp(pkg){ return adb("shell pm clear " + pkg) }
function screenshot(file){
  adb("shell screencap -p /sdcard/_shot.png");
  const local = file || "./screenshot_"+Date.now()+".png";
  adb("pull /sdcard/_shot.png \""+local+"\"");
  return local;
}

/* ---------------- 后端 API ---------------- */
const H = () => ({ headers: { "Content-Type": "application/json", "x-admin-token": adminToken || "" } });

async function login(){
  console.log("\n🔐 登录管理后台: "+CONFIG.SERVER);
  const r = await axios.post(CONFIG.SERVER+"/admin/api/login",
    {username:CONFIG.ADMIN_USER, password:CONFIG.ADMIN_PASS},{timeout:10000});
  if(!r.data.ok){ console.log("❌ 登录失败",r.data); process.exit(1) }
  adminToken = r.data.token;
  console.log("✅ 登录成功, token="+adminToken.substring(0,16)+"...");
}

async function pullQueue(){
  try{
    const r = await axios.get(CONFIG.SERVER+"/admin/api/orders/active",H());
    return r.data.list || [];
  }catch(e){ console.log("  pullQueue 失败: "+e.message); return [] }
}

/* ---------------- 录制模式 ---------------- */
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}

async function recordMode(){
  console.log("\n🎥 坐标录制模式\n");
  console.log("请根据提示在手机上完成每一步，脚本会自动截屏保存。");
  console.log("截图保存在: wukong-screencaps/  用图片查看器打开，看像素坐标。\n");

  fs.mkdirSync("./wukong-screencaps",{recursive:true});

  const steps = [
    ["1_悟空分身首页","请打开悟空分身首页，确认两个测测分身都能看到 → 回车"],
    ["2_启动测测分身0","点击测测分身0（第一个）并启动 → 回车"],
    ["3_测测登录页","现在应该在测测登录首页，能看到手机号输入框和获取验证码按钮 → 回车"],
    ["4_勾选协议并输入手机号","随意输入号码，准备点击获取验证码 → 回车"],
    ["5_点击获取验证码后","点击了获取验证码，出现倒计时 → 回车"],
  ];

  for(const [name,msg] of steps){
    await new Promise(r=>{ require("readline").createInterface(process.stdin,process.stdout).question(msg+" ",r) });
    const file = "./wukong-screencaps/"+name+".png";
    screenshot(file);
    console.log("  ✅ 已保存截图: " + file + "\n");
  }

  console.log("录制完成！用图片查看器打开 wukong-screencaps/*.png，");
  console.log("把每个关键元素的 [x,y] 像素坐标填进 wukong-adb.js 的 CONFIG.COORDS 里。");
}

/* ---------------- 核心：号码触发流程 ---------------- */
async function triggerOneNumber(phone, cloneIdx){
  console.log("\n🚀 处理手机号 " + phone + " 用悟空分身#"+cloneIdx);

  // 1. 回桌面 → 启动悟空分身
  home(); await sleep(500);
  launch(CONFIG.WUKONG_PKG, CONFIG.WUKONG_LAUNCH);
  await sleep(4000);

  // 2. 点选分身
  const cl = cloneIdx===0 ? CONFIG.COORDS.clone0 : CONFIG.COORDS.clone1;
  console.log("  点击分身"+cloneIdx+"图标 ("+cl[0]+","+cl[1]+")");
  tap(cl[0], cl[1]);
  await sleep(CONFIG.CLONE_WAIT_MS);

  // 3. 测测登录：勾同意
  if(CONFIG.COORDS.agreeCheckbox){
    tap(CONFIG.COORDS.agreeCheckbox[0],CONFIG.COORDS.agreeCheckbox[1]);
    await sleep(800);
  }

  // 4. 输入手机号
  tap(CONFIG.COORDS.phoneInput[0],CONFIG.COORDS.phoneInput[1]);
  await sleep(800);
  // adb input text 不支持中文，但数字没问题
  adb("shell input keyevent 67 67 67 67 67 67 67 67 67 67 67 67");  // 清场
  await sleep(300);
  type(phone);
  console.log("  输入手机号 ✓");
  await sleep(CONFIG.STEP_WAIT_MS);

  // 5. 点击「获取验证码」
  tap(CONFIG.COORDS.getCodeBtn[0],CONFIG.COORDS.getCodeBtn[1]);
  console.log("  点击「获取验证码」✓");
  await sleep(2000);
  console.log("  ⌛ 验证码发送中... 等待 20 秒让豪猪平台收码");
  await sleep(20000);
  console.log("  ✅ 此号码触发完成，验证码应自动回显到前端");

  home();
  await sleep(2000);
}

function cleanWukongData(){
  console.log("\n🧹 清除悟空分身数据（pm clear " + CONFIG.WUKONG_PKG + "）");
  // 注意：pm clear 需要手机上授权，弹出确认框需要点"确定"（如果系统弹出）
  const r = clearApp(CONFIG.WUKONG_PKG);
  console.log("  结果:", r || "(成功 - 无输出=成功)");
  console.log("  ⚠️  接下来你需要重新在悟空分身里创建2个测测分身才能继续！");
  console.log("  （或者用 adb 做钛备份恢复分身数据，进阶用法）");
}

/* ---------------- 主循环 ---------------- */
async function mainLoop(){
  console.log("🤖 主循环开始... (Ctrl+C 终止)\n");
  while(true){
    const list = await pullQueue();
    if(!list.length){
      console.log("⏳ 待触发队列为空，30秒后再查... (Ctrl+C 退出)");
      await sleep(30000);
      continue;
    }

    console.log("📋 拉取到 "+list.length+" 个待触发号码");

    for(const item of list){
      const phone = item.phone;
      const cloneIdx = doneCount % CONFIG.CLONE_CYCLE;
      try {
        await triggerOneNumber(phone, cloneIdx);
      } catch(e){
        console.log("  ❌ 处理出错:", e.message);
        continue;
      }
      doneCount++;
      console.log("  📊 累计已处理: "+doneCount);

      // 每 2 个号码清悟空数据
      if(doneCount % CONFIG.CLONE_CYCLE === 0){
        cleanWukongData();
        console.log("\n⚠️  悟空分身已清数据，等待60秒给你重建分身...");
        await sleep(60000); // 给你1分钟重新设置分身
      }
    }
  }
}

/* ---------------- CLI 入口 ---------------- */
async function cli(){
  const args = process.argv.slice(2);
  console.log("=".repeat(60));
  console.log("🖥️  悟空分身 + 测测 App 自动化 (Node.js+ADB 版)");
  console.log("=".repeat(60));

  // 检查 adb 可用性
  try {
    const devs = execSync(CONFIG.ADB + " devices").toString();
    console.log("\n📱 ADB设备列表:\n"+devs);
    if(!devs.trim().match(/\tdevice$/m)){
      console.log("❌ 没有连接的设备。请连接USB并开USB调试。");
      console.log("   Windows 可以在 cmd 里运行 adb devices 检查。");
    }
  }catch(e){
    console.log("❌ ADB 未找到，请安装 Android Platform Tools 并加入 PATH");
  }

  if(args.includes("--record")){ await recordMode(); return }

  // 正常模式：登录 + 循环
  await login();
  await mainLoop();
}

cli().catch(e => { console.error("致命错误:", e); process.exit(1) });
