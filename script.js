const SUPABASE_URL='https://frqqjvsdkjzrsiuflcax.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_lRSzfopmPO_kMWaT70WagA_YrEI_fjB';
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
let budget=500000;
let items=[];
const today=new Date().toISOString().split('T')[0];
document.getElementById('date').value=today;
document.getElementById('monthFilter').value=today.slice(0,7);

function setCloudStatus(text,kind='wait'){
  const el=document.getElementById('cloud-status');
  el.textContent=text;
  el.className='cloud-status '+kind;
}

async function loadCloudData(){
  setCloudStatus('공용 데이터 불러오는 중…','wait');
  const [{data:itemRows,error:itemError},{data:settingRows,error:settingError}]=await Promise.all([
    db.from('household_items').select('*').order('date',{ascending:false}).order('time',{ascending:false}),
    db.from('household_settings').select('*').eq('key','budget').limit(1)
  ]);
  if(itemError||settingError){
    console.error(itemError||settingError);
    setCloudStatus('Supabase 불러오기 실패','err');
    render();
    return;
  }
  items=(itemRows||[]).map(r=>({
    id:r.id,desc:r.category,amount:Number(r.amount),type:r.type||'out',date:r.date,
    payment:r.payment||'',merchant:r.merchant||'',time:r.time||'',status:r.status||''
  }));
  if(settingRows?.length) budget=Number(settingRows[0].value)||0;
  document.getElementById('budgetInput').value=budget;
  setCloudStatus('공용 데이터 연결됨','ok');
  render();
}

async function saveBudget(){
  const {error}=await db.from('household_settings').upsert({key:'budget',value:String(budget)},{onConflict:'key'});
  if(error){console.error(error);setCloudStatus('예산 저장 실패','err');return false;}
  setCloudStatus('예산 저장 완료','ok');return true;
}

function clearErr(){document.getElementById('err').textContent='';}
function togglePayment(){document.getElementById('payment-row').style.display=document.getElementById('type').value==='out'?'flex':'none';}
function fmt(n){return Math.round(n).toLocaleString();}
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}

function parseSms(){
  const txt=document.getElementById('sms').value;
  const result=document.getElementById('parsed-result');
  if(!txt.trim()){result.innerHTML='';return;}
  let amount=null,card='',date='',merchant='';
  const amtMatch=txt.match(/([\d,]+)원/); if(amtMatch) amount=parseInt(amtMatch[1].replace(/,/g,''));
  const dateMatch=txt.match(/(\d{2})\/(\d{2})/);
  if(dateMatch){const y=new Date().getFullYear();date=y+'-'+dateMatch[1].padStart(2,'0')+'-'+dateMatch[2].padStart(2,'0');}
  const cards=['현대','롯데','삼성','신한','국민','하나','우리'];
  for(const c of cards){if(txt.includes(c)){card=c;break;}}
  const lines=txt.split('\n').map(l=>l.trim()).filter(Boolean);
  for(const line of lines){
    if(/\[Web발신\]/.test(line)||/승인|일시불|할부/.test(line)||/\d{2}\/\d{2}/.test(line)||/누적/.test(line)||/([\d,]+)원/.test(line)) continue;
    if(cards.some(c=>line.startsWith(c))) continue;
    const clean=line.replace(/주식회사\s*/,'').replace(/\(.*?\)/g,'').replace(/\s+pay.*/i,'').trim();
    if(clean.length>=2&&clean.length<=30){merchant=clean;break;}
  }
  if(amount){
    document.getElementById('amount').value=amount;
    if(date) document.getElementById('date').value=date;
    if(card) document.getElementById('payment').value=card;
    if(merchant) document.getElementById('merchant').value=merchant;
    result.innerHTML='<div class="parsed-badge">인식완료 · '+amount.toLocaleString()+'원 '+esc(card)+' '+esc(date)+'</div>';
  }else result.innerHTML='<div class="err">인식 실패 · 직접 입력해주세요</div>';
}

async function setBudget(){budget=parseInt(document.getElementById('budgetInput').value)||0;render();await saveBudget();}

async function addItem(){
  const desc=document.getElementById('desc').value;
  const amount=parseInt(document.getElementById('amount').value)||0;
  const type=document.getElementById('type').value;
  const date=document.getElementById('date').value;
  const merchant=document.getElementById('merchant').value.trim();
  if(!amount){document.getElementById('err').textContent='금액을 입력하세요';return;}
  const payment=type==='out'?document.getElementById('payment').value:'';
  const {data,error}=await db.from('household_items').insert({category:desc,amount,type,date,payment,merchant,time:'',status:'수동입력'}).select().single();
  if(error){console.error(error);document.getElementById('err').textContent='저장에 실패했습니다';setCloudStatus('내역 저장 실패','err');return;}
  items.unshift({id:data.id,desc:data.category,amount:Number(data.amount),type:data.type,date:data.date,payment:data.payment||'',merchant:data.merchant||'',time:data.time||'',status:data.status||''});
  document.getElementById('amount').value='';document.getElementById('merchant').value='';document.getElementById('sms').value='';document.getElementById('parsed-result').innerHTML='';clearErr();setCloudStatus('내역 저장 완료','ok');render();
}

async function delItem(id){
  if(!confirm('이 내역을 삭제할까요?')) return;
  const {error}=await db.from('household_items').delete().eq('id',id);
  if(error){console.error(error);setCloudStatus('삭제 실패','err');return;}
  items=items.filter(i=>String(i.id)!==String(id));setCloudStatus('삭제 완료','ok');render();
}

function paymentName(raw){raw=String(raw||'');for(const c of ['현대','롯데','삼성','신한','국민','하나','우리']) if(raw.includes(c)) return c;if(raw.includes('현금')) return '현금';return '기타';}
function parseCsvText(text){const rows=[];let row=[],field='',quoted=false;for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(ch===','&&!quoted){row.push(field);field='';}else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(field);field='';if(row.some(v=>v!==''))rows.push(row);row=[];}else field+=ch;}if(field||row.length){row.push(field);rows.push(row);}return rows;}

function importCsv(event){
  const file=event.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=async e=>{
    const rows=parseCsvText(String(e.target.result||'').replace(/^\uFEFF/,''));
    if(rows.length<2){document.getElementById('import-msg').textContent='CSV에 데이터가 없어요.';return;}
    const headers=rows[0].map(h=>h.trim());
    const need=['날짜','결제처','금액(원)','상태','결제수단','분류'];
    if(!need.every(n=>headers.includes(n))){document.getElementById('import-msg').textContent='필요한 열 이름을 찾지 못했어요.';return;}
    const ix=Object.fromEntries(headers.map((h,i)=>[h,i]));let added=0,skipped=0;const pending=[];
    for(let r=1;r<rows.length;r++){
      const row=rows[r],category=(row[ix['분류']]||'').trim();if(!['식비','생활비'].includes(category))continue;
      const rawDate=(row[ix['날짜']]||'').trim(),m=rawDate.match(/^(\d{1,2})\/(\d{1,2})$/);if(!m){skipped++;continue;}
      const year=new Date().getFullYear(),date=year+'-'+m[1].padStart(2,'0')+'-'+m[2].padStart(2,'0');
      const amount=parseInt(String(row[ix['금액(원)']]||'0').replace(/,/g,'').replace(/[^\d-]/g,''))||0;
      const merchant=(row[ix['결제처']]||'').trim(),status=(row[ix['상태']]||'').trim(),time=ix['시간']!==undefined?(row[ix['시간']]||'').trim():'';
      const payment=paymentName(row[ix['결제수단']]);const key=[date,time,merchant,amount,status,category].join('|');
      const exists=items.some(i=>[i.date,i.time||'',i.merchant,i.amount,i.status||'',i.desc].join('|')===key);if(exists){skipped++;continue;}
      pending.push({category,amount,type:'out',date,payment,merchant,time:time==='-'?'':time,status});added++;
    }
    if(pending.length){const {error}=await db.from('household_items').insert(pending);if(error){console.error(error);document.getElementById('import-msg').textContent='CSV 저장 실패';return;}}
    await loadCloudData();document.getElementById('import-msg').textContent=`${added}건 추가 · ${skipped}건 중복/건너뜀`;event.target.value='';
  };
  reader.readAsText(file,'UTF-8');
}

function exportCsv(){
  const headers=['날짜','시간','결제처','금액(원)','상태','결제수단','분류'];const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';const lines=[headers.join(',')];
  [...items].sort((a,b)=>(a.date+(a.time||'')).localeCompare(b.date+(b.time||''))).forEach(i=>{const md=i.date?i.date.slice(5).replace('-','/'):'';lines.push([md,i.time||'',i.merchant,i.amount,i.status||'',i.payment,i.desc].map(q).join(','));});
  const blob=new Blob(['\uFEFF'+lines.join('\r\n')],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='가계부_식비_생활비.csv';a.click();URL.revokeObjectURL(url);
}

function moveMonth(step){const el=document.getElementById('monthFilter');const base=el.value||today.slice(0,7);const [y,m]=base.split('-').map(Number);const d=new Date(y,m-1+step,1);el.value=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');render();}
function showAllMonths(){document.getElementById('monthFilter').value='';render();}

function render(){
  const selectedMonth=document.getElementById('monthFilter').value;
  const monthItems=selectedMonth?items.filter(i=>String(i.date||'').startsWith(selectedMonth)):items;
  const out=monthItems.filter(i=>i.type==='out');const used=out.reduce((s,i)=>s+Number(i.amount||0),0);const inc=monthItems.filter(i=>i.type==='inc').reduce((s,i)=>s+Number(i.amount||0),0);const food=out.filter(i=>i.desc==='식비').reduce((s,i)=>s+Number(i.amount||0),0);const life=out.filter(i=>i.desc==='생활비').reduce((s,i)=>s+Number(i.amount||0),0);const remain=budget-used+inc;const usedPct=budget>0?Math.max(0,Math.min(100,Math.round(used/budget*100))):0;
  document.getElementById('s-budget').textContent=fmt(budget);document.getElementById('s-used').textContent=fmt(used);document.getElementById('s-remain').textContent=fmt(remain);document.getElementById('s-remain').className='stat-value '+(remain>=0?'green':'red');document.getElementById('s-food').textContent=fmt(food)+'원';document.getElementById('s-life').textContent=fmt(life)+'원';document.getElementById('bar-used').style.width=usedPct+'%';document.getElementById('bar-remain').style.width=Math.max(0,100-usedPct)+'%';document.getElementById('bar-used-pct').textContent=usedPct+'%';document.getElementById('bar-remain-pct').textContent=Math.max(0,100-usedPct)+'%';
  const filter=document.getElementById('filter').value;const shown=filter==='all'?monthItems:monthItems.filter(i=>i.desc===filter);document.getElementById('list-count').textContent=shown.length+'건';const list=document.getElementById('list');if(!shown.length){list.innerHTML='<div class="empty">내역이 없습니다</div>';return;}
  list.innerHTML=shown.map(i=>`<div class="item"><div class="item-left"><div class="item-desc">${esc(i.desc)} ${i.payment?'<span class="badge '+(i.payment==='현금'?'cash':'')+'">'+esc(i.payment)+'</span>':''} ${i.status==='취소'?'<span class="badge cancel">취소</span>':''}</div><div class="item-meta">${esc(i.date)}${i.time?' '+esc(i.time):''}${i.merchant?' · '+esc(i.merchant):''}</div></div><div class="item-right"><div class="item-amt ${Number(i.amount)<0?'green':(i.type==='out'?'red':'green')}">${i.type==='out'?(Number(i.amount)<0?'+':'-'):'+'}${fmt(Math.abs(Number(i.amount)))}원</div><button class="del-btn" onclick="delItem('${i.id}')">✕</button></div></div>`).join('');
}

loadCloudData();
