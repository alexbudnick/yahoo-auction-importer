// Bound Google Apps Script for the AFFOG auction companion.
// Script Properties: AIRTABLE_TOKEN (read/write records, Auction Workflow base only).
const BASE='appxuwca7ioU2Tnrd', TABLE='tblMutxAENhGTZows';
const TABS=['Active','Won','Lost - Ended'];
const HEADERS=['Auction ID','Auction','Auction Link','Max Bid JPY','Current Bid JPY','Final Price JPY','Ends (Japan time)','Auction Status','Bid Result','Confirmed Won','Bid Instructions','Matt Status','Matt Notes','Last Checked (UTC)','Airtable Record ID'];
const EDITS={3:'My Max Bid JPY',9:'Confirmed Won',10:'Bid Instructions',11:'Matt Status',12:'Matt Notes'};
function onOpen(){SpreadsheetApp.getUi().createMenu('Auction Sync').addItem('Install / authorize','install').addItem('Sync now','syncAuctions').addToUi();}
function install(){
 const p=PropertiesService.getScriptProperties();
 if(!p.getProperty('AIRTABLE_TOKEN'))throw Error('Add AIRTABLE_TOKEN in Project Settings → Script Properties. Scope it to Auction Workflow only.');
 p.setProperty('SPREADSHEET_ID',SpreadsheetApp.getActive().getId());
 // First activation refreshes the initial snapshot; use after saving any pending changes elsewhere.
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{const records=readAll();render(records);saveBaselines(records);}finally{lock.releaseLock();}
 for(const t of ScriptApp.getProjectTriggers())if(['syncAuctions','auctionEdited'].includes(t.getHandlerFunction()))ScriptApp.deleteTrigger(t);
 ScriptApp.newTrigger('syncAuctions').timeBased().everyMinutes(1).create();
 ScriptApp.newTrigger('auctionEdited').forSpreadsheet(p.getProperty('SPREADSHEET_ID')).onEdit().create();
 status('Active — edits trigger sync; scheduled refresh approximately every minute. Yahoo facts follow the importer schedule.');
}
function auctionEdited(e){if(e&&TABS.includes(e.range.getSheet().getName()))syncAuctions();}
function sheet(){const id=PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');if(!id)throw Error('Run install first.');return SpreadsheetApp.openById(id);}
function status(s){sheet().getSheetByName('Setup').getRange('A2').setValue(s);}
function api(method,path,body){
 const token=PropertiesService.getScriptProperties().getProperty('AIRTABLE_TOKEN');if(!token)throw Error('Missing AIRTABLE_TOKEN');
 for(let attempt=0;attempt<4;attempt++){
  const r=UrlFetchApp.fetch('https://api.airtable.com/v0/'+BASE+'/'+TABLE+path,{method,headers:{Authorization:'Bearer '+token},contentType:'application/json',...(body?{payload:JSON.stringify(body)}:{}),muteHttpExceptions:true});
  const code=r.getResponseCode();if(code===429||code>=500){Utilities.sleep(1000*Math.pow(2,attempt));continue;}
  if(code<200||code>=300)throw Error('Airtable HTTP '+code+'; sync stopped without clearing sheet.');
  return JSON.parse(r.getContentText());
 }throw Error('Airtable temporarily unavailable; sync will retry.');
}
function readAll(){let out=[],offset='';do{const r=api('get','?pageSize=100'+(offset?'&offset='+encodeURIComponent(offset):''));out=out.concat(r.records);offset=r.offset||'';}while(offset);return out;}
function tabFor(f){if(f['Confirmed Won']||f['Bid Result']==='Won')return 'Won';return ['Ended','Cancelled'].includes(f['Auction Status'])||f['Bid Result']==='Lost'?'Lost - Ended':'Active';}
function auctionId(url){const m=String(url||'').match(/^https:\/\/(?:auctions\.yahoo\.co\.jp|auctions\.yahoo\.co\.jp)\/jp\/auction\/([A-Za-z0-9]+)(?:[?#/].*)?$/);if(!m)throw Error('Use a Yahoo auction URL of the form https://auctions.yahoo.co.jp/jp/auction/ID');return m[1];}
function normalized(col,value){if(col===9)return value===true||String(value).toUpperCase()==='TRUE';if(col===3){if(value===''||value===null)return null;const n=Number(value);if(!Number.isFinite(n)||n<0||!Number.isInteger(n))throw Error('Maximum bid must be a nonnegative whole yen amount.');return n;}const s=String(value??'');if(s.length>1500)throw Error('Keep instructions/status/notes under 1,500 characters.');return s;}
function editable(f){const out={};for(const [c,k]of Object.entries(EDITS))out[k]=normalized(Number(c),f[k]??'');return out;}
function merge(base,remote,row){const patch={};for(const [c,k]of Object.entries(EDITS)){const local=normalized(Number(c),row[Number(c)]);if(JSON.stringify(local)===JSON.stringify(base[k]))continue;if(JSON.stringify(remote[k])!==JSON.stringify(base[k])&&JSON.stringify(remote[k])!==JSON.stringify(local))throw Error('Conflict in '+k+': edited in both Airtable and Sheets. Resolve the values before retrying.');patch[k]=local;}return patch;}
function rowsNow(){const out=[];for(const tab of TABS){const sh=sheet().getSheetByName(tab);if(!sh)throw Error('Missing tab '+tab);const v=sh.getRange(1,1,Math.max(sh.getLastRow(),1),15).getValues();if(JSON.stringify(v[0])!==JSON.stringify(HEADERS))throw Error('Headers changed on '+tab);for(let i=1;i<v.length;i++)if(v[i].some(x=>x!==''&&x!==false))out.push({tab,row:i+1,v:v[i]});}return out;}
function signature(rows){return JSON.stringify(rows);}
function syncAuctions(){const lock=LockService.getScriptLock();if(!lock.tryLock(1000))return;try{
 const props=PropertiesService.getScriptProperties(),start=rowsNow(),sig=signature(start),records=readAll(),byId=new Map(records.map(r=>[r.id,r])),byAuction=new Map(),seen=new Set();
 for(const r of records){if(!r.fields['Auction Link'])continue;const key=auctionId(r.fields['Auction Link']);if(byAuction.has(key))throw Error('Duplicate Airtable auction ID '+key);byAuction.set(key,r);}
 for(const x of start){const row=x.v;let r;if(row[14]){if(seen.has(row[14]))throw Error('Duplicate sheet record ID '+row[14]);seen.add(row[14]);r=byId.get(row[14]);if(!r)throw Error('An Airtable record was removed; retain its sheet row for manual review.');if(String(row[2])!==String(r.fields['Auction Link']||''))throw Error('Existing auction links cannot change identity; add a new row instead.');}
 else {if(!row[2])continue;const key=auctionId(row[2]);r=byAuction.get(key);if(!r){const f={'Name':key,'Auction Link':String(row[2])};for(const[c,k]of Object.entries(EDITS))f[k]=normalized(Number(c),row[Number(c)]);r=api('post','',{records:[{fields:f}]}).records[0];records.push(r);byId.set(r.id,r);byAuction.set(key,r);props.setProperty('BASE_'+r.id,JSON.stringify(editable(r.fields)));}else throw Error('Auction already exists: '+key+'. Edit its existing row rather than add a duplicate.');continue;}
 const raw=props.getProperty('BASE_'+r.id);if(!raw)throw Error('Missing baseline for '+r.id+'; run install only after preserving pending edits.');
 const fresh=api('get','/'+r.id),patch=merge(JSON.parse(raw),editable(fresh.fields),row);
 if(Object.keys(patch).length){const updated=api('patch','/'+r.id,{fields:patch});props.setProperty('BASE_'+r.id,JSON.stringify(editable(updated.fields)));}
 }
 // Preserve user edits made during API calls; the next trigger will process them.
 if(signature(rowsNow())!==sig){status('Changes arrived during sync; rows retained. Next run will finish refresh.');return;}
 const fresh=readAll();render(fresh);saveBaselines(fresh);status('Last successful sync: '+new Date().toISOString()+'. Yahoo importer refreshes independently.');
 }catch(e){status('SYNC NEEDS REVIEW: '+e.message);throw e;}finally{lock.releaseLock();}}
function render(records){const grouped=Object.fromEntries(TABS.map(t=>[t,[]]));for(const r of records){const f=r.fields;if(!f["Auction Link"])continue;grouped[tabFor(f)].push([f['Auction ID']||'',f['Auction Title EN']||f['Auction Title']||f['Name']||'',f['Auction Link']||'',f['My Max Bid JPY']??'',f['Current Bid JPY']??'',f['Final Price JPY']??'',f['End Time']?Utilities.formatDate(new Date(f['End Time']),'Asia/Tokyo','yyyy-MM-dd HH:mm'):'',f['Auction Status']||'',f['Bid Result']||'',!!f['Confirmed Won'],f['Bid Instructions']||'',f['Matt Status']||'',f['Matt Notes']||'',f['Last Checked']||'',r.id]);}
 for(const tab of TABS){const sh=sheet().getSheetByName(tab),rows=grouped[tab];rows.sort((a,b)=>String(a[6]||'9999').localeCompare(String(b[6]||'9999')));const old=sh.getLastRow();if(sh.getMaxRows()<rows.length+1)sh.insertRowsAfter(sh.getMaxRows(),rows.length+1-sh.getMaxRows());if(rows.length)sh.getRange(2,1,rows.length,15).setValues(rows.map(row=>row.map(v=>typeof v==="string"&&v.startsWith("=")?"\u0027"+v:v)));if(old>rows.length+1)sh.getRange(rows.length+2,1,old-rows.length-1,15).clearContent();}
}
function saveBaselines(records){const p=PropertiesService.getScriptProperties();for(const r of records)p.setProperty('BASE_'+r.id,JSON.stringify(editable(r.fields)));}
