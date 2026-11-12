// Cloudflare Worker backend for Abqari AI.
// Set GEMINI_API_KEY as an encrypted Worker secret, never in GitHub Pages.
const ORIGIN='https://gueddich46-lab.github.io';
const headers={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
function reply(body,status=200){return new Response(JSON.stringify(body),{status,headers})}
export default {async fetch(request,env){
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST')return reply({error:'Method not allowed'},405);
  if(request.headers.get('Origin')!==ORIGIN)return reply({error:'Forbidden origin'},403);
  if(Number(request.headers.get('content-length')||0)>12000)return reply({error:'Message too large'},413);
  if(!env.GEMINI_API_KEY)return reply({error:'AI service not configured'},503);
  let data;try{data=await request.json()}catch{return reply({error:'Invalid JSON'},400)}
  const message=typeof data.message==='string'?data.message.trim():'';
  if(!message||message.length>2000)return reply({error:'Message must be 1–2000 characters'},400);
  const recent=Array.isArray(data.history)?data.history.slice(-10):[];
  const contents=recent.filter(x=>x&&['user','assistant'].includes(x.role)&&typeof x.content==='string').map(x=>({role:x.role==='assistant'?'model':'user',parts:[{text:x.content.slice(0,2000)}]}));
  contents.push({role:'user',parts:[{text:message}]});
  try{
    const upstream=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':env.GEMINI_API_KEY},body:JSON.stringify({systemInstruction:{parts:[{text:'You are Abqari AI, a helpful Arabic-first assistant. Respond clearly and accurately. App created by Bashir Qaddish (بشير قديش).'}]},contents,generationConfig:{maxOutputTokens:1000}})});
    if(!upstream.ok)return reply({error:upstream.status===429?'انتهت الحصة المتاحة مؤقتًا':'خدمة الذكاء الاصطناعي غير متاحة الآن'},upstream.status===429?429:502);
    const result=await upstream.json();const text=result.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('').trim();
    return text?reply({reply:text}):reply({error:'لم تصل إجابة من الخدمة'},502)
  }catch{return reply({error:'تعذّر الاتصال بخدمة الذكاء الاصطناعي'},502)}
}};
