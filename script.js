'use strict';

const $ = selector => document.querySelector(selector);

const rooms = [
  {id:'standard',name:'Standard Room',price:1000,capacity:2,size:'18–25',bed:'เตียงควีนไซส์',image:'photo-1611892440504-42a792e24d32'},
  {id:'deluxe',name:'Deluxe Room',price:1500,capacity:2,size:'30–35',bed:'เตียงคิงไซส์',image:'photo-1590490360182-c33d57733427'},
  {id:'superior',name:'Superior Room',price:2000,capacity:3,size:'25–30',bed:'เตียงคิงไซส์',image:'photo-1566665797739-1674de7a421a'},
  {id:'family',name:'Family Room',price:4500,capacity:6,size:'40–50',bed:'เตียงคู่สำหรับครอบครัว',image:'photo-1566073771259-6a8506099945'}
];

const money = value => value.toLocaleString('th-TH');

function renderRooms(list) {
  const roomGrid = $('#room-grid');
  const emptyState = $('#empty-state');

  if (roomGrid) {
    roomGrid.innerHTML = list.map(room => `
      <article class="room-card">
        <img class="room-photo" src="https://images.unsplash.com/${room.image}?auto=format&fit=crop&w=900&q=85" alt="ตัวอย่างบรรยากาศ ${room.name}" loading="lazy">
        <div class="room-info">
          <h3>${room.name}</h3>
          <p class="price"><strong>${money(room.price)}</strong> บาท <small>/ คืน</small></p>
          <p class="capacity">
            <svg aria-hidden="true"><use href="#person"/></svg>
            เหมาะสำหรับจำนวนผู้เข้าพัก 1–${room.capacity} คน
          </p>
          <p class="details">ขนาดห้อง ${room.size} ตร.ม.<br>ราคาอาหารเช้า 350 บาทต่อคน</p>
          <div class="amenities">
            <span>${room.bed}</span>
            <span>free wifi</span>
          </div>
          <button class="primary" data-book="${room.id}">จองห้องนี้</button>
        </div>
      </article>
    `).join('');
  }

  if (emptyState) {
    emptyState.hidden = list.length > 0;
  }
}

renderRooms(rooms);

const localDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const parseDate = value => new Date(`${value}T00:00:00`);
const addDay = value => {
  const date = parseDate(value);
  date.setDate(date.getDate() + 1);
  return localDate(date);
};

const today = localDate(new Date());
if ($('#checkin')) $('#checkin').min = today;
if ($('#checkout')) $('#checkout').min = addDay(today);

function datesValid() {
  const searchError = $('#search-error');
  if (searchError) searchError.textContent = '';
  
  const checkinVal = $('#checkin')?.value;
  const checkoutVal = $('#checkout')?.value;

  if (!checkinVal || !checkoutVal) return false;
  
  if (checkinVal < today) {
    if (searchError) searchError.textContent = 'กรุณาเลือกวันเช็คอินตั้งแต่วันนี้เป็นต้นไป';
    return false;
  }
  
  if (checkoutVal <= checkinVal) {
    if (searchError) searchError.textContent = 'วันเช็คเอาท์ต้องอยู่หลังวันเช็คอิน';
    return false;
  }
  
  return true;
}

$('#checkin')?.addEventListener('change', () => {
  const checkinInput = $('#checkin');
  const checkoutInput = $('#checkout');
  
  if (!checkinInput?.value) return;
  
  if (checkoutInput) {
    checkoutInput.min = addDay(checkinInput.value);
    if (checkoutInput.value && checkoutInput.value <= checkinInput.value) {
      checkoutInput.value = addDay(checkinInput.value);
    }
  }
  
  const searchError = $('#search-error');
  if (searchError) searchError.textContent = '';
});

$('#search-form')?.addEventListener('submit', event => {
  event.preventDefault();
  if (!datesValid()) return;

  const type = $('#room-type')?.value;
  const guests = Number($('#guests')?.value || 1);
  
  const filtered = rooms.filter(room => (type === 'all' || room.id === type) && room.capacity >= guests);
  
  renderRooms(filtered);
  
  if ($('#rooms-title')) $('#rooms-title').textContent = 'ห้องพักที่เหมาะกับวันพักผ่อนของคุณ';
  if ($('#results-status')) {
    $('#results-status').textContent = `พบ ${filtered.length} ประเภทห้อง · ${guests} คน · ${formatDate($('#checkin').value)} – ${formatDate($('#checkout').value)} · ตัวอย่างข้อมูล ยังไม่ใช่จำนวนห้องว่างจริง`;
  }
  
  if ($('#reset-search')) $('#reset-search').hidden = false;
  
  location.hash = 'rooms';
  $('#rooms')?.scrollIntoView({ behavior: 'smooth' });
});

function resetRooms() {
  renderRooms(rooms);
  if ($('#room-type')) $('#room-type').value = 'all';
  if ($('#rooms-title')) $('#rooms-title').textContent = 'เลือกห้องพักที่เหมาะกับคุณ';
  if ($('#results-status')) $('#results-status').textContent = '';
  if ($('#reset-search')) $('#reset-search').hidden = true;
}

$('#reset-search')?.addEventListener('click', resetRooms);
$('#empty-reset')?.addEventListener('click', resetRooms);

function formatDate(value) {
  return parseDate(value).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
}

$('#menu-toggle')?.addEventListener('click', () => {
  const nav = $('#main-nav');
  const open = nav ? nav.classList.toggle('open') : false;
  $('#menu-toggle').setAttribute('aria-expanded', String(open));
});

function updatePage() {
  const current = location.hash.slice(1) || 'home';
  document.querySelectorAll('[data-page]').forEach(link => {
    link.classList.toggle('active', link.dataset.page === current);
  });
}

document.querySelectorAll('#main-nav a').forEach(link => {
  link.addEventListener('click', () => {
    $('#main-nav')?.classList.remove('open');
    $('#menu-toggle')?.setAttribute('aria-expanded', 'false');
  });
});

window.addEventListener('hashchange', updatePage);
updatePage();

/* Facilities Section (สลับสถานะปุ่มจองเป็นสีเขียว "จองแล้ว • ยกเลิก") */
const facilityInfo = {
  fitness: { name: 'ฟิตเนส (Fitness Center)', time: 'เปิดบริการตั้งแต่เวลา 07:00 - 21:30 น.' },
  sauna: { name: 'ซาวน่า (Sauna)', time: 'เปิดบริการตั้งแต่เวลา 07:00 - 21:30 น.' },
  sunset: { name: 'ชมพระอาทิตย์ตก (Watch The Sunset)', time: 'เปิดให้จองในเวลา 18:00 น.' },
  market: { name: 'ตลาดกลางคืน (Night Market)', time: 'เปิดให้จองในเวลา 18:00 น.' }
};

let activeFacilityBtn = null;

document.querySelectorAll('[data-facility]').forEach(button => {
  button.addEventListener('click', () => {
    if (button.classList.contains('booked')) {
      button.classList.remove('booked');
      button.textContent = 'จอง';
      toast('ยกเลิกการจองบริการเรียบร้อยแล้ว');
      return;
    }

    activeFacilityBtn = button;
    const key = button.dataset.facility;
    const info = facilityInfo[key];

    if (info) {
      if ($('#facility-title')) $('#facility-title').textContent = info.name;
      if ($('#facility-summary')) $('#facility-summary').textContent = info.time;
      if ($('#facility-date')) $('#facility-date').min = today;
      $('#facility-dialog')?.showModal();
    }
  });
});

$('#facility-form')?.addEventListener('submit', event => {
  event.preventDefault();
  if (activeFacilityBtn) {
    activeFacilityBtn.classList.add('booked');
    activeFacilityBtn.textContent = 'จองแล้ว • ยกเลิก';
  }
  $('#facility-dialog')?.close();
  event.target.reset();
  toast('จองบริการสำเร็จเรียบร้อยแล้ว');
});

/* ระบบควบคุมการเปิด Modal จองห้องพักแบบใหม่ (ตรงตามภาพ 11.jpg) */
let selectedRoom = null;

function updateModalTotal() {
  if (!selectedRoom) return;
  const inVal = $('#modal-checkin').value;
  const outVal = $('#modal-checkout').value;
  let nights = 1;

  if (inVal && outVal && outVal > inVal) {
    nights = Math.round((parseDate(outVal) - parseDate(inVal)) / 86400000);
  }

  let total = selectedRoom.price * nights;
  
  // เพิ่มอาหารเช้า 350 บาท ต่อคน ต่อคืน (ถ้าเลือก)
  if ($('#modal-breakfast-checkbox')?.checked) {
    const guests = Number($('#guests')?.value || 2);
    total += (350 * guests * nights);
  }

  if ($('#modal-total-price')) {
    $('#modal-total-price').textContent = money(total);
  }
}

$('#room-grid')?.addEventListener('click', event => {
  const button = event.target.closest('[data-book]');
  if (!button) return;

  const room = rooms.find(item => item.id === button.dataset.book);
  if (!room) return;
  selectedRoom = room;

  // ตั้งค่าข้อมูลการ์ดใน Modal
  if ($('#modal-room-header-title')) $('#modal-room-header-title').textContent = `จอง ${room.name}`;
  if ($('#modal-room-name')) $('#modal-room-name').textContent = room.name;
  if ($('#modal-room-img')) $('#modal-room-img').src = `https://images.unsplash.com/${room.image}?auto=format&fit=crop&w=400&q=80`;
  if ($('#modal-room-subtext')) $('#modal-room-subtext').textContent = `${room.roomNo} ${room.size}ตร.ม. 1-${room.capacity} คน`;
  if ($('#modal-room-price')) $('#modal-room-price').textContent = money(room.price);

  // ดึงวันที่จากค้นหาหลัก (ถ้ามี)
  const mainIn = $('#checkin')?.value || today;
  const mainOut = $('#checkout')?.value || addDay(today);

  const mIn = $('#modal-checkin');
  const mOut = $('#modal-checkout');

  if (mIn) {
    mIn.min = today;
    mIn.value = mainIn;
  }
  if (mOut) {
    mOut.min = addDay(mainIn);
    mOut.value = mainOut;
  }

  if ($('#modal-capacity-notice')) {
    $('#modal-capacity-notice').textContent = `รายการจองนี้ผูกกับลูกค้า 1 ราย ห้องพัก 1 ห้อง และรองรับผู้เข้าพัก ${room.capacity} คน โดยระบบได้ทำการตรวจสอบการจองซ้ำแล้ว`;
  }

  if ($('#modal-breakfast-checkbox')) $('#modal-breakfast-checkbox').checked = false;

  updateModalTotal();
  $('#booking-dialog')?.showModal();
});

// คำนวณราคาทันทีเมื่อเปลี่ยนวัน หรือ ติ๊กเพิ่มอาหารเช้า
$('#modal-checkin')?.addEventListener('change', () => {
  const mIn = $('#modal-checkin');
  const mOut = $('#modal-checkout');
  if (mIn?.value && mOut) {
    mOut.min = addDay(mIn.value);
    if (mOut.value <= mIn.value) mOut.value = addDay(mIn.value);
  }
  updateModalTotal();
});

$('#modal-checkout')?.addEventListener('change', updateModalTotal);
$('#modal-breakfast-checkbox')?.addEventListener('change', updateModalTotal);

// แสดงชื่อไฟล์สลิปเมื่อผู้ใช้เลือกไฟล์
$('#slip-upload-input')?.addEventListener('change', event => {
  const file = event.target.files[0];
  if (file && $('#slip-file-name')) {
    $('#slip-file-name').textContent = `สลิป: ${file.name}`;
  }
});

// ยืนยันการจอง
$('#booking-form')?.addEventListener('submit', event => {
  event.preventDefault();
  $('#booking-dialog')?.close();
  event.target.reset();
  if ($('#slip-file-name')) $('#slip-file-name').textContent = 'อัปโหลดหลักฐานการจอง';
  toast('ส่งหลักฐานการจองสำเร็จ — ระบบจำลองยังไม่มีการเรียกเก็บเงินจริง');
});

/* Live Chat */
function toggleChat(open) {
  const chatPanel = $('#chat-panel');
  const chatToggle = $('#chat-toggle');
  
  if (chatPanel) chatPanel.hidden = !open;
  if (chatToggle) {
    chatToggle.setAttribute('aria-expanded', String(open));
    const label = chatToggle.querySelector('span');
    if (label) label.textContent = open ? 'ปิดแชต' : 'พูดคุยกับพนักงาน';
  }
  if (open) $('#chat-input')?.focus();
}

$('#chat-toggle')?.addEventListener('click', () => toggleChat($('#chat-panel')?.hidden));
$('#chat-close')?.addEventListener('click', () => {
  toggleChat(false);
  $('#chat-toggle')?.focus();
});

document.querySelectorAll('[data-open-chat]').forEach(button => {
  button.addEventListener('click', () => toggleChat(true));
});

$('#chat-form')?.addEventListener('submit', event => {
  event.preventDefault();
  const input = $('#chat-input');
  const text = input?.value.trim();
  if (!text) return;

  const chatMessages = $('#chat-messages');

  const userMsg = document.createElement('p');
  userMsg.className = 'message guest';
  userMsg.textContent = text;
  chatMessages?.append(userMsg);
  
  if (input) input.value = '';

  setTimeout(() => {
    const replyMsg = document.createElement('p');
    replyMsg.className = 'message staff';
    replyMsg.textContent = 'นี่คือแชตตัวอย่าง ข้อความยังไม่ได้ส่งถึงเจ้าหน้าที่ค่ะ สามารถทดลองเลือกห้องและดูสรุปการจองได้จากปุ่ม “จองห้องนี้”';
    chatMessages?.append(replyMsg);
    if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
  }, 400);
});

/* Toast Notification */
let toastTimer;
function toast(message) {
  const toastEl = $('#toast');
  if (!toastEl) return;
  
  toastEl.textContent = message;
  toastEl.hidden = false;
  
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.hidden = true;
  }, 5500);
}

document.querySelectorAll('[data-login]').forEach(button => {
  button.addEventListener('click', () => {
    if ($('#login-title')) $('#login-title').textContent = `เข้าสู่ระบบ${button.dataset.login}`;
    $('#login-dialog')?.showModal();
  });
});

$('#login-form')?.addEventListener('submit', event => {
  event.preventDefault();
  $('#login-dialog')?.close();
  event.target.reset();
  toast('หน้าตัวอย่างพร้อมใช้งาน — ยังไม่เชื่อมต่อระบบเข้าสู่ระบบ');
});

document.querySelectorAll('[data-close]').forEach(button => {
  button.addEventListener('click', () => button.closest('dialog')?.close());
});

document.querySelectorAll('dialog').forEach(dialog => {
  dialog.addEventListener('click', event => {
    if (event.target === dialog) {
      const rect = dialog.getBoundingClientRect();
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      ) {
        dialog.close();
      }
    }
  });
});

$('#language')?.addEventListener('change', () => {
  toast('ต้นแบบนี้รองรับภาษาไทยก่อน ภาษาอังกฤษอยู่ระหว่างเตรียมเนื้อหา');
  if ($('#language')) $('#language').value = 'th';
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && $('#chat-panel') && !$('#chat-panel').hidden) {
    toggleChat(false);
  }
});