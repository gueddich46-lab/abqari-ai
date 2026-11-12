// Abqari AI — Cloudflare Worker proxy for Groq. Keep GROQ_API_KEY as a secret.
// Redeploy the Groq proxy from GitHub to synchronize Cloudflare with the current source.
const ORIGIN='https://gueddich46-lab.github.io';
const headers={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
function reply(body,status=200){return new Response(JSON.stringify(body),{status,headers})}
export default {async fetch(request,env){
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST')return reply({error:'Method not allowed'},405);
  if(request.headers.get('Origin')!==ORIGIN)return reply({error:'Forbidden origin'},403);
  if(Number(request.headers.get('content-length')||0)>12000)return reply({error:'Message too large'},413);
  if(!env.GROQ_API_KEY)return reply({error:'مفتاح Groq غير مضبوط في Cloudflare.'},503);
  let data;try{data=await request.json()}catch{return reply({error:'Invalid JSON'},400)}
  const message=typeof data.message==='string'?data.message.trim():'';
  if(!message||message.length>2000)return reply({error:'Message must be 1–2000 characters'},400);
  const recent=Array.isArray(data.history)?data.history.slice(-10):[];
  const messages=[{role:'system',content:'You are Abqari AI (عبقري AI), a helpful Arabic-first assistant created by بشير قديش. Respond accurately and clearly.'}];
  for(const x of recent){if(x&&['user','assistant'].includes(x.role)&&typeof x.content==='string'&&x.content.trim())messages.push({role:x.role,content:x.content.slice(0,2000)})}
  messages.push({role:'user',content:message});
  try{
    const upstream=await fetch('https://api.groq.com/openai/v1/chat/completions',{
      method:'POST',headers:{'Authorization':'Bearer '+env.GROQ_API_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({model:'llama-3.1-8b-instant',messages,temperature:0.65,max_completion_tokens:1000}),
      signal:AbortSignal.timeout(25000)
    });
    if(!upstream.ok){
      let detail={};try{detail=await upstream.json()}catch{}
      const raw=String(detail.error?.message||'');
      let reason=upstream.status===401?'مفتاح Groq غير صالح.':upstream.status===429?'تم بلوغ حد استخدام Groq مؤقتًا.':upstream.status===404?'تعذّر العثور على النموذج أو المسار لدى Groq.':'تعذّر الحصول على إجابة من Groq.';
      console.error('Groq upstream status',upstream.status,raw.replace(/gsk_[A-Za-z0-9_-]+/g,'[hidden]').slice(0,160));
      const safeDetail=raw.replace(/gsk_[A-Za-z0-9_-]+/g,'[hidden]').replace(/Bearer\s+\S+/gi,'Bearer [hidden]').slice(0,350);
      return reply({error:reason+' (Groq '+upstream.status+')'+(safeDetail?' — '+safeDetail:'')},upstream.status===429?429:502);
    }
    const result=await upstream.json();
    const answer=result.choices?.[0]?.message?.content;
    return typeof answer==='string'&&answer.trim()?reply({reply:answer.trim()}):reply({error:'لم تصل إجابة من Groq.'},502);
  }catch(e){console.error('Groq request failed',String(e).slice(0,100));return reply({error:'تعذّر الاتصال بخدمة Groq. حاول مجددًا.'},502)}
}};
