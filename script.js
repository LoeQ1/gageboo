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
    setCloudStatus('연결 실패','err');
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
  const desc=document.getElementById('desc').value;
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
  const out=monthItems.filter(i=>i.type==='out');const used=out.reduce((s,i)=>s+Number(i.amount||0),0);const inc=monthItems.filter(i=>i.type==='inc').reduce((s,i)=>s+Number(i.amount||0),0);const food=out.filter(i=>i.desc==='식비').reduce((s,i)=>s+Number(i.amount||0),0);const life=out.filter(i=>i.desc==='생활비').reduce((s,i)=>s+Number(i.amount||0),0);const remain=budget-used+inc;const usedPct=budget>0?Math.max(0,Math.min(100,Math.round(used/budget*100))):0;
  document.getElementById('s-budget').textContent=fmt(budget);document.getElementById('s-used').textContent=fmt(used);document.getElementById('s-remain').textContent=fmt(remain);document.getElementById('s-remain').className='stat-value '+(remain>=0?'green':'red');document.getElementById('s-food').textContent=fmt(food)+'원';document.getElementById('s-life').textContent=fmt(life)+'원';document.getElementById('bar-used').style.width=usedPct+'%';document.getElementById('bar-remain').style.width=Math.max(0,100-usedPct)+'%';document.getElementById('bar-used-pct').textContent=usedPct+'%';document.getElementById('bar-remain-pct').textContent=Math.max(0,100-usedPct)+'%';
  const filter=document.getElementById('filter').value;const shown=filter==='all'?monthItems:monthItems.filter(i=>i.desc===filter);document.getElementById('list-count').textContent=shown.length+'건';const list=document.getElementById('list');if(!shown.length){list.innerHTML='<div class="empty">내역이 없습니다</div>';return;}
  list.innerHTML=shown.map(i=>`<div class="item"><div class="item-left"><div class="item-desc">${esc(i.desc)} ${i.payment?'<span class="badge '+(i.payment==='현금'?'cash':'')+'">'+esc(i.payment)+'</span>':''} ${i.status==='취소'?'<span class="badge cancel">취소</span>':''}</div><div class="item-meta">${esc(i.date)}${i.time?' '+esc(i.time):''}${i.merchant?' · '+esc(i.merchant):''}</div></div><div class="item-right"><div class="item-amt ${Number(i.amount)<0?'green':(i.type==='out'?'red':'green')}">${i.type==='out'?(Number(i.amount)<0?'+':'-'):'+'}${fmt(Math.abs(Number(i.amount)))}원</div><button class="del-btn" onclick="delItem('${i.id}')">✕</button></div></div>`).join('');
}

loadCloudData();
