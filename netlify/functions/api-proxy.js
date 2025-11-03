/**
 * Netlify Function: secure-data-proxy (Refactored)
 * Handles AUTH, DATA, and AI generation.
 */
const fetch = require('node-fetch').default || require('node-fetch');

// --- ENVIRONMENT VARIABLES ---
const SQUARESPACE_TOKEN = process.env.SQUARESPACE_ACCESS_TOKEN;
const FIRESTORE_KEY = process.env.DATA_API_KEY;
const PROJECT_ID = process.env.FIRESTORE_PROJECT_ID;
const GEMINI_API_KEY = process.env.FIRST_API_KEY;

// --- BASE URLS ---
const FIRESTORE_BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/`;
const FIRESTORE_QUERY_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery?key=${FIRESTORE_KEY}`;

// --- FEATURE LISTS ---
const DATA_OPERATIONS = ['SAVE_DREAM','LOAD_DREAMS','DELETE_DREAM'];
const TEXT_GENERATION_FEATURES = ["plan","pep_talk","vision_prompt","obstacle_analysis","positive_spin","mindset_reset","objection_handler","smart_goal_structuring","dream_energy_analysis"];

const SYSTEM_INSTRUCTIONS = {
  plan: "You are an expert project manager and motivator...",
  pep_talk: "You are RyGuy, a masculine, inspiring, and enthusiastic life coach...",
  vision_prompt: "You are a creative visual artist...",
  obstacle_analysis: "You are a strategic consultant named RyGuy...",
  positive_spin: "You are an optimistic reframer named RyGuy...",
  mindset_reset: "You are a pragmatic mindset coach named RyGuy...",
  objection_handler: "You are a professional sales trainer named RyGuy...",
  smart_goal_structuring: "You are a professional goal-setting consultant..."
};

// --- SMART GOAL SCHEMA ---
const SMART_GOAL_SCHEMA = {
  type:"object",
  properties:{
    goalTitle:{type:"string"},
    specific:{type:"string"},
    measurable:{type:"string"},
    achievable:{type:"string"},
    relevant:{type:"string"},
    timeBound:{type:"string"}
  },
  required:["goalTitle","specific","measurable","achievable","relevant","timeBound"]
};

// --- CORS ---
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

// --- FIRESTORE HELPERS ---
function jsToFirestoreRest(value){
  if(value===null||value===undefined) return {nullValue:null};
  if(typeof value==='string') return {stringValue:value};
  if(typeof value==='number') return Number.isInteger(value)?{integerValue:String(value)}:{doubleValue:value};
  if(typeof value==='boolean') return {booleanValue:value};
  if(Array.isArray(value)) return {arrayValue:{values:value.map(jsToFirestoreRest)}};
  if(typeof value==='object'){
    const mapFields={};
    for(const k in value){
      if(Object.prototype.hasOwnProperty.call(value,k)) mapFields[k]=jsToFirestoreRest(value[k]);
    }
    return {mapValue:{fields:mapFields}};
  }
  return {stringValue:String(value)};
}

function firestoreRestToJs(firestoreField){
  if(!firestoreField) return null;
  if(firestoreField.nullValue!==undefined) return null;
  if(firestoreField.stringValue!==undefined) return firestoreField.stringValue;
  if(firestoreField.integerValue!==undefined) return parseInt(firestoreField.integerValue,10);
  if(firestoreField.doubleValue!==undefined) return firestoreField.doubleValue;
  if(firestoreField.booleanValue!==undefined) return firestoreField.booleanValue;
  if(firestoreField.timestampValue!==undefined) return new Date(firestoreField.timestampValue);
  if(firestoreField.arrayValue) return (firestoreField.arrayValue.values||[]).map(firestoreRestToJs);
  if(firestoreField.mapValue){
    const obj={};
    const fields=firestoreField.mapValue.fields||{};
    for(const k in fields) if(Object.prototype.hasOwnProperty.call(fields,k)) obj[k]=firestoreRestToJs(fields[k]);
    return obj;
  }
  return null;
}

// --- GENERIC FETCH HELPER ---
async function fetchJson(url, options={}){
  const resp = await fetch(url, options);
  const text = await resp.text();
  if(!resp.ok) throw new Error(text);
  try{return JSON.parse(text);}catch(e){return text;}
}

// --- SQUARESPACE MEMBERSHIP CHECK ---
async function checkSquarespaceMembershipStatus(userId){
  if(userId.startsWith('mock-')||userId==='TEST_USER') return true;
  if(!SQUARESPACE_TOKEN) return false;
  const url = `https://api.squarespace.com/1.0/profiles/check-membership/${userId}`;
  try{
    const data = await fetchJson(url,{headers:{'Authorization':`Bearer ${SQUARESPACE_TOKEN}`,'User-Agent':'RyGuyLabs-Netlify-Function-Checker'}});
    return data?.membershipStatus==='ACTIVE'||data?.subscription?.status==='ACTIVE';
  }catch(e){
    console.error("Squarespace membership check failed:",e);
    return false;
  }
}

// --- EXPORT HANDLER ---
exports.handler = async function(event){
  if(event.httpMethod==='OPTIONS') return {statusCode:200,headers:CORS_HEADERS,body:''};
  if(event.httpMethod!=='POST') return {statusCode:405,headers:CORS_HEADERS,body:JSON.stringify({message:"Method Not Allowed"})};
  if(!GEMINI_API_KEY||!FIRESTORE_KEY||!PROJECT_ID) return {statusCode:500,headers:CORS_HEADERS,body:JSON.stringify({message:"Missing keys"})};

  try{
    const body=JSON.parse(event.body);
    const {action,userId,data,userGoal,textToSpeak,imagePrompt,operation} = body;
    const feature = operation||action||body.feature;
    if(!feature) return {statusCode:400,headers:CORS_HEADERS,body:JSON.stringify({message:"Missing 'action' or 'operation'"})};

    // --- DATA OPERATIONS ---
    if(DATA_OPERATIONS.includes(feature.toUpperCase())){
      if(!userId) return {statusCode:401,headers:CORS_HEADERS,body:JSON.stringify({message:"Missing userId"})};
      if(!await checkSquarespaceMembershipStatus(userId)) return {statusCode:403,headers:CORS_HEADERS,body:JSON.stringify({message:"No active membership"})}};

      const collectionPath=`users/${userId}/dreams`;
      let response;
      switch(feature.toUpperCase()){
        case 'SAVE_DREAM':
          if(!data||typeof data!=='object') return {statusCode:400,headers:CORS_HEADERS,body:JSON.stringify({message:"Missing data object"})};
          response = await fetchJson(`${FIRESTORE_BASE_URL}${collectionPath}?key=${FIRESTORE_KEY}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fields:jsToFirestoreRest(data).mapValue.fields})});
          return {statusCode:200,headers:CORS_HEADERS,body:JSON.stringify({success:true,message:"Dream saved",documentName:response.name})};
        case 'LOAD_DREAMS':
          const structuredQuery={
            select:{fields:[{fieldPath:"*"}]},
            from:[{collectionId:"dreams"}],
            where:{fieldFilter:{field:{fieldPath:"userId"},op:"EQUAL",value:{stringValue:userId}}},
            orderBy:[{field:{fieldPath:"timestamp"},direction:"DESCENDING"}]
          };
          response = await fetchJson(FIRESTORE_QUERY_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({parent:`projects/${PROJECT_ID}/databases/(default)/documents/users/${userId}`,structuredQuery})});
          const dreams=(response||[]).filter(r=>r.document).map(r=>{
            const doc=r.document;
            const docId=doc.name.split('/').pop();
            return {id:docId,...firestoreRestToJs({mapValue:{fields:doc.fields}})};
          });
          return {statusCode:200,headers:CORS_HEADERS,body:JSON.stringify({dreams})};
        case 'DELETE_DREAM':
          if(!data?.dreamId) return {statusCode:400,headers:CORS_HEADERS,body:JSON.stringify({message:"Missing dreamId"})};
          await fetchJson(`${FIRESTORE_BASE_URL}${collectionPath}/${data.dreamId}?key=${FIRESTORE_KEY}`,{method:'DELETE'});
          return {statusCode:200,headers:CORS_HEADERS,body:JSON.stringify({success:true,message:`Dream ${data.dreamId} deleted`})};
        default: return {statusCode:400,headers:CORS_HEADERS,body:JSON.stringify({message:"Invalid data operation"})};
      }
    }

    // --- IMAGE GENERATION ---
    if(feature==='image_generation'){
      if(!imagePrompt) return {statusCode:400,headers:CORS_HEADERS,body:JSON.stringify({message:"Missing imagePrompt"})};
      const IMAGEN_MODEL="imagen-3.0-generate-002";
      const IMAGEN_API_URL=`https://generativelanguage.googleapis.com/v1beta/models/${IMAGEN_MODEL}:predict?key=${GEMINI_API_KEY}`;
      const payload={instances:[{prompt:imagePrompt}],parameters:{sampleCount:1,aspectRatio:"1:1",outputMimeType:"image/png"}};
      const result=await fetchJson(IMAGEN_API_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const base64Data=result?.predictions?.[0]?.bytesBase64Encoded;
      if(!base64Data) throw new Error("Imagen API response missing image data");
      return {statusCode:200,headers:CORS_HEADERS,body:JSON.stringify({imageUrl:`data:image/png;base64,${base64Data}`,altText:`Generated vision for: ${imagePrompt}`})};
    }

    // --- TTS GENERATION ---
    if(feature==='tts'){
      if(!textToSpeak) return {statusCode:400,headers:CORS_HEADERS,body:JSON.stringify({message:"Missing textToSpeak"})};
      const TTS_MODEL="gemini-2.5-flash-preview-tts";
      const TTS_API_URL=`https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
      const payload={contents:[{parts:[{text:textToSpeak}]}],generationConfig:{responseModalities:["AUDIO"],speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:"Puck"}}}},model:TTS_MODEL};
      const result=await fetchJson(TTS_API_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const part=result?.candidates?.[0]?.content?.parts?.find(p=>p.inlineData?.mimeType?.startsWith('audio/'));
      if(!part?.inlineData?.data||!part?.inlineData?.mimeType) throw new Error("TTS API response missing audio");
      return {statusCode:200,headers:CORS_HEADERS,body:JSON.stringify({audioData:part.inlineData.data,mimeType:part.inlineData.mimeType})};
    }

    // --- TEXT GENERATION ---
    if(TEXT_GENERATION_FEATURES.includes(feature)){
      if(!userGoal) return {statusCode:400,headers:CORS_HEADERS,body:JSON.stringify({message:"Missing userGoal"})};
      const TEXT_MODEL="gemini-2.5-pro";
      const TEXT_API_URL=`https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
      const payload={contents:[{parts:[{text:userGoal}]}],generationConfig:{temperature:feature==='smart_goal_structuring'?0.2:0.7}};
      if(feature!=='smart_goal_structuring') payload.systemInstruction={parts:[{text:SYSTEM_INSTRUCTIONS[feature]}]};
      if(feature==='smart_goal_structuring'){payload.generationConfig.responseMimeType="application/json";payload.generationConfig.responseSchema=SMART_GOAL_SCHEMA;}
      const result=await fetchJson(TEXT_API_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      
      if(feature==='smart_goal_structuring'){
        const jsonPart=result.candidates?.[0]?.content?.parts?.[0]?.data;
        if(!jsonPart) throw new Error("SMART goal generation missing structured data");
        return {statusCode:200,headers:CORS_HEADERS,body:JSON.stringify(jsonPart)};
      }

      const fullText=result.candidates?.[0]?.content?.parts?.[0]?.text;
      if(!fullText) throw new Error("Text generation missing output");
      return {statusCode:200,headers:CORS_HEADERS,body:JSON.stringify({text:fullText})};
    }

    return {statusCode:400,headers:CORS_HEADERS,body:JSON.stringify({message:`Invalid feature: ${feature}`})};

  }catch(error){
    console.error("Internal error:",error);
    return {statusCode:500,headers:CORS_HEADERS,body:JSON.stringify({message:`Internal error: ${error.message}`})};
  }
};
