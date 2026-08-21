'use strict';

const DEFAULT_ITEMS = [
  '糖燻跑山雞','鹽水跑山雞','糖燻五花肉','鹽水五花肉','棒棒腿','松阪肉','菊花肉','豬肋骨','豬腳',
  '糖燻山雞L腿','鹽水山雞L腿','醉雞','醉蝦','蹄膀','虎掌','筍乾','雞翅','鴨翅','杏鮑菇','滷蛋','軟絲','豬肚','豬心','黑輪',
  '涼拌雲耳','醬燒豆丁','醬燒海帶節'
];

const DB_NAME = 'chenjia-luwei-db';
const DB_VERSION = 1;
let db;
let deferredInstallPrompt = null;

const $ = id => document.getElementById(id);
const todayISO = () => new Date(Date.now() - new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const fmtDate = iso => iso ? iso.replace(/-/g,'/') : '';

function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2200);
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('items')) {
        const s = d.createObjectStore('items', { keyPath: 'id', autoIncrement: true });
        s.createIndex('sort', 'sort');
      }
      if (!d.objectStoreNames.contains('orders')) {
        const s = d.createObjectStore('orders', { keyPath: 'id', autoIncrement: true });
        s.createIndex('pickupDate', 'pickupDate');
        s.createIndex('customerName', 'customerName');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function store(name, mode='readonly') { return db.transaction(name, mode).objectStore(name); }
function reqP(req) { return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);}); }
const getAll = name => reqP(store(name).getAll());
const put = (name, value) => reqP(store(name,'readwrite').put(value));
const add = (name, value) => reqP(store(name,'readwrite').add(value));
const del = (name, key) => reqP(store(name,'readwrite').delete(key));

async function ensureDefaults() {
  const items = await getAll('items');
  if (items.length) return;
  const tx = db.transaction('items','readwrite');
  const s = tx.objectStore('items');
  DEFAULT_ITEMS.forEach((name,i)=>s.add({name,active:true,sort:i+1,createdAt:new Date().toISOString()}));
  await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
}

async function activeItems() {
  return (await getAll('items')).filter(i=>i.active).sort((a,b)=>a.sort-b.sort || a.id-b.id);
}
async function allItems() {
  return (await getAll('items')).sort((a,b)=>a.sort-b.sort || a.id-b.id);
}

async function renderQtyList(selected={}) {
  const items = await activeItems();
  $('itemQuantityList').innerHTML = items.length ? items.map(item => `
    <div class="qty-row" data-item-id="${item.id}">
      <div class="qty-name">${esc(item.name)}</div>
      <div class="qty-control">
        <button type="button" class="qty-minus" aria-label="${esc(item.name)}減少">−</button>
        <input class="qty-input" type="number" min="0" step="1" inputmode="numeric" value="${Number(selected[item.id] || 0)}" aria-label="${esc(item.name)}數量" />
        <button type="button" class="qty-plus" aria-label="${esc(item.name)}增加">＋</button>
      </div>
    </div>`).join('') : '<div class="empty">目前沒有啟用品項</div>';
}

function qtyMapFromForm() {
  const out = {};
  document.querySelectorAll('.qty-row').forEach(row => {
    const qty = Math.max(0, parseInt(row.querySelector('.qty-input').value || '0',10) || 0);
    if (qty > 0) out[row.dataset.itemId] = qty;
  });
  return out;
}

async function saveOrder(e) {
  e.preventDefault();
  const customerName = $('customerName').value.trim();
  const pickupDate = $('pickupDate').value;
  const quantities = qtyMapFromForm();
  if (!customerName || !pickupDate) return toast('請填寫姓名與取貨日期');
  if (!Object.keys(quantities).length) return toast('請至少填寫一個品項數量');
  const id = Number($('editingOrderId').value || 0);
  const now = new Date().toISOString();
  const base = {
    customerName,
    customerPhone: $('customerPhone').value.trim(),
    pickupDate,
    note: $('orderNote').value.trim(),
    quantities,
    updatedAt: now
  };
  if (id) {
    const old = await reqP(store('orders').get(id));
    await put('orders',{...old,...base,id});
    toast('訂單已更新');
  } else {
    await add('orders',{...base,createdAt:now});
    toast('訂單已儲存');
  }
  resetOrderForm();
  await refreshAll();
}

async function resetOrderForm() {
  $('orderForm').reset();
  $('editingOrderId').value='';
  $('pickupDate').value = todayISO();
  $('orderFormTitle').textContent='新增訂單';
  $('cancelEditBtn').classList.add('hidden');
  await renderQtyList();
}

async function editOrder(id) {
  const o = await reqP(store('orders').get(id));
  if (!o) return;
  switchView('newOrder');
  $('editingOrderId').value=o.id;
  $('customerName').value=o.customerName;
  $('customerPhone').value=o.customerPhone || '';
  $('pickupDate').value=o.pickupDate;
  $('orderNote').value=o.note || '';
  $('orderFormTitle').textContent='編輯訂單';
  $('cancelEditBtn').classList.remove('hidden');
  await renderQtyList(o.quantities || {});
  window.scrollTo({top:0,behavior:'smooth'});
}

function confirmAction(title, message) {
  return new Promise(resolve => {
    const d = $('confirmDialog');
    $('confirmTitle').textContent=title;
    $('confirmMessage').textContent=message;
    d.returnValue='';
    d.addEventListener('close',()=>resolve(d.returnValue==='ok'),{once:true});
    d.showModal();
  });
}

async function deleteOrder(id) {
  const o = await reqP(store('orders').get(id));
  if (!o) return;
  if (!(await confirmAction('刪除訂單', `確定刪除「${o.customerName}」${fmtDate(o.pickupDate)} 的訂單？`))) return;
  await del('orders',id);
  toast('訂單已刪除');
  await refreshAll();
}

async function renderOrders() {
  const items = await allItems();
  const names = Object.fromEntries(items.map(i=>[i.id,i.name]));
  const date = $('orderFilterDate').value;
  const q = $('orderSearch').value.trim().toLowerCase();
  let orders = await getAll('orders');
  orders = orders.filter(o => (!date || o.pickupDate===date) && (!q || (o.customerName||'').toLowerCase().includes(q) || (o.customerPhone||'').toLowerCase().includes(q)));
  orders.sort((a,b)=>b.pickupDate.localeCompare(a.pickupDate) || (b.id-a.id));
  $('orderList').innerHTML = orders.length ? orders.map(o => {
    const chips = Object.entries(o.quantities||{}).filter(([,qty])=>qty>0).map(([id,qty])=>`<span class="chip">${esc(names[id]||'已刪除品項')} × ${qty}</span>`).join('');
    return `<article class="order-card">
      <div class="order-card-head"><div><h3>${esc(o.customerName)}</h3><div class="meta">${fmtDate(o.pickupDate)}${o.customerPhone ? ' ・ '+esc(o.customerPhone):''}</div></div></div>
      <div class="chips">${chips}</div>
      ${o.note ? `<div class="note">備註：${esc(o.note)}</div>`:''}
      <div class="card-actions"><button class="ghost edit-order" data-id="${o.id}" type="button">修改</button><button class="danger delete-order" data-id="${o.id}" type="button">刪除</button></div>
    </article>`;
  }).join('') : '<div class="empty">沒有符合條件的訂單</div>';
}

async function getStats(date) {
  const items = await allItems();
  const orders = (await getAll('orders')).filter(o=>o.pickupDate===date).sort((a,b)=>a.id-b.id);
  const totals = {};
  let totalQty = 0;
  orders.forEach(o=>Object.entries(o.quantities||{}).forEach(([id,qty])=>{totals[id]=(totals[id]||0)+Number(qty); totalQty += Number(qty);}));
  return {items,orders,totals,totalQty};
}

async function renderStats() {
  const date = $('statsDate').value || todayISO();
  const {items,orders,totals,totalQty} = await getStats(date);
  const names = Object.fromEntries(items.map(i=>[i.id,i.name]));
  $('statsSummary').innerHTML = `
    <div class="summary-box">訂單筆數<strong>${orders.length}</strong></div>
    <div class="summary-box">品項總件數<strong>${totalQty}</strong></div>`;
  const rows = items.filter(i=>totals[i.id]>0).sort((a,b)=>a.sort-b.sort).map(i=>`<tr><td>${esc(i.name)}</td><td class="num"><strong>${totals[i.id]}</strong></td></tr>`).join('');
  $('itemTotalsBody').innerHTML = rows || '<tr><td colspan="2" class="empty">此日期尚無訂單</td></tr>';
  $('customerStatsList').innerHTML = orders.length ? orders.map(o=>{
    const chips = Object.entries(o.quantities||{}).filter(([,q])=>q>0).map(([id,q])=>`<span class="chip">${esc(names[id]||'已刪除品項')} × ${q}</span>`).join('');
    return `<div class="customer-stat"><h4>${esc(o.customerName)}</h4><div class="meta">${esc(o.customerPhone||'未填電話')}</div><div class="chips">${chips}</div>${o.note?`<div class="note">備註：${esc(o.note)}</div>`:''}</div>`;
  }).join('') : '<div class="empty">此日期尚無訂單</div>';
}

async function renderItemManagement() {
  const items = await allItems();
  $('itemManageList').innerHTML = items.map((i,idx)=>`<div class="manage-row" data-id="${i.id}">
    <div class="manage-order"><button class="ghost item-up" type="button" ${idx===0?'disabled':''}>▲</button><button class="ghost item-down" type="button" ${idx===items.length-1?'disabled':''}>▼</button></div>
    <div class="manage-name ${i.active?'':'disabled'}">${esc(i.name)}</div>
    <div class="manage-actions"><button class="ghost rename-item" type="button">改名</button><button class="ghost toggle-item" type="button">${i.active?'停用':'啟用'}</button><button class="danger delete-item" type="button">刪除</button></div>
  </div>`).join('');
}

async function addItem(e) {
  e.preventDefault();
  const name = $('newItemName').value.trim();
  if (!name) return;
  const items = await allItems();
  if (items.some(i=>i.name===name)) return toast('已有相同品項');
  await add('items',{name,active:true,sort:(items.at(-1)?.sort || 0)+1,createdAt:new Date().toISOString()});
  $('newItemName').value='';
  toast('品項已新增');
  await refreshAll();
}

async function renameItem(id) {
  const item = await reqP(store('items').get(id));
  const name = prompt('新的品項名稱：',item.name);
  if (name===null) return;
  const n=name.trim(); if(!n) return;
  const all=await allItems(); if(all.some(i=>i.id!==id && i.name===n)) return toast('已有相同品項');
  await put('items',{...item,name:n}); toast('品項名稱已更新'); await refreshAll();
}
async function toggleItem(id) { const i=await reqP(store('items').get(id)); await put('items',{...i,active:!i.active}); toast(i.active?'品項已停用':'品項已啟用'); await refreshAll(); }
async function deleteItem(id) {
  const i=await reqP(store('items').get(id));
  const orders=await getAll('orders');
  const used=orders.some(o=>Number(o.quantities?.[id]||0)>0);
  const msg=used ? `「${i.name}」已有歷史訂單。刪除後舊訂單仍保留數量，但品項名稱會顯示為「已刪除品項」。建議改用停用。仍要刪除嗎？` : `確定刪除「${i.name}」？`;
  if(!(await confirmAction('刪除品項',msg))) return;
  await del('items',id); toast('品項已刪除'); await refreshAll();
}
async function moveItem(id,dir) {
  const items=await allItems(); const idx=items.findIndex(i=>i.id===id); const j=idx+dir; if(idx<0||j<0||j>=items.length)return;
  const a=items[idx], b=items[j]; const temp=a.sort; a.sort=b.sort; b.sort=temp; await put('items',a); await put('items',b); await refreshAll();
}

function xmlEscape(s='') { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function xlsCell(value, type='String', style='') { return `<Cell${style?` ss:StyleID="${style}"`:''}><Data ss:Type="${type}">${xmlEscape(value)}</Data></Cell>`; }
function downloadBlob(blob, filename) { const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},500); }

async function exportExcel() {
  const date=$('statsDate').value; if(!date) return toast('請先選擇取貨日期');
  const {items,orders,totals}=await getStats(date); if(!orders.length) return toast('此日期沒有訂單');
  const activeIds = items.filter(i=>orders.some(o=>Number(o.quantities?.[i.id]||0)>0)).sort((a,b)=>a.sort-b.sort);
  const detailHeader=['取貨日期','訂購人姓名','電話','備註',...activeIds.map(i=>i.name)];
  const detailRows=orders.map(o=>[fmtDate(o.pickupDate),o.customerName,o.customerPhone||'',o.note||'',...activeIds.map(i=>Number(o.quantities?.[i.id]||0))]);
  const totalRows=activeIds.map(i=>[i.name,Number(totals[i.id]||0)]);
  const rowXml = row => `<Row>${row.map((v,idx)=>xlsCell(v, typeof v==='number'?'Number':'String', idx===0?'sText':'' )).join('')}</Row>`;
  const xml=`<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>
  <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles><Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Font ss:FontName="Microsoft JhengHei" ss:Size="11"/></Style><Style ss:ID="sHeader"><Font ss:FontName="Microsoft JhengHei" ss:Bold="1"/><Interior ss:Color="#EADFD5" ss:Pattern="Solid"/></Style><Style ss:ID="sText"><NumberFormat ss:Format="@"/></Style></Styles>
  <Worksheet ss:Name="訂單明細"><Table><Row>${detailHeader.map(h=>xlsCell(h,'String','sHeader')).join('')}</Row>${detailRows.map(rowXml).join('')}</Table></Worksheet>
  <Worksheet ss:Name="品項總計"><Table><Row>${['品項','總數量'].map(h=>xlsCell(h,'String','sHeader')).join('')}</Row>${totalRows.map(rowXml).join('')}</Table></Worksheet>
  </Workbook>`;
  downloadBlob(new Blob(['\ufeff',xml],{type:'application/vnd.ms-excel;charset=utf-8'}),`${date.replaceAll('-','')}_陳家糖燻滷味訂單.xls`);
  toast('Excel 已匯出');
}

async function exportBackup() {
  const payload={app:'陳家糖燻滷味',version:1,exportedAt:new Date().toISOString(),items:await getAll('items'),orders:await getAll('orders')};
  downloadBlob(new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'}),`陳家糖燻滷味_備份_${todayISO().replaceAll('-','')}.json`);
  toast('備份已匯出');
}

async function importBackup(file) {
  try {
    const data=JSON.parse(await file.text());
    if(!Array.isArray(data.items)||!Array.isArray(data.orders)) throw new Error('格式錯誤');
    if(!(await confirmAction('匯入備份',`將以備份內容取代目前資料：${data.items.length} 個品項、${data.orders.length} 筆訂單。確定繼續？`))) return;
    for (const name of ['items','orders']) {
      const tx=db.transaction(name,'readwrite'); const s=tx.objectStore(name); s.clear(); (data[name]||[]).forEach(v=>s.put(v));
      await new Promise((res,rej)=>{tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});
    }
    toast('備份已還原'); await refreshAll();
  } catch(err) { console.error(err); toast('備份檔無法讀取'); }
}

async function renderBackupInfo() {
  const [items,orders]=await Promise.all([getAll('items'),getAll('orders')]);
  $('backupInfo').innerHTML=`目前資料：<strong>${items.length}</strong> 個品項、<strong>${orders.length}</strong> 筆訂單。`;
}

function switchView(id) {
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===id));
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.view===id));
  if(id==='orders') renderOrders(); if(id==='stats') renderStats(); if(id==='items') renderItemManagement(); if(id==='backup') renderBackupInfo();
}

async function refreshAll() {
  await Promise.all([renderOrders(),renderStats(),renderItemManagement(),renderBackupInfo()]);
  if(!$('editingOrderId').value) await renderQtyList();
}

function bindEvents() {
  document.querySelector('.tabs').addEventListener('click',e=>{const b=e.target.closest('.tab');if(b)switchView(b.dataset.view);});
  $('orderForm').addEventListener('submit',saveOrder);
  $('cancelEditBtn').addEventListener('click',resetOrderForm);
  $('clearQtyBtn').addEventListener('click',()=>document.querySelectorAll('.qty-input').forEach(i=>i.value=0));
  $('itemQuantityList').addEventListener('click',e=>{const row=e.target.closest('.qty-row');if(!row)return;const inp=row.querySelector('.qty-input');let v=Math.max(0,parseInt(inp.value||0,10)||0);if(e.target.closest('.qty-plus'))inp.value=v+1;if(e.target.closest('.qty-minus'))inp.value=Math.max(0,v-1);});
  $('orderFilterDate').addEventListener('change',renderOrders); $('orderSearch').addEventListener('input',renderOrders);
  $('todayOrdersBtn').addEventListener('click',()=>{$('orderFilterDate').value=todayISO();renderOrders();});
  $('clearOrderFilterBtn').addEventListener('click',()=>{$('orderFilterDate').value='';$('orderSearch').value='';renderOrders();});
  $('orderList').addEventListener('click',e=>{const ed=e.target.closest('.edit-order');const de=e.target.closest('.delete-order');if(ed)editOrder(Number(ed.dataset.id));if(de)deleteOrder(Number(de.dataset.id));});
  $('statsDate').addEventListener('change',renderStats); $('exportExcelBtn').addEventListener('click',exportExcel);
  $('addItemForm').addEventListener('submit',addItem);
  $('itemManageList').addEventListener('click',e=>{const row=e.target.closest('.manage-row');if(!row)return;const id=Number(row.dataset.id);if(e.target.closest('.rename-item'))renameItem(id);if(e.target.closest('.toggle-item'))toggleItem(id);if(e.target.closest('.delete-item'))deleteItem(id);if(e.target.closest('.item-up'))moveItem(id,-1);if(e.target.closest('.item-down'))moveItem(id,1);});
  $('exportBackupBtn').addEventListener('click',exportBackup); $('importBackupInput').addEventListener('change',e=>{const f=e.target.files[0];if(f)importBackup(f);e.target.value='';});
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstallPrompt=e;$('installBtn').classList.remove('hidden');});
  $('installBtn').addEventListener('click',async()=>{if(!deferredInstallPrompt)return;deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;$('installBtn').classList.add('hidden');});
}

async function init() {
  db=await openDB(); await ensureDefaults(); bindEvents(); $('pickupDate').value=todayISO(); $('statsDate').value=todayISO(); await refreshAll();
  if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(console.error);
}

init().catch(err=>{console.error(err);document.body.innerHTML='<main><div class="card"><h2>系統初始化失敗</h2><p>請重新整理頁面，或確認瀏覽器允許網站儲存資料。</p></div></main>';});
