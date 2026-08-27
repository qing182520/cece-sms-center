const axios=require("axios"),config=require("../config"),db=require("./db");
const{serverUrl,endpoint:ep}=config.haozhuma;
const apiBase=serverUrl+(ep||"/sms/");
let _apiUser=config.haozhuma.apiUser,_apiPass=config.haozhuma.apiPass,_itemId=config.haozhuma.itemId;
let token=null,tokenExpire=0;
function overrideCreds(u,p,item){if(u)_apiUser=u;if(p)_apiPass=p;if(item)_itemId=item;token=null;tokenExpire=0}
function getCreds(){const su=db.getSetting("api_user"),sp=db.getSetting("api_pass"),si=db.getSetting("item_id");return{apiUser:su||_apiUser,apiPass:sp||_apiPass,itemId:si||_itemId}}
// code===0 表示成功（豪猪平台）
function isSuccess(d){return d&&(d.code===0||d.code==="0")}

async function login(){
  const now=Date.now();
  if(token&&now<tokenExpire)return token;
  const{apiUser,apiPass}=getCreds();
  try{
    const r=await axios.get(apiBase,{params:{api:"login",user:apiUser,pass:apiPass},timeout:10000});
    if(isSuccess(r.data)){
      token=r.data.token;
      tokenExpire=Date.now()+7200000;
      return token;
    }
    throw new Error("Login failed: "+JSON.stringify(r.data));
  }catch(e){
    token=null;
    throw new Error("Login error: "+e.message);
  }
}

async function checkBalance(){
  const tk=await login();
  const r=await axios.get(apiBase,{params:{api:"getSummary",token:tk},timeout:10000});
  return r.data;
}

async function getPhone(customItemId){
  const tk=await login();
  const{itemId}=getCreds();
  const sid=String(customItemId||itemId);
  const r=await axios.get(apiBase,{params:{api:"getPhone",token:tk,sid},timeout:10000});
  if(isSuccess(r.data)){
    const d=r.data;
    return{phone:String(d.phone),orderId:String(d.uid||d.order_id||d.phone)};
  }
  throw new Error("Get phone failed: "+JSON.stringify(r.data));
}

async function getSms(orderId,phone){
  const tk=await login();
  const{itemId}=getCreds();
  const r=await axios.get(apiBase,{params:{api:"getMessage",token:tk,sid:itemId,phone:phone},timeout:10000});
  const d=r.data;
  if(!d)return{pending:false,msg:"empty response"};
  // 只有 code=0 才代表真的拿到了短信；其他code（-1/-2/1等）统一视为等待中或无消息
  if(isSuccess(d)){
    const txt=d.content||d.message||d.sms||d.code||d.data||d.msg||"";
    const sms=String(txt).match(/\d{4,8}/)?.[0];
    if(sms)return{sms,full:r.data};
    // 成功但没提取到数字验证码 → 也继续等
    return{pending:true,full:r.data,raw:String(txt)};
  }
  if(d.code===-1||(d.msg||"").includes("等待")||(d.msg||"").includes("没有获取"))return{pending:true};
  return{pending:true,full:r.data,msg:d.msg||JSON.stringify(r.data)};
}

async function releasePhone(orderId,phone){
  const tk=await login();
  const{itemId}=getCreds();
  try{
    await axios.get(apiBase,{params:{api:"cancelRecv",token:tk,sid:itemId,phone:phone||""},timeout:10000});
  }catch(e){console.log("release error:",e.message)}
}

async function addBlacklist(phone){
  const tk=await login();
  const{itemId}=getCreds();
  try{
    await axios.get(apiBase,{params:{api:"addBlacklist",token:tk,sid:itemId,phone},timeout:10000});
  }catch(e){console.log("blacklist error:",e.message)}
}

module.exports={login,checkBalance,getPhone,getSms,releasePhone,addBlacklist,overrideCreds};
