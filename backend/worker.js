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
    // Discover models enabled for this particular API key, avoiding hardcoded retired/unavailable models.
    const modelResponse=await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=100',{headers:{'x-goog-api-key':env.GEMINI_API_KEY}});
    if(!modelResponse.ok){
      let detail={};try{detail=(await modelResponse.json()).error||{}}catch{}
      const msg=String(detail.message||'');
      const hint=/api.key.not.valid|api key not valid|api_key_invalid/i.test(msg)?'مفتاح Gemini غير صالح.':/permission|not enabled/i.test(msg)?'تحقق من صلاحيات مفتاح Gemini.':'تعذّر جلب النماذج المتاحة من Gemini.';
      return reply({error:hint+' (Gemini '+modelResponse.status+')'},502);
    }
    const modelData=await modelResponse.json();
    const available=(modelData.models||[]).filter(m=>Array.isArray(m.supportedGenerationMethods)&&m.supportedGenerationMethods.includes('generateContent'));
    const preferred=['gemini-3.8-flash','gemini-3-flash','gemini-3.5-flash','gemini-2.5-flash-lite','gemini-2.5-flash','gemini-2.0-flash'];
    const model=preferred.map(id=>available.find(m=>m.name==='models/'+id)).find(Boolean)||available.find(m=>/gemini.*flash/i.test(m.name))||available.find(m=>/gemini/i.test(m.name));
    if(!model)return reply({error:'لا يوجد نموذج Gemini متاح لتوليد الإجابات بهذا المفتاح.'},502);
    const candidates=[...new Set([...preferred.map(id=>'models/'+id),...available.map(m=>m.name)])].filter(name=>available.some(m=>m.name===name)).slice(0,5);
    const payload=JSON.stringify({systemInstruction:{parts:[{text:'You are Abqari AI, a helpful Arabic-first assistant. Respond clearly and accurately. App created by Bashir Qaddish (بشير قديش).'}]},contents,generationConfig:{maxOutputTokens:1000}});
    let upstream;
    for(const name of candidates){
      for(let attempt=0;attempt<2;attempt++){
        upstream=await fetch('https://generativelanguage.googleapis.com/v1beta/'+name+':generateContent',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':env.GEMINI_API_KEY},body:payload});
        if(upstream.ok)break;
        if(![429,500,502,503,504].includes(upstream.status))break;
        if(attempt===0)await new Promise(resolve=>setTimeout(resolve,700));
      }
      if(upstream.ok||![429,500,502,503,504].includes(upstream.status))break;
    }
    if(!upstream.ok){const status=upstream.status;let detail={};try{detail=(await upstream.json()).error||{}}catch{}const raw=String(detail.message||'').toLowerCase();let reason='';if(/api.key.not.valid|api key not valid|invalid api key|api_key_invalid|api key is invalid/.test(raw))reason='مفتاح Gemini غير صالح، راجع القيمة المحفوظة في Cloudflare.';else if(/api key.*(expired|blocked)|key.*(expired|blocked)/.test(raw))reason='مفتاح Gemini منتهي أو محظور.';else if(/location|region|country|not supported/.test(raw))reason='الخدمة أو النموذج غير متاح في المنطقة أو للحساب.';else if(/quota|rate limit|resource exhausted/.test(raw))reason='تم بلوغ حد استخدام Gemini.';else if(/model.*not found|not found.*model/.test(raw))reason='النموذج غير متاح لهذا الحساب.';else if(/permission|not enabled|access/.test(raw))reason='صلاحيات الوصول إلى Gemini غير مكتملة.';else if(/invalid|malformed|bad request/.test(raw))reason='هناك إعداد غير صالح في طلب Gemini.';else if(status===404)reason='لم يجد Gemini النموذج المطلوب أو مسار الخدمة.';else reason='رفض Gemini الطلب دون سبب محدد.';const safeDetail=String(detail.message||'').replace(/AIza[0-9A-Za-z_-]{20,}/g,'[hidden]').replace(/key=[^\s&]+/gi,'key=[hidden]').slice(0,360);console.error('Gemini upstream error',status,model.name,safeDetail);return reply({error:`${reason} (Gemini ${status})${safeDetail?' — '+safeDetail:''}`},status===429?429:502)}
    const result=await upstream.json();const text=result.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('').trim();
    return text?reply({reply:text}):reply({error:'لم تصل إجابة من الخدمة'},502)
  }catch{return reply({error:'تعذّر الاتصال بخدمة الذكاء الاصطناعي'},502)}
}};
