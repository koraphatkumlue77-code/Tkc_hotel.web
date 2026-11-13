'use strict';

const $ = selector => document.querySelector(selector);

/* ==================== เมนู Responsive บนมือถือและไอแพด ==================== */
const menuToggle = $('#menu-toggle');
const mainNav = $('#main-nav');

menuToggle?.addEventListener('click', () => {
  const isOpen = mainNav?.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(Boolean(isOpen)));
});

// ปิดเมนูอัตโนมัติเมื่อกดเลือกลิงก์ในหน้าจอมือถือ/ไอแพด
mainNav?.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    mainNav.classList.remove('open');
    menuToggle?.setAttribute('aria-expanded', 'false');
  });
});

/* ==================== ฐานข้อมูลพนักงานแยกตามฝ่าย (Role-Based Access) ==================== */
const staffAccounts = [
  { email: 'admin@tkc.com', password: '12345678', role: 'superadmin', roleLabel: 'Super Admin', name: 'คุณสมชาย (ผู้ดูแลระบบสูงสุด)' },
  { email: 'reception@tkc.com', password: '12345678', role: 'reception', roleLabel: 'ฝ่ายต้อนรับ', name: 'คุณสุดา (หัวหน้าฝ่ายต้อนรับ)' },
  { email: 'account@tkc.com', password: '12345678', role: 'accounting', roleLabel: 'ฝ่ายบัญชี', name: 'คุณวิภา (เจ้าหน้าที่บัญชี)' },
  { email: 'exec@tkc.com', password: '12345678', role: 'executive', roleLabel: 'ฝ่ายบริหาร', name: 'คุณอรทัย พ. (ฝ่ายบริหาร)' }
];

let currentStaffSession = null;
let currentLoginMode = 'ลูกค้า';

// Template ประวัติการจองย้อนหลังที่ใช้ร่วมกัน
function getBookingHistoryHTML(prefix) {
  return `
    <div class="admin-card-header">
      <div>
        <h3>ประวัติการจองย้อนหลัง</h3>
        <p>เก็บข้อมูลลูกค้า ห้อง วันที่ ค่าใช้จ่าย การชำระเงิน และทุกสถานะของรายการจอง</p>
      </div>
      <span class="count-pill">2 รายการ</span>
    </div>

    <div class="history-split-grid">
      <div class="history-list">
        <div class="history-item active" id="${prefix}-hist-1" onclick="selectSharedBooking('${prefix}', 1)">
          <div>
            <strong>BKG-23984</strong>
            <p>ณัฐวดี พรหมมา · ห้อง 201</p>
            <small>2026-05-12 → 2026-05-14</small>
          </div>
          <span class="status-badge green">เช็คเอาท์แล้ว</span>
        </div>
        <div class="history-item" id="${prefix}-hist-2" onclick="selectSharedBooking('${prefix}', 2)">
          <div>
            <strong>BKG-23951</strong>
            <p>ธนกร วัฒนชัย · ห้อง 402</p>
            <small>2026-04-03 → 2026-04-05</small>
          </div>
          <span class="status-badge red-soft">ยกเลิก</span>
        </div>
      </div>

      <div class="history-detail-box" id="${prefix}-detail-pane">
        ${getBookingRecordDetail(1)}
      </div>
    </div>
  `;
}

function getBookingRecordDetail(recordId) {
  if (recordId === 1) {
    return `
      <div class="hd-top">
        <div>
          <small class="hd-code">BOOKING RECORD · BKG-23984</small>
          <h4>ณัฐวดี พรหมมา</h4>
          <p>nattawadee@example.com · 089-245-7812</p>
          <small class="hd-guest-id">รหัสลูกค้า GUEST-0182</small>
        </div>
        <span class="status-badge green">เช็คเอาท์แล้ว</span>
      </div>
      <div class="hd-info-cards">
        <div class="hd-mini-card"><small>ห้องพัก</small><strong>Superior Room</strong><span>ห้อง 201 · 2 คน</span></div>
        <div class="hd-mini-card"><small>Check-in</small><strong>2026-05-12</strong></div>
        <div class="hd-mini-card"><small>Check-out</small><strong>2026-05-14</strong></div>
      </div>
      <div class="hd-bottom-grid">
        <div>
          <h5>รายการค่าใช้จ่าย</h5>
          <div class="cost-line"><span>Superior Room · 2 คืน <small>ห้องพัก</small></span><strong>฿3,000</strong></div>
          <div class="cost-line"><span>อาหารเช้า 2 คน <small>อาหารเช้า</small></span><strong>฿700</strong></div>
          <div class="cost-line"><span>อบซาวน่า <small>บริการเสริม</small></span><strong>฿450</strong></div>
          <div class="cost-total"><span>รวมทั้งหมด</span><strong>฿4,150</strong></div>
          <h5 class="mt-16">ประวัติการชำระเงิน</h5>
          <div class="pay-slip-row"><div><strong>PAY-67214</strong><small>มัดจำ · ตรวจสอบแล้ว</small></div><strong>฿2,075</strong></div>
          <div class="pay-slip-row"><div><strong>PAY-67302</strong><small>ยอดคงเหลือ · ตรวจสอบแล้ว</small></div><strong>฿2,075</strong></div>
          <p class="paid-summary">ชำระแล้ว ฿4,150 / ฿4,150</p>
        </div>
        <div>
          <h5>ลำดับสถานะย้อนหลัง</h5>
          <ul class="timeline-list">
            <li><span class="dot"></span><div><strong>รอตรวจสอบ</strong><small>2026-04-28 14:20</small><small>ดำเนินการโดย ลูกค้า</small></div></li>
            <li><span class="dot"></span><div><strong>ยืนยันแล้ว</strong><small>2026-04-28 15:05</small><small>ดำเนินการโดย ฝ่ายบัญชี</small></div></li>
            <li><span class="dot"></span><div><strong>เช็คเอาท์แล้ว</strong><small>2026-05-14 11:12</small><small>ดำเนินการโดย ฝ่ายต้อนรับ</small></div></li>
          </ul>
        </div>
      </div>
    `;
  }
  return `
    <div class="hd-top">
      <div>
        <small class="hd-code">BOOKING RECORD · BKG-23951</small>
        <h4>ธนกร วัฒนชัย</h4>
        <p>thanakorn@example.com · 081-992-4410</p>
        <small class="hd-guest-id">รหัสลูกค้า GUEST-0154</small>
      </div>
      <span class="status-badge red-soft">ยกเลิก</span>
    </div>
    <div class="hd-info-cards">
      <div class="hd-mini-card"><small>ห้องพัก</small><strong>Family Room</strong><span>ห้อง 402 · 4 คน</span></div>
      <div class="hd-mini-card"><small>Check-in</small><strong>2026-04-03</strong></div>
      <div class="hd-mini-card"><small>Check-out</small><strong>2026-04-05</strong></div>
    </div>
    <div class="hd-bottom-grid">
      <div>
        <h5>รายการค่าใช้จ่าย</h5>
        <div class="cost-line"><span>Family Room · 2 คืน <small>ห้องพัก</small></span><strong>฿9,000</strong></div>
        <div class="cost-total"><span>รวมทั้งหมด</span><strong>฿9,000</strong></div>
        <p class="paid-summary" style="color:#dc2626;">ยกเลิกรายการก่อนชำระเงิน</p>
      </div>
      <div>
        <h5>ลำดับสถานะย้อนหลัง</h5>
        <ul class="timeline-list">
          <li><span class="dot"></span><div><strong>สร้างรายการจอง</strong><small>2026-03-29 10:15</small><small>ดำเนินการโดย ลูกค้า</small></div></li>
          <li><span class="dot" style="background:#ef4444;"></span><div><strong>ยกเลิกรายการ</strong><small>2026-03-30 09:00</small><small>ดำเนินการโดย ลูกค้า</small></div></li>
        </ul>
      </div>
    </div>
  `;
}

window.selectSharedBooking = function(prefix, recordId) {
  $(`#${prefix}-hist-1`)?.classList.toggle('active', recordId === 1);
  $(`#${prefix}-hist-2`)?.classList.toggle('active', recordId === 2);
  const pane = $(`#${prefix}-detail-pane`);
  if (pane) pane.innerHTML = getBookingRecordDetail(recordId);
};

if ($('#shared-booking-history-superadmin')) $('#shared-booking-history-superadmin').innerHTML = getBookingHistoryHTML('sa');
if ($('#shared-booking-history-reception')) $('#shared-booking-history-reception').innerHTML = getBookingHistoryHTML('rec');
if ($('#shared-booking-history-executive')) $('#shared-booking-history-executive').innerHTML = getBookingHistoryHTML('exec');

// แชตในหน้าฝ่ายต้อนรับ
$('#rec-chat-form')?.addEventListener('submit', event => {
  event.preventDefault();
  const input = $('#rec-chat-input');
  const text = input?.value.trim();
  if (!text) return;

  const box = $('#rec-chat-box');
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const msg = document.createElement('div');
  msg.className = 'rec-msg staff';
  msg.innerHTML = `<p>${text}</p><small>${timeStr} · ฝ่ายต้อนรับ</small>`;
  box?.appendChild(msg);

  if (input) input.value = '';
  if (box) box.scrollTop = box.scrollHeight;
});

// ฟังก์ชันช่วยกรอกบัญชีทดสอบ
window.fillStaffDemo = function(email, password) {
  if ($('#login-email')) $('#login-email').value = email;
  if ($('#login-password')) $('#login-password').value = password;
  if ($('#login-error-msg')) $('#login-error-msg').hidden = true;
};

// เปิดระบบพนักงานและล็อกสิทธิ์เฉพาะฝ่ายนั้น
function enterStaffSystem(staffUser) {
  currentStaffSession = staffUser;

  $('#public-site-view').hidden = true;
  $('#staff-system-view').hidden = false;

  if ($('#logged-in-staff-name')) $('#logged-in-staff-name').textContent = staffUser.name;
  if ($('#logged-in-staff-role')) $('#logged-in-staff-role').textContent = staffUser.roleLabel;

  document.querySelectorAll('.staff-nav-item').forEach(btn => {
    const btnRole = btn.dataset.role;
    if (btnRole === staffUser.role) {
      btn.classList.add('active');
      btn.classList.remove('locked');
    } else {
      btn.classList.remove('active');
      btn.classList.add('locked');
    }
  });

  document.querySelectorAll('.staff-role-panel').forEach(panel => {
    panel.hidden = (panel.id !== `panel-${staffUser.role}`);
  });

  window.scrollTo(0, 0);
  toast(`ยินดีต้อนรับเข้าสู่ระบบ ${staffUser.roleLabel}`);
}

// ป้องกันการกดข้ามไปฝ่ายอื่นใน Sidebar
document.querySelectorAll('.staff-nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!currentStaffSession) return;
    const targetRole = btn.dataset.role;

    if (targetRole !== currentStaffSession.role) {
      toast(`⛔ ปฏิเสธการเข้าถึง: บัญชีของคุณมีสิทธิ์เฉพาะ "${currentStaffSession.roleLabel}" เท่านั้น`);
    }
  });
});

// ปุ่ม "กลับสู่หน้าหลัก" (รองรับทั้งปุ่มบนคอมและปุ่มบนมือถือ/ไอแพด)
function handleBackToHome() {
  currentStaffSession = null;
  $('#staff-system-view').hidden = true;
  $('#public-site-view').hidden = false;
  window.scrollTo(0, 0);
  toast('ออกจากระบบพนักงานและกลับสู่หน้าหลักแล้ว');
}

$('#btn-back-to-home')?.addEventListener('click', handleBackToHome);
$('#btn-back-to-home-mobile')?.addEventListener('click', handleBackToHome);

/* ==================== ระบบห้องพักและการค้นหา ==================== */
const rooms = [
  { id: 'standard', name: 'Standard Room', price: 1000, capacity: 2, size: '18–25', bed: 'เตียงควีนไซส์', roomNo: 'ห้อง 101', image: 'photo-1611892440504-42a792e24d32' },
  { id: 'superior', name: 'Superior Room', price: 1500, capacity: 2, size: '25–30', bed: 'เตียงคิงไซส์', roomNo: 'ห้อง 201', image: 'photo-1566665797739-1674de7a421a' },
  { id: 'deluxe', name: 'Deluxe Room', price: 2000, capacity: 2, size: '30–40', bed: 'เตียงคิงไซส์', roomNo: 'ห้อง 301', image: 'photo-1590490360182-c33d57733427' },
  { id: 'family', name: 'Family Room', price: 4500, capacity: 4, size: '35–50', bed: 'เตียงคู่สำหรับครอบครัว', roomNo: 'ห้อง 401', image: 'photo-1566073771259-6a8506099945' }
];

const money = value => value.toLocaleString('th-TH');

function renderRooms(list) {
  const roomGrid = $('#room-grid');
  const emptyState = $('#empty-state');

  if (roomGrid) {
    roomGrid.innerHTML = list.map(room => `
      <article class="room-card">
        <img class="room-photo" src="https://images.unsplash.com/${room.image}?auto=format&fit=crop&w=900&q=85" alt="${room.name}" loading="lazy">
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

  if (emptyState) emptyState.hidden = list.length > 0;
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

$('#search-form')?.addEventListener('submit', event => {
  event.preventDefault();
  const type = $('#room-type')?.value;
  const guests = Number($('#guests')?.value || 1);
  const filtered = rooms.filter(room => (type === 'all' || room.id === type) && room.capacity >= guests);
  renderRooms(filtered);
  if ($('#reset-search')) $('#reset-search').hidden = false;
  $('#rooms')?.scrollIntoView({ behavior: 'smooth' });
});

$('#reset-search')?.addEventListener('click', () => {
  renderRooms(rooms);
  if ($('#room-type')) $('#room-type').value = 'all';
  if ($('#reset-search')) $('#reset-search').hidden = true;
});

$('#empty-reset')?.addEventListener('click', () => {
  renderRooms(rooms);
  if ($('#room-type')) $('#room-type').value = 'all';
  if ($('#reset-search')) $('#reset-search').hidden = true;
});

/* ==================== Modal จองห้องพัก ==================== */
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
  if ($('#modal-breakfast-checkbox')?.checked) {
    const guests = Number($('#guests')?.value || 2);
    total += (350 * guests * nights);
  }

  if ($('#modal-total-price')) $('#modal-total-price').textContent = money(total);
}

$('#room-grid')?.addEventListener('click', event => {
  const button = event.target.closest('[data-book]');
  if (!button) return;

  const room = rooms.find(item => item.id === button.dataset.book);
  if (!room) return;
  selectedRoom = room;

  if ($('#modal-room-header-title')) $('#modal-room-header-title').textContent = room.name;
  if ($('#modal-room-name')) $('#modal-room-name').textContent = room.name;
  if ($('#modal-room-img')) $('#modal-room-img').src = `https://images.unsplash.com/${room.image}?auto=format&fit=crop&w=400&q=80`;
  if ($('#modal-room-subtext')) $('#modal-room-subtext').textContent = `${room.roomNo} ${room.size.replace('–', ' - ')}ตร.ม. 1-${room.capacity} คน`;
  if ($('#modal-room-price')) $('#modal-room-price').textContent = money(room.price);

  if ($('#modal-breakfast-checkbox')) $('#modal-breakfast-checkbox').checked = false;
  updateModalTotal();
  $('#booking-dialog')?.showModal();
});

$('#modal-breakfast-checkbox')?.addEventListener('change', updateModalTotal);
$('#modal-checkin')?.addEventListener('change', updateModalTotal);
$('#modal-checkout')?.addEventListener('change', updateModalTotal);

$('#slip-upload-input')?.addEventListener('change', event => {
  const file = event.target.files[0];
  if (file && $('#slip-file-name')) $('#slip-file-name').textContent = `สลิป: ${file.name}`;
});

$('#booking-form')?.addEventListener('submit', event => {
  event.preventDefault();
  $('#booking-dialog')?.close();
  event.target.reset();
  if ($('#slip-file-name')) $('#slip-file-name').textContent = 'อัปโหลดหลักฐานการจอง';
  toast('ส่งหลักฐานการจองสำเร็จ');
});

/* ==================== ระบบ Login ลูกค้า / พนักงาน & Register ==================== */
document.querySelectorAll('[data-login]').forEach(button => {
  button.addEventListener('click', () => {
    currentLoginMode = button.dataset.login;
    const loginTitle = $('#login-title');
    const regWrapper = $('#register-link-wrapper');
    const demoBox = $('#staff-demo-accounts');
    const errText = $('#login-error-msg');

    if (errText) errText.hidden = true;
    $('#login-form')?.reset();

    if (currentLoginMode === 'พนักงาน') {
      if (loginTitle) loginTitle.textContent = 'เข้าสู่ระบบพนักงาน';
      if (regWrapper) regWrapper.hidden = true;
      if (demoBox) demoBox.hidden = false;
    } else {
      if (loginTitle) loginTitle.textContent = 'เข้าสู่ระบบ';
      if (regWrapper) regWrapper.hidden = false;
      if (demoBox) demoBox.hidden = true;
    }

    $('#login-dialog')?.showModal();
  });
});

$('#login-form')?.addEventListener('submit', event => {
  event.preventDefault();
  const email = $('#login-email')?.value.trim().toLowerCase();
  const password = $('#login-password')?.value;
  const errText = $('#login-error-msg');

  if (currentLoginMode === 'พนักงาน') {
    const matchedStaff = staffAccounts.find(acc => acc.email === email && acc.password === password);

    if (!matchedStaff) {
      if (errText) {
        errText.textContent = 'อีเมลหรือรหัสผ่านพนักงานไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง';
        errText.hidden = false;
      }
      return;
    }

    $('#login-dialog')?.close();
    event.target.reset();
    enterStaffSystem(matchedStaff);
  } else {
    $('#login-dialog')?.close();
    event.target.reset();
    toast('เข้าสู่ระบบลูกค้าสำเร็จ');
  }
});

$('#open-register-link')?.addEventListener('click', event => {
  event.preventDefault();
  $('#login-dialog')?.close();
  $('#register-dialog')?.showModal();
});

$('#back-to-login-link')?.addEventListener('click', event => {
  event.preventDefault();
  $('#register-dialog')?.close();
  $('#login-dialog')?.showModal();
});

$('#register-form')?.addEventListener('submit', event => {
  event.preventDefault();
  $('#register-dialog')?.close();
  event.target.reset();
  toast('สมัครสมาชิกสำเร็จและเข้าสู่ระบบเรียบร้อย');
});

/* ==================== Facilities & Chat & Toast ==================== */
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
    $('#facility-dialog')?.showModal();
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

$('#chat-toggle')?.addEventListener('click', () => {
  const panel = $('#chat-panel');
  if (panel) panel.hidden = !panel.hidden;
});
$('#chat-close')?.addEventListener('click', () => { if ($('#chat-panel')) $('#chat-panel').hidden = true; });
document.querySelectorAll('[data-open-chat]').forEach(b => b.addEventListener('click', () => { if ($('#chat-panel')) $('#chat-panel').hidden = false; }));

$('#chat-form')?.addEventListener('submit', event => {
  event.preventDefault();
  const input = $('#chat-input');
  const text = input?.value.trim();
  if (!text) return;

  const box = $('#chat-messages');
  const guestMsg = document.createElement('p');
  guestMsg.className = 'message guest';
  guestMsg.textContent = text;
  box?.appendChild(guestMsg);
  if (input) input.value = '';

  setTimeout(() => {
    const reply = document.createElement('p');
    reply.className = 'message staff';
    reply.textContent = 'รับทราบข้อความค่ะ เจ้าหน้าที่ฝ่ายต้อนรับกำลังตรวจสอบข้อมูลให้สักครู่นะคะ 🙏';
    box?.appendChild(reply);
    if (box) box.scrollTop = box.scrollHeight;
  }, 600);
});

let toastTimer;
function toast(message) {
  const toastEl = $('#toast');
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 4500);
}

document.querySelectorAll('[data-close]').forEach(button => {
  button.addEventListener('click', () => button.closest('dialog')?.close());
});