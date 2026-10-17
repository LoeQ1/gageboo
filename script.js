const firebaseConfig={apiKey:"AIzaSyCB_2WaZlyMT4aS0zOyGvzxhkSYJQ5seJI",authDomain:"gageboo-ae9c8.firebaseapp.com",projectId:"gageboo-ae9c8",storageBucket:"gageboo-ae9c8.firebasestorage.app",messagingSenderId:"874609321369",appId:"1:874609321369:web:8c0b541b987fac7aa71f08"};
firebase.initializeApp(firebaseConfig);
const db=firebase.firestore();

// 모바일 브라우저 오프라인/재연결 대응
try {
  db.enablePersistence({synchronizeTabs: true}).catch(err => {
    console.warn('Persistence error:', err.code);
  });
} catch(e) {}

let budget = 500000;
let items = [];
const today = new Date().toISOString().split('T')[0];

// 초기 월 세팅
const monthFilterEl = document.getElementById('monthFilter');
if (monthFilterEl) monthFilterEl.value = today.slice(0, 7);
updateMonthDisplay();

// 초기 날짜 인풋 세팅
const modalDateEl = document.getElementById('modalDate');
if (modalDateEl) modalDateEl.value = today;

function setCloudStatus(text, kind = 'wait'){
  const el = document.getElementById('cloud-status');
  if(!el) return;
  el.textContent = text;
  el.className = 'cloud-status ' + kind;
}

let retryTimer = null;
async function loadCloudData(isRetry = false){
  if(!isRetry) setCloudStatus('연결 중', 'wait');
  try{
    const [itemsSnap, settingSnap] = await Promise.all([
      db.collection('household_items').orderBy('date', 'desc').get(),
      db.collection('household_settings').doc('budget').get()
    ]);
    items = itemsSnap.docs.map(doc => {
      const r = doc.data();
      return {
        id: doc.id,
        desc: r.category || '지출',
        amount: Number(r.amount),
        type: r.type || 'out',
        date: r.date,
        payment: r.payment || '',
        merchant: r.merchant || '',
        time: r.time || '',
        status: r.status || ''
      };
    });
    if(settingSnap.exists) budget = Number(settingSnap.data().value) || 0;
    const bIn = document.getElementById('budgetInput');
    if(bIn) bIn.value = budget;
    setCloudStatus('연결됨', 'ok');
    render();
  }catch(e){
    console.error(e);
    const msg = e.message || String(e);
    if(!isRetry && (msg.includes('offline') || msg.includes('network') || msg.includes('Failed to get'))){
      setCloudStatus('재연결 중', 'wait');
      if(retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(() => loadCloudData(true), 2000);
    } else {
      setCloudStatus('연결 실패', 'err');
    }
    render();
  }
}

// 화면 포커스/네트워크 복구 시 자동 새로고침
window.addEventListener('online', () => loadCloudData());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') loadCloudData(true);
});

/* ================= 월별 탐색 네비게이션 ================= */
function updateMonthDisplay(){
  const val = monthFilterEl ? monthFilterEl.value : today.slice(0, 7);
  const [y, m] = val.split('-');
  const displayEl = document.getElementById('currentMonthText');
  if(displayEl) displayEl.textContent = `${y}년 ${parseInt(m, 10)}월`;
}

function openMonthPicker(){
  if(monthFilterEl) {
    if(typeof monthFilterEl.showPicker === 'function') {
      monthFilterEl.showPicker();
    } else {
      monthFilterEl.focus();
    }
  }
}

function onMonthInputChange(){
  updateMonthDisplay();
  render();
}

function moveMonth(step){
  const base = monthFilterEl.value || today.slice(0, 7);
  const [y, m] = base.split('-').map(Number);
  const d = new Date(y, m - 1 + step, 1);
  const nextMonth = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  monthFilterEl.value = nextMonth;
  updateMonthDisplay();
  render();
}

/* ================= 모달 바텀시트 제어 ================= */
function openSmsModal(){
  document.getElementById('smsModal').classList.add('active');
  const txtArea = document.getElementById('sms');
  if(txtArea) {
    txtArea.value = '';
    document.getElementById('parsed-result').innerHTML = '';
    setTimeout(() => txtArea.focus(), 200);
  }
}

function openDirectAddModal(){
  document.getElementById('addModal').classList.add('active');
  document.getElementById('modalAmount').value = '';
  document.getElementById('modalMerchant').value = '';
  document.getElementById('modalErr').textContent = '';
}

function openBudgetModal(){
  document.getElementById('budgetModal').classList.add('active');
  document.getElementById('budgetInput').value = budget;
  setTimeout(() => document.getElementById('budgetInput').focus(), 200);
}

function closeModal(modalId){
  const modal = document.getElementById(modalId);
  if(modal) modal.classList.remove('active');
}

function closeModalOnBackdrop(e, modalId){
  if(e.target.id === modalId) closeModal(modalId);
}

function toggleModalPayment(){
  const type = document.querySelector('input[name="modalType"]:checked')?.value || 'out';
  const payGroup = document.getElementById('modalPaymentGroup');
  if(payGroup) payGroup.style.display = type === 'out' ? 'flex' : 'none';
}

/* ================= 예산 설정 ================= */
async function submitBudget(){
  const bIn = document.getElementById('budgetInput');
  const newBudget = parseInt(bIn.value, 10);
  if(isNaN(newBudget) || newBudget < 0) return;
  budget = newBudget;
  closeModal('budgetModal');
  render();
  try{
    await db.collection('household_settings').doc('budget').set({ value: String(budget) });
    setCloudStatus('저장됨', 'ok');
  }catch(e){
    console.error(e);
    setCloudStatus('예산 저장 실패', 'err');
  }
}

/* ================= 카드 SMS 스마트 파서 ================= */
function cleanMerchant(s){
  return s.replace(/주식회사\s*/g, '')
          .replace(/\s*\(.*?\)/g, '')
          .replace(/(Inc\.|Co\.,?Ltd\.)/gi, '')
          .trim();
}

function parseLotteSms(txt){
  const lines = txt.split('\n').map(l => l.trim()).filter(Boolean);
  let amount = null, date = '', merchant = '', status = '수동입력';
  for(const line of lines){
    const amtM = line.match(/([\d,]+)원\s*(.*)/);
    if(amtM && !amount){
      amount = parseInt(amtM[1].replace(/,/g, ''), 10);
      if(amtM[2].includes('취소')) status = '취소';
    }
    const dateM = line.match(/^(\d{2})\/(\d{2})$/);
    if(dateM && !date){
      const y = new Date().getFullYear();
      date = `${y}-${dateM[1]}-${dateM[2]}`;
    }
  }
  if(lines.length > 0) merchant = cleanMerchant(lines[0]);
  return { amount, date, merchant, status, card: '롯데' };
}

function parseHyundaiSms(txt){
  const lines = txt.split('\n').map(l => l.trim()).filter(Boolean);
  let amount = null, date = '', merchant = '', status = '수동입력';
  for(const line of lines){
    const dateM = line.match(/(\d{2})\/(\d{2})/);
    if(dateM && !date){
      const y = new Date().getFullYear();
      date = `${y}-${dateM[1]}-${dateM[2]}`;
    }
    const amtM = line.match(/([\d,]+)원/);
    if(amtM && !amount) amount = parseInt(amtM[1].replace(/,/g, ''), 10);
  }
  for(let i = lines.length - 1; i >= 0; i--){
    const line = lines[i];
    if(line.includes('현대카드') || /([\d,]+)원/.test(line) || /\d{2}\/\d{2}/.test(line) || /회원님|승인 안내/.test(line)) continue;
    const cleaned = cleanMerchant(line);
    if(cleaned.length >= 2){ merchant = cleaned; break; }
  }
  return { amount, date, merchant, status, card: '현대' };
}

let pendingParsedData = null;

function parseSms(){
  const txt = document.getElementById('sms').value;
  const resultBox = document.getElementById('parsed-result');
  if(!txt.trim()){
    resultBox.innerHTML = '';
    pendingParsedData = null;
    return;
  }
  const parsed = txt.includes('현대카드') ? parseHyundaiSms(txt) : parseLotteSms(txt);
  if(parsed.amount){
    pendingParsedData = parsed;
    const isCancel = parsed.status === '취소';
    resultBox.innerHTML = `
      <div class="parsed-card">
        <div class="parsed-card-top">
          <span class="parsed-card-badge">${esc(parsed.card)}카드 ${isCancel ? '· 취소/환급' : '· 승인'}</span>
          <span class="parsed-card-amt">${isCancel ? '+' : '-'}${fmt(parsed.amount)}원</span>
        </div>
        <div class="parsed-card-detail">
          <strong>${esc(parsed.merchant || '지출')}</strong> · ${esc(parsed.date || today)}
        </div>
        <button type="button" class="btn-primary" onclick="confirmSmsSave()" style="padding:10px;margin-top:4px;">이 내역으로 즉시 등록</button>
      </div>
    `;
  } else {
    pendingParsedData = null;
    resultBox.innerHTML = '<div class="form-err">문자 형식을 인식하지 못했습니다. 직접 입력 모달을 이용해 주세요.</div>';
  }
}

async function confirmSmsSave(){
  if(!pendingParsedData) return;
  const { amount, date, merchant, status, card } = pendingParsedData;
  const type = status === '취소' ? 'inc' : 'out';
  const saveDate = date || today;
  await saveItemToCloud({
    category: '식비',
    amount,
    type,
    date: saveDate,
    payment: card,
    merchant: merchant || '지출',
    time: '',
    status
  });
  closeModal('smsModal');
}

/* ================= 직접 입력 제출 ================= */
async function submitDirectAdd(){
  const type = document.querySelector('input[name="modalType"]:checked')?.value || 'out';
  const payment = type === 'out' ? document.getElementById('modalPayment').value : '';
  const merchant = document.getElementById('modalMerchant').value.trim() || '지출';
  const amount = parseInt(document.getElementById('modalAmount').value, 10);
  const date = document.getElementById('modalDate').value || today;
  const errEl = document.getElementById('modalErr');

  if(isNaN(amount) || amount <= 0){
    errEl.textContent = '올바른 금액을 입력해 주세요.';
    return;
  }

  await saveItemToCloud({
    category: '식비',
    amount,
    type,
    date,
    payment,
    merchant,
    time: '',
    status: type === 'inc' ? '환급' : '수동입력'
  });
  closeModal('addModal');
}

/* ================= Firestore 공통 저장 / 삭제 ================= */
async function saveItemToCloud(itemObj){
  try{
    const docRef = await db.collection('household_items').add(itemObj);
    items.unshift({ id: docRef.id, ...itemObj });
    setCloudStatus('저장됨', 'ok');
    render();
  }catch(e){
    console.error(e);
    setCloudStatus('저장 실패', 'err');
    alert('저장 중 오류가 발생했습니다.');
  }
}

async function delItem(id){
  if(!confirm('이 내역을 삭제하시겠습니까?')) return;
  try{
    await db.collection('household_items').doc(String(id)).delete();
    items = items.filter(i => String(i.id) !== String(id));
    setCloudStatus('삭제됨', 'ok');
    render();
  }catch(e){
    console.error(e);
    setCloudStatus('삭제 실패', 'err');
  }
}

/* ================= 유틸 함수 ================= */
function fmt(n){ return Math.round(n).toLocaleString(); }
function esc(v){
  return String(v ?? '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[m]));
}

function getAvatarClass(payment){
  if(payment === '현대') return 'hyundai';
  if(payment === '롯데') return 'lotte';
  if(payment === '현금') return 'cash';
  return '';
}

function getDayString(dateStr){
  if(!dateStr) return '';
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const d = new Date(dateStr);
  return isNaN(d.getDay()) ? '' : `(${days[d.getDay()]})`;
}

/* ================= 메인 렌더링 ================= */
function render(){
  const selectedMonth = monthFilterEl ? monthFilterEl.value : today.slice(0, 7);
  const monthItems = selectedMonth ? items.filter(i => String(i.date || '').startsWith(selectedMonth)) : items;

  // 1. 머니 대시보드 통계 계산
  const out = monthItems.filter(i => i.type === 'out');
  const used = out.reduce((s, i) => s + Number(i.amount || 0), 0);
  const inc = monthItems.filter(i => i.type === 'inc').reduce((s, i) => s + Number(i.amount || 0), 0);
  const netUsed = used - inc;
  const remain = budget - netUsed;
  const usedPct = budget > 0 ? Math.round((netUsed / budget) * 100) : 0;

  // 대시보드 UI 반영
  const sRemain = document.getElementById('s-remain');
  if(sRemain){
    sRemain.textContent = (remain < 0 ? '-' : '') + fmt(Math.abs(remain)) + '원';
    sRemain.className = 'main-remain-amount' + (remain < 0 ? ' negative' : '');
  }

  const sBudget = document.getElementById('s-budget');
  if(sBudget) sBudget.textContent = fmt(budget) + '원';
  const sUsed = document.getElementById('s-used');
  if(sUsed) sUsed.textContent = fmt(used) + '원';

  const barFill = document.getElementById('bar-fill');
  const barPct = document.getElementById('bar-pct');
  const barLbl = document.getElementById('bar-status-lbl');

  if(barFill && barPct && barLbl){
    if(remain < 0){
      barFill.style.width = '100%';
      barFill.className = 'gauge-bar-fill over';
      barPct.textContent = usedPct + '% 초과';
      barPct.style.color = 'var(--danger)';
      barLbl.textContent = `초과 ${fmt(Math.abs(remain))}원`;
    } else {
      barFill.style.width = Math.min(100, Math.max(0, usedPct)) + '%';
      barFill.className = 'gauge-bar-fill';
      barPct.textContent = usedPct + '% 소진';
      barPct.style.color = 'var(--text-muted)';
      barLbl.textContent = `지출 ${fmt(netUsed)}원`;
    }
  }

  // 2. 정렬 옵션 처리
  const sortBy = document.getElementById('sortBy')?.value || 'date-desc';
  let sortedItems = [...monthItems];

  if(sortBy === 'date-desc'){
    sortedItems.sort((a,b) => (b.date + (b.time||'')).localeCompare(a.date + (a.time||'')) || Number(b.amount) - Number(a.amount));
  } else if(sortBy === 'date-asc'){
    sortedItems.sort((a,b) => (a.date + (a.time||'')).localeCompare(b.date + (b.time||'')) || Number(a.amount) - Number(b.amount));
  } else if(sortBy === 'amt-desc'){
    sortedItems.sort((a,b) => Number(b.amount) - Number(a.amount) || (b.date).localeCompare(a.date));
  } else if(sortBy === 'amt-asc'){
    sortedItems.sort((a,b) => Number(a.amount) - Number(b.amount) || (b.date).localeCompare(a.date));
  }

  const listCount = document.getElementById('list-count');
  if(listCount) listCount.textContent = sortedItems.length + '건';

  const timelineList = document.getElementById('timeline-list');
  if(!timelineList) return;

  if(!sortedItems.length){
    timelineList.innerHTML = '<div class="empty-feed">이번 달 지출 내역이 없습니다.</div>';
    return;
  }

  // 날짜별 그룹핑 렌더링
  let html = '';
  let currentDate = null;
  let groupItems = [];

  function flushDateGroup(){
    if(!groupItems.length) return;
    const dateTotal = groupItems.reduce((s, it) => s + (it.type === 'out' ? Number(it.amount) : -Number(it.amount)), 0);
    const dateFormatted = currentDate ? `${currentDate.slice(5).replace('-', '월 ')}일 ${getDayString(currentDate)}` : '날짜 없음';

    html += `<div class="date-group">
      <div class="date-group-header">
        <span class="date-group-title">${dateFormatted}</span>
        <span class="date-group-subtotal">${dateTotal > 0 ? '-' : '+'}${fmt(Math.abs(dateTotal))}원</span>
      </div>`;

    groupItems.forEach(i => {
      const isOut = i.type === 'out';
      const isCancel = i.status === '취소';
      const amtPrefix = isOut ? '-' : '+';
      const amtClass = isOut ? 'expense' : 'income';
      const avatarText = i.payment ? i.payment.slice(0, 2) : '기타';
      const avatarCls = getAvatarClass(i.payment);

      html += `
        <div class="feed-card">
          <div class="feed-left">
            <div class="card-avatar ${avatarCls}">${esc(avatarText)}</div>
            <div class="feed-info">
              <div class="feed-merchant">${esc(i.merchant || '지출')}</div>
              <div class="feed-meta">
                <span>${esc(i.payment || '기타')}</span>
                ${i.time ? `<span>· ${esc(i.time)}</span>` : ''}
                ${isCancel ? `<span class="feed-tag cancel">취소</span>` : ''}
              </div>
            </div>
          </div>
          <div class="feed-right">
            <span class="feed-amount ${amtClass}">${amtPrefix}${fmt(Number(i.amount))}원</span>
            <button class="feed-del-btn" onclick="delItem('${i.id}')" title="삭제">✕</button>
          </div>
        </div>
      `;
    });

    html += `</div>`;
    groupItems = [];
  }

  if(sortBy.startsWith('date')){
    sortedItems.forEach(item => {
      if(item.date !== currentDate){
        flushDateGroup();
        currentDate = item.date;
      }
      groupItems.push(item);
    });
    flushDateGroup();
  } else {
    // 금액순 정렬일 때는 평면 리스트
    html = sortedItems.map(i => {
      const isOut = i.type === 'out';
      const isCancel = i.status === '취소';
      const amtPrefix = isOut ? '-' : '+';
      const amtClass = isOut ? 'expense' : 'income';
      const avatarText = i.payment ? i.payment.slice(0, 2) : '기타';
      const avatarCls = getAvatarClass(i.payment);

      return `
        <div class="feed-card">
          <div class="feed-left">
            <div class="card-avatar ${avatarCls}">${esc(avatarText)}</div>
            <div class="feed-info">
              <div class="feed-merchant">${esc(i.merchant || '지출')}</div>
              <div class="feed-meta">
                <span>${esc(i.date)}</span>
                <span>· ${esc(i.payment || '기타')}</span>
                ${isCancel ? `<span class="feed-tag cancel">취소</span>` : ''}
              </div>
            </div>
          </div>
          <div class="feed-right">
            <span class="feed-amount ${amtClass}">${amtPrefix}${fmt(Number(i.amount))}원</span>
            <button class="feed-del-btn" onclick="delItem('${i.id}')" title="삭제">✕</button>
          </div>
        </div>
      `;
    }).join('');
  }

  timelineList.innerHTML = html;
}

loadCloudData();
