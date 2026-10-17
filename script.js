const firebaseConfig={apiKey:"AIzaSyCB_2WaZlyMT4aS0zOyGvzxhkSYJQ5seJI",authDomain:"gageboo-ae9c8.firebaseapp.com",projectId:"gageboo-ae9c8",storageBucket:"gageboo-ae9c8.firebasestorage.app",messagingSenderId:"874609321369",appId:"1:874609321369:web:8c0b541b987fac7aa71f08"};
firebase.initializeApp(firebaseConfig);
const db=firebase.firestore();
let budget=500000;
let items=[];
const today=new Date().toISOString().split('T')[0];
document.getElementById('date').value=today;
document.getElementById('monthFilter').value=today.slice(0,7);

function setCloudStatus(text,kind='wait'){
  const el=document.getElementById('cloud-status');
  if(!el) return;
  el.textContent=text;
  el.className='cloud-status '+kind;
}

async function loadCloudData(){
  setCloudStatus('연결 중…','wait');
  try{
    const [itemsSnap,settingSnap]=await Promise.all([
      db.collection('household_items').orderBy('date','desc').get(),
      db.collection('household_settings').doc('budget').get()
    ]);
    items=itemsSnap.docs.map(doc=>{
      const r=doc.data();
      return{id:doc.id,desc:r.category,amount:Number(r.amount),type:r.type||'out',date:r.date,payment:r.payment||'',merchant:r.merchant||'',time:r.time||'',status:r.status||''};
    });
    if(settingSnap.exists) budget=Number(settingSnap.data().value)||0;
    const bIn=document.getElementById('budgetInput');
    if(bIn) bIn.value=budget;
    setCloudStatus('연결됨','ok');
    render();
  }catch(e){
    console.error(e);
    const msg = e.message || String(e);
    setCloudStatus('연결 실패 (' + msg.slice(0, 25) + ')', 'err');
    render();
  }
}

function toggleBudgetEdit(){
  const box=document.getElementById('budget-edit-box');
  if(!box) return;
  box.style.display=box.style.display==='none'?'flex':'none';
}

async function saveBudget(){
  try{
    await db.collection('household_settings').doc('budget').set({value:String(budget)});
    setCloudStatus('예산 저장됨','ok');return true;
  }catch(e){
    console.error(e);setCloudStatus('예산 저장 실패','err');return false;
  }
}

function clearErr(){document.getElementById('err').textContent='';}
function togglePayment(){document.getElementById('payment-row').style.display=document.getElementById('type').value==='out'?'flex':'none';}
function fmt(n){return Math.round(n).toLocaleString();}
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}

function cleanMerchant(s){return s.replace(/주식회사\s*/g,'').replace(/\(.*?\)/g,'').replace(/(Inc\.|Co\.,?Ltd\.)/gi,'').trim();}

function parseLotteSms(txt){
  const lines=txt.split('\n').map(l=>l.trim()).filter(Boolean);
  let amount=null,date='',merchant='',status='수동입력';
  for(const line of lines){
    const amtM=line.match(/([\d,]+)원\s*(.*)/);
    if(amtM&&!amount){
      amount=parseInt(amtM[1].replace(/,/g,''));
      if(amtM[2].includes('취소')) status='취소';
    }
    const dateM=line.match(/^(\d{2})\/(\d{2})$/);
    if(dateM&&!date){const y=new Date().getFullYear();date=y+'-'+dateM[1]+'-'+dateM[2];}
  }
  if(lines.length>0) merchant=cleanMerchant(lines[0]);
  return{amount,date,merchant,status,card:'롯데'};
}

function parseHyundaiSms(txt){
  const lines=txt.split('\n').map(l=>l.trim()).filter(Boolean);
  let amount=null,date='',merchant='',status='수동입력';
  for(const line of lines){
    const dateM=line.match(/(\d{2})\/(\d{2})/);
    if(dateM&&!date){const y=new Date().getFullYear();date=y+'-'+dateM[1]+'-'+dateM[2];}
    const amtM=line.match(/([\d,]+)원/);
    if(amtM&&!amount) amount=parseInt(amtM[1].replace(/,/g,''));
  }
  for(let i=lines.length-1;i>=0;i--){
    const line=lines[i];
    if(line.includes('현대카드')||/([\d,]+)원/.test(line)||/\d{2}\/\d{2}/.test(line)||/회원님|승인 안내/.test(line)) continue;
    const cleaned=cleanMerchant(line);
    if(cleaned.length>=2){merchant=cleaned;break;}
  }
  return{amount,date,merchant,status,card:'현대'};
}

function parseSms(){
  const txt=document.getElementById('sms').value;
  const result=document.getElementById('parsed-result');
  if(!txt.trim()){result.innerHTML='';return;}
  const parsed=txt.includes('현대카드')?parseHyundaiSms(txt):parseLotteSms(txt);
  if(parsed.amount){
    document.getElementById('amount').value=parsed.amount;
    if(parsed.date) document.getElementById('date').value=parsed.date;
    if(parsed.card) document.getElementById('payment').value=parsed.card;
    if(parsed.merchant) document.getElementById('merchant').value=parsed.merchant;
    const isCancel=parsed.status==='취소';
    if(isCancel){
      document.getElementById('type').value='inc';
      togglePayment();
    }else{
      document.getElementById('type').value='out';
      togglePayment();
    }
    const cancelBadge=isCancel?' <span style="color:#e24b4a;font-weight:bold">· 취소(환급)</span>':'';
    result.innerHTML=`<div class="parsed-badge">${esc(parsed.card)}카드 · ${parsed.amount.toLocaleString()}원 · ${esc(parsed.merchant)} · ${esc(parsed.date)}${cancelBadge} <button onclick="saveFromSms('${parsed.status}')" style="margin-left:8px;padding:4px 12px;border-radius:6px;background:#1d9e75;color:#fff;border:none;cursor:pointer;font-size:12px;font-weight:600">바로 저장</button></div>`;
  }else{
    result.innerHTML='<div class="err">인식 실패 · 형식을 확인하거나 직접 입력해주세요</div>';
  }
}

async function saveFromSms(status='수동입력'){
  await addItemWithStatus(status);
  document.getElementById('sms').value='';
  document.getElementById('parsed-result').innerHTML='';
}

async function setBudget(){
  const bIn=document.getElementById('budgetInput');
  budget=parseInt(bIn.value)||0;
  toggleBudgetEdit();
  render();
  await saveBudget();
}

async function addItemWithStatus(customStatus){
  const descEl=document.getElementById('desc');
  const desc=descEl?descEl.value:'지출';
  const amount=parseInt(document.getElementById('amount').value)||0;
  const type=document.getElementById('type').value;
  const date=document.getElementById('date').value;
  const merchant=document.getElementById('merchant').value.trim();
  if(!amount){document.getElementById('err').textContent='금액을 입력하세요';return;}
  const payment=type==='out'?document.getElementById('payment').value:'';
  const status=customStatus||(type==='inc'?'취소':'수동입력');
  try{
    const docRef=await db.collection('household_items').add({category:desc,amount,type,date,payment,merchant,time:'',status});
    items.unshift({id:docRef.id,desc,amount,type,date,payment,merchant,time:'',status});
    document.getElementById('amount').value='';document.getElementById('merchant').value='';clearErr();setCloudStatus('저장됨','ok');render();
  }catch(e){
    console.error(e);document.getElementById('err').textContent='저장에 실패했습니다';setCloudStatus('저장 실패','err');
  }
}

async function addItem(){
  await addItemWithStatus();
}

async function delItem(id){
  if(!confirm('이 내역을 삭제할까요?')) return;
  try{
    await db.collection('household_items').doc(String(id)).delete();
    items=items.filter(i=>String(i.id)!==String(id));setCloudStatus('삭제됨','ok');render();
  }catch(e){
    console.error(e);setCloudStatus('삭제 실패','err');
  }
}

function moveMonth(step){const el=document.getElementById('monthFilter');const base=el.value||today.slice(0,7);const [y,m]=base.split('-').map(Number);const d=new Date(y,m-1+step,1);el.value=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');render();}
function showAllMonths(){document.getElementById('monthFilter').value='';render();}

function render(){
  const selectedMonth=document.getElementById('monthFilter').value;
  const monthItems=selectedMonth?items.filter(i=>String(i.date||'').startsWith(selectedMonth)):items;
  const out=monthItems.filter(i=>i.type==='out');const used=out.reduce((s,i)=>s+Number(i.amount||0),0);const inc=monthItems.filter(i=>i.type==='inc').reduce((s,i)=>s+Number(i.amount||0),0);const netUsed=used-inc;const remain=budget-netUsed;
  const usedPct=budget>0?Math.round((netUsed/budget)*100):0;
  const sBudget=document.getElementById('s-budget');if(sBudget) sBudget.textContent=fmt(budget);
  const sUsed=document.getElementById('s-used');if(sUsed) sUsed.textContent=fmt(used);
  const sRemain=document.getElementById('s-remain');
  if(sRemain){
    sRemain.textContent=fmt(remain);
    sRemain.className='stat-value '+(remain>=0?'green':'red');
  }
  
  const barFill=document.getElementById('bar-fill');
  const barPct=document.getElementById('bar-pct');
  const barLbl=document.getElementById('bar-status-lbl');
  
  if(barFill && barPct && barLbl){
    if(remain<0){
      barFill.style.width='100%';
      barFill.style.background='#e24b4a';
      barPct.textContent=usedPct+'% (초과)';
      barPct.style.color='#e24b4a';
      barLbl.textContent='초과';
    }else{
      barFill.style.width=Math.min(100,Math.max(0,usedPct))+'%';
      barFill.style.background='#378add';
      barPct.textContent=usedPct+'%';
      barPct.style.color='#777';
      barLbl.textContent='소진율';
    }
  }
  const sortBy=document.getElementById('sortBy')?.value || 'date-desc';
  let sortedItems=[...monthItems];
  if(sortBy==='date-desc'){
    sortedItems.sort((a,b)=>(b.date+(b.time||'')).localeCompare(a.date+(a.time||'')) || Number(b.amount)-Number(a.amount));
  }else if(sortBy==='date-asc'){
    sortedItems.sort((a,b)=>(a.date+(a.time||'')).localeCompare(b.date+(b.time||'')) || Number(a.amount)-Number(b.amount));
  }else if(sortBy==='amt-desc'){
    sortedItems.sort((a,b)=>Number(b.amount)-Number(a.amount) || (b.date).localeCompare(a.date));
  }else if(sortBy==='amt-asc'){
    sortedItems.sort((a,b)=>Number(a.amount)-Number(b.amount) || (b.date).localeCompare(a.date));
  }

  const listCount=document.getElementById('list-count');
  if(listCount) listCount.textContent=sortedItems.length+'건';
  const list=document.getElementById('list');
  if(!sortedItems.length){list.innerHTML='<div class="empty">내역이 없습니다</div>';return;}
  list.innerHTML=sortedItems.map(i=>`<div class="item">
    <div class="item-left">
      <div class="item-desc">${esc(i.merchant||'지출')} ${i.payment?'<span class="badge '+(i.payment==='현금'?'cash':'')+'">'+esc(i.payment)+'</span>':''} ${i.status==='취소'?'<span class="badge cancel">취소</span>':''}</div>
      <div class="item-meta">${esc(i.date)}${i.time?' '+esc(i.time):''}</div>
    </div>
    <div class="item-right">
      <div class="item-amt ${Number(i.amount)<0?'green':(i.type==='out'?'red':'green')}">${i.type==='out'?(Number(i.amount)<0?'+':'-'):'+'}${fmt(Math.abs(Number(i.amount)))}원</div>
      <button class="del-btn" onclick="delItem('${i.id}')">✕</button>
    </div>
  </div>`).join('');
}

loadCloudData();
