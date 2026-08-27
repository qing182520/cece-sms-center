const express=require("express"),router=express.Router(),crypto=require("crypto");
const config=require("../../config"),db=require("../db"),hz=require("../haozhuma");
const sessions=new Map();
function genToken(){return crypto.randomBytes(24).toString("hex")}
function auth(req,res,next){const t=req.headers["x-admin-token"];if(!t||!sessions.has(t))return res.status(401).json({error:"未登录"});req.user=sessions.get(t);next()}
router.post("/login",(req,res)=>{const{username,password}=req.body;const u=db.login(username,password);if(!u)return res.json({ok:false,msg:"账号或密码错误"});const token=genToken();sessions.set(token,u.username);res.json({ok:true,token,username:u.username})});
router.post("/logout",auth,(req,res)=>{sessions.delete(req.headers["x-admin-token"]);res.json({ok:true})});
router.get("/me",auth,(req,res)=>res.json({ok:true,username:req.user}));
router.get("/stats",auth,(req,res)=>res.json(db.stats()));
router.post("/cards/generate",auth,(req,res)=>{const n=Math.max(1,Math.min(500,parseInt(req.body.count)||1));const codes=db.createCards(n);res.json({count:n,codes})});
router.post("/cards/delete",auth,(req,res)=>{const codes=req.body.codes||[];if(!codes.length)return res.json({deleted:0});const n=db.deleteCards(codes);res.json({deleted:n})});
router.get("/cards",auth,(req,res)=>{const page=parseInt(req.query.page)||1;const pageSize=parseInt(req.query.pageSize)||20;const status=req.query.status;const keyword=req.query.keyword;res.json(db.listCards({page,pageSize,status,keyword}))});router.get("/users",auth,(req,res)=>res.json({ok:true,users:db.listUsers()}));
router.post("/users",auth,(req,res)=>{const{username,password}=req.body;if(!username||!password)return res.json({ok:false,msg:"用户名和密码不能为空"});const ok=db.addUser(username,password);res.json({ok,msg:ok?"添加成功":"添加失败(用户名已存在)"});});
router.put("/users/:u/password",auth,(req,res)=>{const ok=db.updateUserPassword(req.params.u,req.body.password);res.json({ok})});
router.delete("/users/:u",auth,(req,res)=>{if(req.params.u===req.user)return res.json({ok:false,msg:"不能删除自己"});const ok=db.deleteUser(req.params.u);res.json({ok})});
router.get("/settings",auth,(req,res)=>{const api_user=db.getSetting("api_user")||config.haozhuma.apiUser;const api_pass=db.getSetting("api_pass")||config.haozhuma.apiPass;const item_id=db.getSetting("item_id")||config.haozhuma.itemId;res.json({ok:true,api_user,api_pass,item_id});});
router.post("/settings",auth,(req,res)=>{if(req.body.api_user!==undefined)db.setSetting("api_user",req.body.api_user);if(req.body.api_pass!==undefined)db.setSetting("api_pass",req.body.api_pass);if(req.body.item_id!==undefined)db.setSetting("item_id",req.body.item_id);hz.overrideCreds(null,null,null);res.json({ok:true})});
router.get("/balance",auth,async(req,res)=>{try{const api_user=db.getSetting("api_user")||config.haozhuma.apiUser;const api_pass=db.getSetting("api_pass")||config.haozhuma.apiPass;hz.overrideCreds(api_user,api_pass);const r=await hz.checkBalance();res.json(r)}catch(e){res.json({error:e.message})}});
router.get("/orders/active",auth,(req,res)=>res.json({ok:true,list:db.listActiveOrders()}));
router.get("/orders/recent",auth,(req,res)=>res.json({ok:true,list:db.listRecentOrders(parseInt(req.query.limit)||50)}));
router.post("/orders/inject",auth,(req,res)=>{const{card,code}=req.body;if(!card||!code)return res.json({ok:false,msg:"卡密和验证码不能为空"});const ok=db.injectSms(card.toUpperCase().trim(),String(code).trim());res.json({ok,msg:ok?"注入成功":"注入失败(卡密或订单不存在)"});});
// ========== Account (账号库管理) ==========
router.get("/accounts/stats",auth,(req,res)=>res.json(db.statsAccounts()));
router.get("/accounts",auth,(req,res)=>{const page=parseInt(req.query.page)||1;const pageSize=parseInt(req.query.pageSize)||20;const status=req.query.status;const keyword=req.query.keyword;res.json(db.listAccounts({page,pageSize,status,keyword}))});
router.post("/accounts/add",auth,(req,res)=>{const phone=String(req.body.phone||"").trim();const order_id=req.body.order_id?String(req.body.order_id).trim():null;if(!/^1\d{10}$/.test(phone))return res.json({ok:false,msg:"手机号格式错误"});const ok=db.addAccount(phone,order_id);res.json({ok,msg:ok?"录入成功":"该手机号已存在"})});
router.post("/accounts/batch",auth,(req,res)=>{const text=String(req.body.text||"");const lines=text.split(/[\r\n,;\s]+/).map(s=>s.trim()).filter(s=>/^1\d{10}$/.test(s));const uniq=[...new Set(lines)];if(!uniq.length)return res.json({ok:false,msg:"未找到有效手机号（每行一个或逗号分隔）"});const remark=req.body.remark?String(req.body.remark).trim():null;const list=uniq.map(p=>({phone:p,remark}));const added=db.addAccountsBatch(list);res.json({ok:true,added,total:uniq.length})});
router.post("/accounts/auto-fetch",auth,async(req,res)=>{const count=Math.max(1,Math.min(500,parseInt(req.body.count)||1));const okList=[];const fail=[];for(let i=0;i<count;i++){try{const r=await hz.getPhone();if(r&&r.phone){db.addAccount(r.phone,r.orderId);okList.push(r.phone)}else fail.push(i)}catch(e){fail.push(i);console.log("fetch fail #"+i,e.message)}}res.json({ok:true,added:okList.length,failed:fail.length,phones:okList})});
router.post("/accounts/delete",auth,(req,res)=>{const ids=(req.body.ids||[]).map(Number).filter(n=>n>0);if(!ids.length)return res.json({deleted:0});const n=db.deleteAccounts(ids);res.json({deleted:n})});
router.post("/accounts/inject",auth,(req,res)=>{const{phone,code}=req.body;if(!phone||!code)return res.json({ok:false,msg:"手机号和验证码不能为空"});const ok=db.injectAccountSms(String(phone).trim(),String(code).trim());res.json({ok,msg:ok?"注入成功，标记为已使用":"注入失败(手机号未录或已使用)"})});
module.exports=router;
