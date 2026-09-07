import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import OpenAI from "openai";

const SB = process.env.SUPABASE_URL;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;

function sbHeaders(extra={}) {
  return { apikey: SRK, Authorization: `Bearer ${SRK}`, "Content-Type":"application/json", ...extra };
}
async function sb(path, options={}) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...options, headers: sbHeaders(options.headers||{}) });
  const text = await r.text();
  let data=null; try { data=text?JSON.parse(text):null; } catch { data=text; }
  if(!r.ok) throw new Error(data?.message || `Supabase ${r.status}`);
  return data;
}
function cleanJson(s){
  s=String(s||"").trim().replace(/^```json\s*/i,"").replace(/^```\s*/,"").replace(/```$/,"").trim();
  return JSON.parse(s);
}
async function analyzeAttachment(att){
  if(!process.env.OPEN_KEY && !process.env.OPENAI_API_KEY) throw new Error("Nedostaje OpenAI API ključ (OPEN_KEY).");
  const client = new OpenAI({apiKey:process.env.OPEN_KEY || process.env.OPENAI_API_KEY});
  const mime=att.contentType||"application/pdf";
  const data=`data:${mime};base64,${att.content.toString("base64")}`;
  const content=[{type:"input_text",text:`Očitaj ulaznu fakturu. Vrati ISKLJUČIVO validan JSON:
{"supplier":"","invoice_number":"","invoice_date":"YYYY-MM-DD","due_date":"YYYY-MM-DD","subtotal":0,"vat":0,"total":0,"items":[{"code":"","name":"","quantity":0,"unit_price":0,"total":0}]}
Ne izmišljaj podatke. Za nečitljivo polje koristi prazan string ili 0. Iznosi su brojevi bez oznake valute.`}];
  if(mime==="application/pdf") content.push({type:"input_file",filename:att.filename||"invoice.pdf",file_data:data});
  else content.push({type:"input_image",image_url:data,detail:"high"});
  const resp=await client.responses.create({model:process.env.OPENAI_INVOICE_MODEL||"gpt-5.6-luna",input:[{role:"user",content}]});
  return cleanJson(resp.output_text);
}
async function syncMailbox(){
  const client=new ImapFlow({
    host:process.env.IMAP_HOST,
    port:Number(process.env.IMAP_PORT||993),
    secure:String(process.env.IMAP_SECURE||"true")!=="false",
    auth:{user:process.env.IMAP_USER,pass:process.env.IMAP_PASSWORD},
    logger:false
  });
  await client.connect();
  try{
    const lock=await client.getMailboxLock("INBOX");
    try{
      const uids=await client.search({seen:false});
      for(const uid of uids.slice(-20)){
        const exists=await sb(`scan_queue?select=id&imap_uid=eq.${uid}`);
        if(exists?.length) continue;
        const msg=await client.fetchOne(uid,{source:true,uid:true,envelope:true,internalDate:true});
        const parsed=await simpleParser(msg.source);
        const att=(parsed.attachments||[]).find(a=>a.contentType==="application/pdf" || a.contentType?.startsWith("image/"));
        if(!att) continue;
        let analysis,status="ready",err=null;
        try{ analysis=await analyzeAttachment(att); }catch(e){status="error";err=e.message;analysis={};}
        await sb("scan_queue",{
          method:"POST",headers:{Prefer:"return=minimal"},
          body:JSON.stringify({
            imap_uid:String(uid),message_id:parsed.messageId||null,filename:att.filename||"scan",
            received_at:(parsed.date||msg.internalDate||new Date()).toISOString(),status,error_message:err,
            ai_result:analysis
          })
        });
      }
    } finally { lock.release(); }
  } finally { await client.logout(); }
}
export default async function handler(req,res){
  try{
    if(!SB||!SRK) throw new Error("Nedostaje Supabase server konfiguracija.");
    if(req.method==="POST"){
      const {id,action}=req.body||{};
      if(action!=="processed"||!id) return res.status(400).json({error:"Neispravan zahtjev."});
      await sb(`scan_queue?id=eq.${encodeURIComponent(id)}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({processed:true,processed_at:new Date().toISOString()})});
      return res.status(200).json({ok:true});
    }
    if(req.method!=="GET") return res.status(405).json({error:"Method not allowed"});
    if(process.env.IMAP_HOST&&process.env.IMAP_USER&&process.env.IMAP_PASSWORD) await syncMailbox();
    const rows=await sb("scan_queue?select=id,filename,received_at,status,error_message,ai_result&processed=eq.false&order=received_at.desc&limit=50");
    const items=(rows||[]).map(r=>({id:r.id,filename:r.filename,received_at:r.received_at,status:r.status,error:r.error_message,...(r.ai_result||{})}));
    return res.status(200).json({items});
  }catch(e){ return res.status(500).json({error:e.message}); }
}
