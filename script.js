'use strict';
const $ = selector => document.querySelector(selector);
const rooms = [
  {id:'standard',name:'Standard Room',price:1000,capacity:2,size:'18–25',bed:'เตียงควีนไซส์',image:'photo-1611892440504-42a792e24d32'},
  {id:'deluxe',name:'Deluxe Room',price:1500,capacity:2,size:'30–35',bed:'เตียงคิงไซส์',image:'photo-1590490360182-c33d57733427'},
  {id:'superior',name:'Superior Room',price:1400,capacity:3,size:'25–30',bed:'เตียงคิงไซส์',image:'photo-1566665797739-1674de7a421a'},
  {id:'family',name:'Family Room',price:2600,capacity:6,size:'40–50',bed:'เตียงคู่สำหรับครอบครัว',image:'photo-1566073771259-6a8506099945'}
];
// ข้อมูลห้องและราคาเป็นข้อมูลตัวอย่างสำหรับ UX/UI เปลี่ยนเป็น API ได้ภายหลัง
const money = value => value.toLocaleString('th-TH');
function renderRooms(list) {
  $('#room-grid').innerHTML = list.map(room => `<article class="room-card"><img class="room-photo" src="https://images.unsplash.com/${room.image}?auto=format&fit=crop&w=900&q=85" alt="ตัวอย่างบรรยากาศ ${room.name}" loading="lazy"><div class="room-info"><h3>${room.name}</h3><p class="price"><strong>${money(room.price)}</strong> บาท <small>/ คืน</small></p><p class="capacity"><svg aria-hidden="true"><use href="#person"/></svg>เหมาะสำหรับจำนวนผู้เข้าพัก 1–${room.capacity} คน</p><p class="details">ขนาดห้อง ${room.size} ตร.ม.<br>ราคาอาหารเช้า 350 บาทต่อคน</p><div class="amenities"><span>${room.bed}</span><span>free wifi</span></div><button class="primary" data-book="${room.id}">จองห้องนี้</button></div></article>`).join('');
  $('#empty-state').hidden = list.length > 0;
}
renderRooms(rooms);
const localDate = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const parseDate = value => new Date(`${value}T00:00:00`);
const addDay = value => { const date = parseDate(value); date.setDate(date.getDate()+1); return localDate(date); };
const today = localDate(new Date());
$('#checkin').min = today;
$('#checkout').min = addDay(today);
function datesValid() {
  $('#search-error').textContent = '';
  if (!$('#checkin').value || !$('#checkout').value) return false;
  if ($('#checkin').value < today) { $('#search-error').textContent = 'กรุณาเลือกวันเช็คอินตั้งแต่วันนี้เป็นต้นไป'; return false; }
  if ($('#checkout').value <= $('#checkin').value) { $('#search-error').textContent = 'วันเช็คเอาท์ต้องอยู่หลังวันเช็คอิน'; return false; }
  return true;
}
$('#checkin').addEventListener('change', () => {
  if (!$('#checkin').value) return;
  $('#checkout').min = addDay($('#checkin').value);
  if ($('#checkout').value && $('#checkout').value <= $('#checkin').value) $('#checkout').value = addDay($('#checkin').value);
  $('#search-error').textContent = '';
});
$('#search-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!datesValid()) return;
  const type = $('#room-type').value;
  const guests = Number($('#guests').value);
  const filtered = rooms.filter(room => (type === 'all' || room.id === type) && room.capacity >= guests);
  renderRooms(filtered);
  $('#rooms-title').textContent = 'ห้องพักที่เหมาะกับวันพักผ่อนของคุณ';
  $('#results-status').textContent = `พบ ${filtered.length} ประเภทห้อง · ${guests} คน · ${formatDate($('#checkin').value)} – ${formatDate($('#checkout').value)} · ตัวอย่างข้อมูล ยังไม่ใช่จำนวนห้องว่างจริง`;
  $('#reset-search').hidden = false;
  location.hash = 'rooms';
  $('#rooms').scrollIntoView({behavior:'smooth'});
});
function resetRooms() { renderRooms(rooms); $('#room-type').value='all'; $('#rooms-title').textContent='เลือกห้องพักที่เหมาะกับคุณ'; $('#results-status').textContent=''; $('#reset-search').hidden=true; }
$('#reset-search').addEventListener('click',resetRooms);
$('#empty-reset').addEventListener('click',resetRooms);
function formatDate(value) { return parseDate(value).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'}); }
$('#menu-toggle').addEventListener('click', () => { const open=$('#main-nav').classList.toggle('open'); $('#menu-toggle').setAttribute('aria-expanded',String(open)); });
function updatePage() {
  const current=location.hash.slice(1)||'home';
  document.querySelectorAll('[data-page]').forEach(link=>link.classList.toggle('active',link.dataset.page===current));
}
document.querySelectorAll('#main-nav a').forEach(link=>link.addEventListener('click',()=>{ $('#main-nav').classList.remove('open'); $('#menu-toggle').setAttribute('aria-expanded','false'); }));
window.addEventListener('hashchange',updatePage); updatePage();
function toggleChat(open) {
  $('#chat-panel').hidden=!open;
  $('#chat-toggle').setAttribute('aria-expanded',String(open));
  $('#chat-toggle span').textContent=open?'ปิดแชต':'พูดคุยกับพนักงาน';
  if(open) $('#chat-input').focus();
}
$('#chat-toggle').addEventListener('click',()=>toggleChat($('#chat-panel').hidden));
$('#chat-close').addEventListener('click',()=>{toggleChat(false);$('#chat-toggle').focus();});
document.querySelectorAll('[data-open-chat]').forEach(button=>button.addEventListener('click',()=>toggleChat(true)));
$('#chat-form').addEventListener('submit',event=>{
  event.preventDefault(); const text=$('#chat-input').value.trim(); if(!text)return;
  const message=document.createElement('p'); message.className='message guest'; message.textContent=text; $('#chat-messages').append(message);
  $('#chat-input').value='';
  const reply=document.createElement('p');reply.className='message staff';reply.textContent='นี่คือแชตตัวอย่าง ข้อความยังไม่ได้ส่งถึงเจ้าหน้าที่ค่ะ สามารถทดลองเลือกห้องและดูสรุปการจองได้จากปุ่ม “จองห้องนี้”'; $('#chat-messages').append(reply);
  $('#chat-messages').scrollTop=$('#chat-messages').scrollHeight;
});
let toastTimer;
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{$('#toast').hidden=true;},5500);}
$('#room-grid').addEventListener('click',event=>{
  const button=event.target.closest('[data-book]');if(!button)return;
  const room=rooms.find(item=>item.id===button.dataset.book);
  if(!datesValid()) {$('#checkin').focus();toast('เลือกวันเช็คอินและวันเช็คเอาท์ก่อนจองห้องพัก');window.scrollTo({top:0,behavior:'smooth'});return;}
  if(Number($('#guests').value)>room.capacity){toast(`ห้องนี้รองรับได้สูงสุด ${room.capacity} คน กรุณาปรับจำนวนผู้เข้าพัก`);return;}
  const nights=Math.round((parseDate($('#checkout').value)-parseDate($('#checkin').value))/86400000);
  $('#booking-title').textContent=room.name;
  $('#booking-summary').textContent=`${formatDate($('#checkin').value)} – ${formatDate($('#checkout').value)}\n${nights} คืน · ${$('#guests').value} คน · 1 ห้อง\nค่าห้องพักรวม ${money(room.price*nights)} บาท\nยังไม่รวมอาหารเช้า · ราคาเพื่อสาธิต UX/UI`;
  $('#booking-dialog').showModal();
});
$('#booking-form').addEventListener('submit',event=>{event.preventDefault();$('#booking-dialog').close();event.target.reset();toast('ทดลองจองสำเร็จ — ยังไม่มีการจองหรือเรียกเก็บเงินจริง');});
document.querySelectorAll('[data-login]').forEach(button=>button.addEventListener('click',()=>{$('#login-title').textContent=`เข้าสู่ระบบ${button.dataset.login}`;$('#login-dialog').showModal();}));
$('#login-form').addEventListener('submit',event=>{event.preventDefault();$('#login-dialog').close();event.target.reset();toast('หน้าตัวอย่างพร้อมใช้งาน — ยังไม่เชื่อมต่อระบบเข้าสู่ระบบ');});
document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}}));
$('#language').addEventListener('change',()=>{toast('ต้นแบบนี้รองรับภาษาไทยก่อน ภาษาอังกฤษอยู่ระหว่างเตรียมเนื้อหา');$('#language').value='th';});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('#chat-panel').hidden)toggleChat(false);});
