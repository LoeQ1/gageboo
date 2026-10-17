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
  el.textContent=text;
  el.className='cloud-status '+kind;
}

async function loadCloudData(){
  setCloudStatus('공용 데이터 불러오는 중…','wait');
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
    document.getElementById('budgetInput').value=budget;
    setCloudStatus('공용 데이터 연결됨','ok');
    render();
  }catch(e){
    console.error(e);
    setCloudStatus('Firestore 불러오기 실패','err');
    render();
  }
}

async function saveBudget(){
  try{
    await db.collection('household_settings').doc('budget').set({value:String(budget)});
    setCloudStatus('예산 저장 완료','ok');return true;
  }catch(e){
    console.error(e);setCloudStatus('예산 저장 실패','err');return false;
  }
}

function clearErr(){document.getElementById('err').textContent='';}
function togglePayment(){document.getElementById('payment-row').style.display=document.getElementById('type').value==='out'?'flex':'none';}
function fmt(n){return Math.round(n).toLocaleString();}
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}

function cleanMerchant(s){return s.replace(/주식회사\s*/g,'').replace(/\s*\(.*?\)/g,'').replace(/\s*(Inc\.|Co\.,?Ltd\.?)\s*/gi,'').trim();}

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
    const cancelBadge=parsed.status==='취소'?' <span style="color:#e55;font-weight:bold">· 취소</span>':'';
    result.innerHTML=`<div class="parsed-badge">${esc(parsed.card)}카드 · ${parsed.amount.toLocaleString()}원 · ${esc(parsed.merchant)} · ${esc(parsed.date)}${cancelBadge} <button onclick="saveFromSms()" style="margin-left:8px;padding:3px 12px;border-radius:6px;background:#34c759;color:#fff;border:none;cursor:pointer;font-size:13px;font-weight:bold">바로 저장</button></div>`;
  }else{
    result.innerHTML='<div class="err">인식 실패 · 직접 입력해주세요</div>';
  }
}

async function saveFromSms(){
  await addItem();
  document.getElementById('sms').value='';
  document.getElementById('parsed-result').innerHTML='';
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
  try{
    const docRef=await db.collection('household_items').add({category:desc,amount,type,date,payment,merchant,time:'',status:'수동입력'});
    items.unshift({id:docRef.id,desc,amount,type,date,payment,merchant,time:'',status:'수동입력'});
    document.getElementById('amount').value='';document.getElementById('merchant').value='';document.getElementById('sms').value='';document.getElementById('parsed-result').innerHTML='';clearErr();setCloudStatus('내역 저장 완료','ok');render();
  }catch(e){
    console.error(e);document.getElementById('err').textContent='저장에 실패했습니다';setCloudStatus('내역 저장 실패','err');
  }
}

async function delItem(id){
  if(!confirm('이 내역을 삭제할까요?')) return;
  try{
    await db.collection('household_items').doc(String(id)).delete();
    items=items.filter(i=>String(i.id)!==String(id));setCloudStatus('삭제 완료','ok');render();
  }catch(e){
    console.error(e);setCloudStatus('삭제 실패','err');
  }
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
    if(pending.length){
      const batch=db.batch();
      pending.forEach(item=>{const ref=db.collection('household_items').doc();batch.set(ref,item);});
      try{await batch.commit();}catch(e){console.error(e);document.getElementById('import-msg').textContent='CSV 저장 실패';return;}
    }
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
