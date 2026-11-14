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
  { email: 'exec@tkc.com', password: '12345678', role: 'executive', roleLabel: 'ฝ่ายบริหาร', name: 'คุณอรทัย พ. (ฝ่ายบริหาร)' },
  // bykoraphat: บัญชีแม่บ้านสำหรับทดลอง
  { email: 'housekeeping@tkc.com', password: '12345678', role: 'housekeeping', roleLabel: 'แม่บ้าน', name: 'คุณมะลิ (แม่บ้าน)' }
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

  refreshStaffDemo(staffUser.role);
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

// bykoraphat: อัตราอาหารเช้าต่อห้องต่อวันตามประเภทห้อง
const breakfastRate = room => room.id === 'family' ? 500 : 350;
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
          <p class="details">ขนาดห้อง ${room.size} ตร.ม.<br>อาหารเช้า ${money(breakfastRate(room))} บาท / ห้อง / วัน</p>
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

// bykoraphat: ใช้วันค้นหาชุดเดียวกันในใบจองและตรวจช่วงวันที่
const today = localDate(new Date());
const searchIn = $('#checkin');
const searchOut = $('#checkout');
const modalIn = $('#modal-checkin');
const modalOut = $('#modal-checkout');
const bookingForm = $('#booking-form');
const bookingsButton = $('#my-bookings-button');
const bookingError = $('#booking-error');
const slipInput = $('#slip-upload-input');
const breakfastToggle = $('#modal-breakfast-checkbox');
const breakfastOptions = $('#breakfast-date-options');
const selectedRooms = $('#selected-rooms');
const bookingDate = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short' });
let customerEmail = '';
let pendingRoom = null;
let bookingRooms = [];
let nextBookingId = 1;
const demoBookings = new Map();

function syncDates(checkIn, checkOut) {
  checkIn.min = today;
  checkOut.min = addDay(checkIn.value >= today ? checkIn.value : today);
  checkOut.setCustomValidity(
    checkOut.value && checkOut.value < checkOut.min ? 'วันเช็กเอาต์ต้องอยู่หลังวันเช็กอิน' : ''
  );
}

function validStay(checkIn, checkOut) {
  return Boolean(checkIn && checkOut && checkIn >= today && checkOut > checkIn);
}

for (const [checkIn, checkOut] of [[searchIn, searchOut], [modalIn, modalOut]]) {
  syncDates(checkIn, checkOut);
  for (const field of [checkIn, checkOut]) {
    field.addEventListener('input', () => syncDates(checkIn, checkOut));
  }
}

$('#search-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!validStay(searchIn.value, searchOut.value)) return;
  const type = $('#room-type').value;
  const guests = Number($('#guests').value);
  const filtered = rooms.filter(room => (type === 'all' || room.id === type) && room.capacity >= guests);
  renderRooms(filtered);
  $('#results-status').textContent = 'ผลตามประเภทและความจุ โหมดทดลองยังไม่ตรวจห้องว่างจริง';
  $('#reset-search').hidden = false;
  $('#rooms').scrollIntoView({ behavior: 'smooth' });
});

function resetRoomSearch() {
  renderRooms(rooms);
  $('#room-type').value = 'all';
  $('#results-status').textContent = '';
  $('#reset-search').hidden = true;
}

$('#reset-search').addEventListener('click', resetRoomSearch);
$('#empty-reset').addEventListener('click', resetRoomSearch);

// bykoraphat: ห้องแต่ละแถวมีประเภทและจำนวนผู้พักของตัวเอง
function renderBookingRooms() {
  selectedRooms.innerHTML = bookingRooms.map(({ room, guests }, index) => `
    <div class="selected-booking-room">
      <label>ประเภทห้อง <select data-room-type="${index}" aria-label="ประเภทห้อง ${index + 1}">
        ${rooms.map(option => `<option value="${option.id}" ${option === room ? 'selected' : ''}>${option.name}</option>`).join('')}
      </select></label>
      <label>ผู้พัก <select data-room-guests="${index}" aria-label="จำนวนผู้พักห้อง ${index + 1}">
        ${Array.from({ length: room.capacity }, (_, i) => `<option value="${i + 1}" ${i + 1 === guests ? 'selected' : ''}>${i + 1} คน</option>`).join('')}
      </select></label>
      <button type="button" class="booking-outline" data-remove-room="${index}" aria-label="เอาห้อง ${index + 1} ออก" ${bookingRooms.length === 1 ? 'disabled' : ''}>เอาออก</button>
    </div>
  `).join('');
  const { room } = bookingRooms[0];
  $('#modal-room-name').textContent = room.name;
  $('#modal-room-img').src = `https://images.unsplash.com/${room.image}?auto=format&fit=crop&w=400&q=80`;
  $('#modal-room-img').alt = room.name;
  $('#modal-room-subtext').textContent = `${room.size} ตร.ม. · 1–${room.capacity} คน`;
  $('#modal-room-price').textContent = money(room.price);
  updateBookingTotal();
}

selectedRooms.addEventListener('change', event => {
  const { roomType, roomGuests } = event.target.dataset;
  if (roomType !== undefined) {
    const entry = bookingRooms[Number(roomType)];
    entry.room = rooms.find(room => room.id === event.target.value);
    entry.guests = Math.min(entry.guests, entry.room.capacity);
    renderBookingRooms();
    selectedRooms.querySelector(`[data-room-type="${roomType}"]`).focus();
  } else if (roomGuests !== undefined) {
    bookingRooms[Number(roomGuests)].guests = Number(event.target.value);
  }
});

selectedRooms.addEventListener('click', event => {
  const button = event.target.closest('[data-remove-room]');
  if (!button || bookingRooms.length <= 1) return;
  bookingRooms.splice(Number(button.dataset.removeRoom), 1);
  renderBookingRooms();
  $('#add-booking-room').focus();
});

$('#add-booking-room').addEventListener('click', () => {
  bookingRooms.push({ room: rooms[0], guests: 1 });
  renderBookingRooms();
  selectedRooms.querySelector(`[data-room-type="${bookingRooms.length - 1}"]`).focus();
});

// bykoraphat: อาหารเช้าคิดตามห้องและวันที่เลือก มัดจำคิดตามจำนวนห้อง
function renderBreakfastDates() {
  const previouslySelected = new Set(
    Array.from(breakfastOptions.querySelectorAll('input:checked'), input => input.value)
  );
  const days = [];
  if (validStay(modalIn.value, modalOut.value)) {
    for (let day = addDay(modalIn.value); day <= modalOut.value; day = addDay(day)) {
      days.push(`<label><input type="checkbox" value="${day}" ${previouslySelected.has(day) ? 'checked' : ''}>
        ${bookingDate.format(parseDate(day))}</label>`);
    }
  }
  breakfastOptions.innerHTML = days.join('');
  $('#breakfast-dates').hidden = !breakfastToggle.checked || days.length === 0;
}

function bookingAmounts() {
  const nights = validStay(modalIn.value, modalOut.value)
    ? Math.round((parseDate(modalOut.value) - parseDate(modalIn.value)) / 86400000)
    : 0;
  const breakfastDays = breakfastToggle.checked ? breakfastOptions.querySelectorAll('input:checked').length : 0;
  const roomTotal = bookingRooms.reduce((sum, { room }) => sum + room.price * nights, 0);
  const breakfastTotal = bookingRooms.reduce((sum, { room }) => sum + breakfastRate(room) * breakfastDays, 0);
  const total = roomTotal + breakfastTotal;
  const depositPercent = bookingRooms.length === 1 ? 20 : 40;
  const full = bookingForm.elements.payment_choice.value === 'full';
  return { roomTotal, breakfastTotal, breakfastDays, total, depositPercent, full,
    due: full ? total : Math.round(total * depositPercent) / 100 };
}

function updateBookingTotal() {
  const { roomTotal, breakfastTotal, total, depositPercent, due } = bookingAmounts();
  $('#booking-room-total').textContent = `${money(roomTotal)} บาท`;
  $('#booking-breakfast-total').textContent = `${money(breakfastTotal)} บาท`;
  $('#booking-grand-total').textContent = `${money(total)} บาท`;
  $('#deposit-label').textContent = `มัดจำ ${depositPercent}%`;
  $('#modal-total-price').textContent = money(due);
}

function openBooking(room) {
  bookingForm.reset();
  breakfastOptions.replaceChildren();
  bookingError.hidden = true;
  slipInput.setCustomValidity('');
  $('#slip-file-name').textContent = 'อัปโหลดหลักฐานการจอง';
  const datesFound = validStay(searchIn.value, searchOut.value);
  modalIn.value = datesFound ? searchIn.value : '';
  modalOut.value = datesFound ? searchOut.value : '';
  syncDates(modalIn, modalOut);
  bookingRooms = [{ room, guests: Math.min(room.capacity, Number($('#guests').value)) }];
  renderBreakfastDates();
  renderBookingRooms();
  $('#booking-dialog').showModal();
}

$('#room-grid').addEventListener('click', event => {
  const button = event.target.closest('[data-book]');
  if (!button) return;
  const room = rooms.find(item => item.id === button.dataset.book);
  if (!room) return;
  if (customerEmail) {
    openBooking(room);
  } else {
    $('[data-login="ลูกค้า"]').click();
    pendingRoom = room;
    $('#login-error-msg').textContent = 'เข้าสู่ระบบลูกค้าก่อนจองห้อง';
    $('#login-error-msg').hidden = false;
  }
});

bookingForm.addEventListener('change', event => {
  bookingError.hidden = true;
  if ([modalIn, modalOut, breakfastToggle].includes(event.target)) renderBreakfastDates();
  updateBookingTotal();
});

slipInput.addEventListener('change', () => {
  const file = slipInput.files[0];
  slipInput.setCustomValidity(file && !file.type.startsWith('image/') ? 'กรุณาเลือกไฟล์รูปภาพ' : '');
  $('#slip-file-name').textContent = file ? `สลิป: ${file.name}` : 'อัปโหลดหลักฐานการจอง';
});

// bykoraphat: เก็บใบจองและไฟล์สลิปในหน่วยความจำเพื่อทดลองตรวจสลิป
bookingForm.addEventListener('submit', event => {
  event.preventDefault();
  if (!customerEmail || !validStay(modalIn.value, modalOut.value)) return;
  const amounts = bookingAmounts();
  if (breakfastToggle.checked && !amounts.breakfastDays) {
    bookingError.textContent = 'กรุณาเลือกวันอาหารเช้าอย่างน้อยหนึ่งวัน';
    bookingError.hidden = false;
    breakfastOptions.querySelector('input')?.focus();
    return;
  }
  const bookings = demoBookings.get(customerEmail);
  bookings.unshift({
    id: nextBookingId++, rooms: bookingRooms.map(({ room, guests }) => ({ name: room.name, guests })),
    checkIn: modalIn.value, checkOut: modalOut.value, ...amounts,
    slip: slipInput.files[0], status: 'pending', reason: ''
  });
  $('#booking-dialog').close();
  bookingForm.reset();
  openMyBookings();
});

function startCustomerDemo(email) {
  customerEmail = email;
  if (!demoBookings.has(email)) demoBookings.set(email, []);
  bookingsButton.hidden = false;
  const room = pendingRoom;
  pendingRoom = null;
  if (room) requestAnimationFrame(() => openBooking(room));
}

// bykoraphat: ฝั่งลูกค้าเห็นผลตรวจและส่งสลิปใหม่จากใบจองเดิม
const paymentStatuses = {
  pending: { label: 'รอตรวจสลิป', color: 'yellow' },
  approved: { label: 'ยืนยันแล้ว', color: 'green' },
  rejected: { label: 'ต้องส่งสลิปใหม่', color: 'red-soft' }
};
const bookingCode = booking => `BKG-${String(booking.id).padStart(4, '0')}`;
const myBookingsList = $('#my-bookings-list');

function renderMyBookings() {
  const bookings = demoBookings.get(customerEmail);
  myBookingsList.innerHTML = bookings.length ? bookings.map(booking => {
    const status = paymentStatuses[booking.status];
    const paid = booking.status === 'approved' ? booking.due : 0;
    return `
      <article class="customer-booking-card">
        <div class="customer-booking-heading">
          <strong>ใบจอง ${bookingCode(booking)}</strong>
          <span class="status-badge ${status.color}">${status.label}</span>
        </div>
        <p>${bookingDate.format(parseDate(booking.checkIn))} – ${bookingDate.format(parseDate(booking.checkOut))}</p>
        <ul>${booking.rooms.map(room => `<li>${room.name} · ${room.guests} คน</li>`).join('')}</ul>
        <dl class="booking-amounts">
          <div><dt>ยอดรวม</dt><dd>${money(booking.total)} บาท</dd></div>
          <div><dt>ยอดตามสลิป ${booking.full ? 'ชำระเต็ม' : 'มัดจำ'}</dt><dd>${money(booking.due)} บาท</dd></div>
          <div><dt>ยอดที่อนุมัติแล้ว</dt><dd>${money(paid)} บาท</dd></div>
          <div><dt>ยอดคงเหลือ</dt><dd>${money(booking.total - paid)} บาท</dd></div>
        </dl>
        ${booking.status === 'rejected' ? `
          <p class="payment-reason" data-reason-for="${booking.id}"></p>
          <form class="slip-resubmit login-form-body" data-resubmit-booking="${booking.id}">
            <label class="login-input-group">แนบสลิปใหม่<input type="file" name="slip" accept="image/*" required></label>
            <button type="submit" class="booking-outline">ส่งสลิปใหม่</button>
          </form>` : ''}
      </article>`;
  }).join('') : '<p>ยังไม่มีรายการจอง</p>';

  for (const booking of bookings) {
    const reason = myBookingsList.querySelector(`[data-reason-for="${booking.id}"]`);
    if (reason) reason.textContent = `เหตุผลที่ขอให้ส่งใหม่ · ${booking.reason}`;
  }
}

function openMyBookings() {
  if (!customerEmail) return;
  renderMyBookings();
  $('#my-bookings-dialog').showModal();
}

myBookingsList.addEventListener('submit', event => {
  event.preventDefault();
  const booking = demoBookings.get(customerEmail)?.find(item => item.id === Number(event.target.dataset.resubmitBooking));
  if (booking?.status !== 'rejected') return;
  const input = event.target.elements.slip;
  const file = input.files[0];
  if (!file?.type.startsWith('image/')) {
    toast('กรุณาเลือกสลิปที่เป็นไฟล์รูปภาพ');
    input.focus();
    return;
  }
  Object.assign(booking, { slip: file, status: 'pending', reason: '' });
  renderMyBookings();
  toast('ส่งสลิปใหม่แล้ว รอฝ่ายบัญชีตรวจสอบ');
});

bookingsButton.addEventListener('click', openMyBookings);
$('#customer-sign-out').addEventListener('click', () => {
  customerEmail = '';
  pendingRoom = null;
  bookingsButton.hidden = true;
  $('#my-bookings-dialog').close();
  $('[data-login="ลูกค้า"]').focus();
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
    // bykoraphat: เซสชันลูกค้าสำหรับทดลองหน้าบ้าน
    startCustomerDemo(email);
    toast('เข้าสู่ระบบลูกค้าในโหมดทดลอง');
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

// bykoraphat: ตรวจรหัสผ่านซ้ำก่อนจบขั้นตอนสมัครทดลอง
const registerPasswordError = $('#register-password-error');
$('#register-form')?.addEventListener('input', () => {
  registerPasswordError.hidden = true;
  $('#reg-confirm-password').removeAttribute('aria-invalid');
});
$('#register-form')?.addEventListener('reset', () => {
  registerPasswordError.hidden = true;
  $('#reg-confirm-password').removeAttribute('aria-invalid');
});
$('#register-form')?.addEventListener('submit', event => {
  event.preventDefault();
  const confirmation = $('#reg-confirm-password');
  if ($('#reg-password').value !== confirmation.value) {
    registerPasswordError.textContent = 'รหัสผ่านทั้งสองช่องไม่ตรงกัน';
    registerPasswordError.hidden = false;
    confirmation.setAttribute('aria-invalid', 'true');
    confirmation.focus();
    return;
  }
  startCustomerDemo($('#reg-email').value.trim().toLowerCase());
  $('#register-dialog').close();
  event.target.reset();
  toast('ผ่านการตรวจฟอร์มสมัครในโหมดทดลอง');
});

/* ==================== Facilities & Chat & Toast ==================== */
// bykoraphat: ใช้การ์ดเดิมกับฟอร์มตรวจรายการสองขั้น
let activeFacilityBtn = null;
const facilityForm = $('#facility-form');
const facilityReview = $('#facility-review');
const facilityRounds = {
  fitness: ['07:00', '09:00', '12:00', '15:00', '18:00', '20:30'],
  sauna: ['07:00', '12:00', '17:30', '18:30', '19:30', '20:30'],
  sunset: ['18:00'],
  market: ['18:00', '19:00']
};

document.querySelectorAll('[data-facility]').forEach(button => {
  button.addEventListener('click', () => {
    if (button.classList.contains('booked')) {
      button.classList.remove('booked');
      button.textContent = 'จอง';
      toast('ยกเลิกการจองบริการทดลองแล้ว');
      return;
    }
    activeFacilityBtn = button;
    facilityForm.reset();
    facilityForm.hidden = false;
    facilityReview.hidden = true;
    facilityForm.elements.date.min = localDate(new Date());
    $('#facility-title').textContent = `จอง${button.closest('.facility-card').querySelector('h3').textContent}`;
    facilityForm.elements.time.replaceChildren(
      new Option('เลือกรอบเวลา', ''),
      ...facilityRounds[button.dataset.facility].map(time => new Option(`${time} น.`, time))
    );
    facilityForm.elements.time.value = '';
    $('#facility-dialog').showModal();
  });
});

facilityForm.addEventListener('submit', event => {
  event.preventDefault();
  const selected = new FormData(facilityForm);
  facilityReview.querySelector('[data-facility-review="service"]').textContent =
    activeFacilityBtn.closest('.facility-card').querySelector('h3').textContent;
  facilityReview.querySelector('[data-facility-review="date"]').textContent =
    bookingDate.format(parseDate(selected.get('date')));
  facilityReview.querySelector('[data-facility-review="time"]').textContent = `${selected.get('time')} น.`;
  facilityReview.querySelector('[data-facility-review="guests"]').textContent = `${selected.get('guests')} คน`;
  facilityForm.hidden = true;
  facilityReview.hidden = false;
  $('#edit-facility').focus();
});

$('#edit-facility').addEventListener('click', () => {
  facilityReview.hidden = true;
  facilityForm.hidden = false;
  facilityForm.elements.date.focus();
});

$('#confirm-facility').addEventListener('click', () => {
  activeFacilityBtn.classList.add('booked');
  activeFacilityBtn.textContent = 'จองแล้ว • ยกเลิก';
  $('#facility-dialog').close();
  toast('ยืนยันการจองบริการทดลองแล้ว');
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
// bykoraphat: สลิปจากหน้าใบจองและผลตรวจใช้ข้อมูลทดลองชุดเดียวกัน
const accountingPayments = $('#accounting-payments');
const paymentDialog = $('#payment-review-dialog');
const paymentImage = $('#payment-review-image');
let reviewingPayment = null;
let paymentImageUrl = null;
const samplePayment = { code: 'PAY-68021', due: 750, status: 'pending' };

function renderAccountingPayments() {
  accountingPayments.querySelectorAll('[data-demo-payment-row]').forEach(row => row.remove());
  for (const [email, bookings] of demoBookings) {
    for (const booking of bookings) {
      const row = accountingPayments.insertRow(0);
      row.dataset.demoPaymentRow = '';
      [`PAY-${booking.id}`, bookingCode(booking), email, booking.full ? 'ชำระเต็มจำนวน' : 'มัดจำ', `฿${money(booking.due)}`]
        .forEach(value => { row.insertCell().textContent = value; });
      const status = paymentStatuses[booking.status];
      const cell = row.insertCell();
      const badge = document.createElement(booking.status === 'pending' ? 'button' : 'span');
      badge.className = `status-badge ${status.color}`;
      badge.textContent = status.label;
      if (booking.status === 'pending') {
        badge.type = 'button';
        badge.dataset.reviewBooking = booking.id;
        badge.setAttribute('aria-label', `เปิดดูสลิป ${bookingCode(booking)}`);
      }
      cell.append(badge);
    }
  }

  const sample = accountingPayments.querySelector('[data-review-sample]');
  if (sample) {
    const status = paymentStatuses[samplePayment.status];
    sample.className = `status-badge ${status.color}`;
    sample.textContent = samplePayment.status === 'pending' ? 'เปิดดูสลิป' : status.label;
    sample.disabled = samplePayment.status !== 'pending';
  }
}

accountingPayments.addEventListener('click', event => {
  if (currentStaffSession?.role !== 'accounting') return;
  const button = event.target.closest('[data-review-booking], [data-review-sample]');
  if (!button) return;
  reviewingPayment = button.hasAttribute('data-review-sample') ? samplePayment :
    Array.from(demoBookings.values()).flat().find(booking => booking.id === Number(button.dataset.reviewBooking));
  if (reviewingPayment?.status !== 'pending') return;
  const { slip, due, code } = reviewingPayment;
  $('#payment-review-summary').textContent = `${code || bookingCode(reviewingPayment)} · ฿${money(due)}`;
  $('#sample-slip-note').hidden = Boolean(slip);
  if (slip) {
    paymentImageUrl = URL.createObjectURL(slip);
    paymentImage.src = paymentImageUrl;
  }
  paymentImage.hidden = !slip;
  $('#reject-slip-form').reset();
  paymentDialog.showModal();
});

paymentDialog.addEventListener('close', () => {
  paymentImage.removeAttribute('src');
  if (paymentImageUrl) URL.revokeObjectURL(paymentImageUrl);
  paymentImageUrl = null;
  reviewingPayment = null;
});

function savePaymentReview(status, reason = '') {
  if (currentStaffSession?.role !== 'accounting' || reviewingPayment?.status !== 'pending') return;
  Object.assign(reviewingPayment, { status, reason });
  paymentDialog.close();
  renderAccountingPayments();
  toast(status === 'approved' ? 'อนุมัติสลิปแล้ว' : 'บันทึกผลให้ส่งสลิปใหม่แล้ว');
}

$('#approve-slip').addEventListener('click', () => savePaymentReview('approved'));
$('#reject-slip-form').addEventListener('submit', event => {
  event.preventDefault();
  const input = event.target.elements.reason;
  const reason = input.value.trim();
  if (reason) savePaymentReview('rejected', reason);
  else {
    toast('กรุณาระบุเหตุผลที่ขอให้ส่งสลิปใหม่');
    input.focus();
  }
});

// bykoraphat: Super Admin เพิ่มบัญชีชั่วคราวและกำหนดสิทธิ์ตามฝ่าย
const staffAccountForm = $('#staff-account-form');
const staffAccessList = $('#staff-access-list');
const staffRoleLabels = { reception: 'ฝ่ายต้อนรับ', accounting: 'ฝ่ายบัญชี', housekeeping: 'แม่บ้าน' };
let editingStaffEmail = null;

function renderStaffAccess() {
  staffAccessList.replaceChildren();
  for (const account of staffAccounts) {
    const row = staffAccessList.insertRow();
    [account.name, account.department || account.roleLabel, account.roleLabel]
      .forEach(value => { row.insertCell().textContent = value; });
    const cell = row.insertCell();
    if (staffRoleLabels[account.role]) {
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'link-edit';
      edit.dataset.staffEmail = account.email;
      edit.textContent = 'แก้ไขสิทธิ์';
      cell.append(edit);
    } else {
      cell.textContent = 'Super Admin แก้ไขไม่ได้';
    }
  }
}

function openStaffAccount(account) {
  if (currentStaffSession?.role !== 'superadmin') return;
  staffAccountForm.reset();
  editingStaffEmail = account?.email || null;
  $('#staff-account-error').hidden = true;
  $('#staff-account-title').textContent = editingStaffEmail ? 'แก้ไขสิทธิ์พนักงาน' : 'เพิ่มพนักงาน';
  const { name, email, department, role, password } = staffAccountForm.elements;
  email.readOnly = Boolean(editingStaffEmail);
  password.required = !editingStaffEmail;
  password.disabled = Boolean(editingStaffEmail);
  $('#staff-temp-password').hidden = Boolean(editingStaffEmail);
  if (account) {
    name.value = account.name;
    email.value = account.email;
    department.value = account.department || account.roleLabel;
    role.value = account.role;
  }
  $('#staff-account-dialog').showModal();
}

$('#add-staff').addEventListener('click', () => openStaffAccount());
staffAccessList.addEventListener('click', event => {
  const button = event.target.closest('[data-staff-email]');
  if (!button) return;
  const account = staffAccounts.find(item => item.email === button.dataset.staffEmail);
  if (account && staffRoleLabels[account.role]) openStaffAccount(account);
});

staffAccountForm.addEventListener('submit', event => {
  event.preventDefault();
  if (currentStaffSession?.role !== 'superadmin') return;
  const data = new FormData(staffAccountForm);
  const email = data.get('email').trim().toLowerCase();
  const account = {
    name: data.get('name').trim(), department: data.get('department').trim(), role: data.get('role'),
    roleLabel: staffRoleLabels[data.get('role')]
  };
  const existing = staffAccounts.find(item => item.email === email);
  const error = $('#staff-account-error');
  if (!account.name || !account.department || !account.roleLabel || (existing && existing.email !== editingStaffEmail)) {
    error.textContent = existing && existing.email !== editingStaffEmail
      ? 'อีเมลนี้มีบัญชีทดลองแล้ว' : 'กรุณาระบุชื่อ แผนก และสิทธิ์เข้าใช้งาน';
    error.hidden = false;
    return;
  }
  if (editingStaffEmail) {
    if (!existing || !staffRoleLabels[existing.role]) return;
    Object.assign(existing, account);
  } else staffAccounts.push({ ...account, email, password: data.get('password') });
  $('#staff-account-dialog').close();
  renderStaffAccess();
  toast('บันทึกบัญชีพนักงานทดลองแล้ว');
});

// bykoraphat: ใช้สถานะห้องชุดเดียวกันสำหรับต้อนรับ แม่บ้าน และฝ่ายบริหาร
const receptionRoomList = $('#reception-room-list');
const cleaningQueue = $('#cleaning-queue');
const repairRoomList = $('#repair-room-list');
const roomStates = {
  available: 'ว่าง',
  booked: 'จองแล้ว',
  occupied: 'มีผู้เข้าพัก',
  queued: 'รอทำความสะอาด',
  cleaning: 'กำลังทำความสะอาด',
  repair: 'ปิดปรับปรุง'
};
const staffRooms = new Map(Array.from(receptionRoomList.rows, row => {
  const code = row.dataset.roomCode;
  const state = Object.keys(roomStates).find(key => roomStates[key] === row.querySelector('select').value);
  return [code, { code, row, state, type: row.cells[2].textContent.trim() }];
}));

function renderReceptionRooms() {
  for (const room of staffRooms.values()) {
    const select = room.row.querySelector('select');
    const options = room.state === 'repair' || room.state === 'cleaning'
      ? [room.state] : ['available', 'booked', 'occupied', 'queued'];
    select.removeAttribute('onchange');
    select.dataset.changeRoom = room.code;
    select.setAttribute('aria-label', `สถานะห้อง ${room.code}`);
    select.replaceChildren(...options.map(key => new Option(roomStates[key], key)));
    select.value = room.state;
    select.disabled = options.length === 1;

    const actions = room.row.cells[4];
    if (room.state === 'occupied' || room.state === 'booked') {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'link-edit';
      button.dataset.roomAction = room.code;
      button.textContent = room.state === 'occupied' ? 'เช็คเอาท์' : 'เช็คอิน';
      actions.replaceChildren(button);
    } else actions.textContent = {
      available: 'พร้อมรับจอง', repair: 'ฝ่ายบริหารดูแล', queued: 'ส่งเข้าคิวแม่บ้าน', cleaning: 'แม่บ้านกำลังทำความสะอาด'
    }[room.state];

    if (!['occupied', 'booked'].includes(room.state)) room.row.cells[1].textContent = '—';
  }
  const counts = { available: 0, booked: 0, occupied: 0, queued: 0, repair: 0 };
  for (const room of staffRooms.values()) counts[room.state === 'cleaning' ? 'queued' : room.state]++;
  $('#reception-room-counts').querySelectorAll('strong').forEach((count, index) => {
    count.textContent = Object.values(counts)[index];
  });
  $('#cleaning-room-count').textContent = `${counts.queued} ห้อง`;
}

receptionRoomList.addEventListener('change', event => {
  if (currentStaffSession?.role !== 'reception') return;
  const room = staffRooms.get(event.target.dataset.changeRoom);
  if (!room || event.target.disabled) return;
  room.state = event.target.value;
  renderReceptionRooms();
  room.row.querySelector('select').focus();
  toast(`อัปเดตสถานะห้อง ${room.code} แล้ว`);
});

receptionRoomList.addEventListener('click', event => {
  if (currentStaffSession?.role !== 'reception') return;
  const room = staffRooms.get(event.target.closest('[data-room-action]')?.dataset.roomAction);
  if (!room) return;
  const checkout = room.state === 'occupied';
  room.state = checkout ? 'queued' : 'occupied';
  room.cleanedAt = null;
  renderReceptionRooms();
  toast(checkout ? `ส่งห้อง ${room.code} เข้าคิวแม่บ้านแล้ว` : `เช็คอินห้อง ${room.code} แล้ว`);
});

function renderCleaningQueue() {
  const queue = Array.from(staffRooms.values()).filter(room => ['queued', 'cleaning'].includes(room.state));
  cleaningQueue.innerHTML = queue.length ? queue.map(room => `
    <div class="housekeeping-item staff-room-row">
      <div><strong>ห้อง ${room.code}</strong><small>${room.type} · ${roomStates[room.state]}</small></div>
      <div class="staff-actions">
        <button type="button" class="btn-dark-pill" data-clean-room="${room.code}">${room.state === 'queued' ? 'เริ่มทำความสะอาด' : 'ยืนยันว่าทำเสร็จ'}</button>
        <button type="button" class="booking-outline" data-damage-room="${room.code}">แจ้งความเสียหาย</button>
      </div>
    </div>`).join('') : '<p class="demo-note">ยังไม่มีห้องในคิว เมื่อฝ่ายต้อนรับกดเช็คเอาท์ ห้องจะแสดงที่นี่</p>';
}

cleaningQueue.addEventListener('click', event => {
  if (currentStaffSession?.role !== 'housekeeping') return;
  const button = event.target.closest('button');
  if (!button) return;
  const room = staffRooms.get(button.dataset.cleanRoom || button.dataset.damageRoom);
  if (!room) return;
  if (button.dataset.damageRoom) {
    openRoomDamage(room);
    return;
  }
  if (!['queued', 'cleaning'].includes(room.state)) return;
  room.state = room.state === 'queued' ? 'cleaning' : 'available';
  if (room.state === 'available') room.cleanedAt = new Date();
  renderCleaningQueue();
  cleaningQueue.querySelector(`[data-clean-room="${room.code}"]`)?.focus();
  toast(room.state === 'available' ? `ห้อง ${room.code} ทำความสะอาดเสร็จแล้ว` : `เริ่มทำความสะอาดห้อง ${room.code}`);
});

function renderRepairRooms() {
  repairRoomList.innerHTML = Array.from(staffRooms.values()).map(room => `
    <div class="housekeeping-item staff-room-row">
      <div><strong>ห้อง ${room.code}</strong><small>${room.type} · ${roomStates[room.state]}</small></div>
      ${['available', 'queued', 'repair'].includes(room.state) ? `
        <button type="button" class="booking-outline" data-repair-room="${room.code}">
          ${room.state === 'repair' ? 'เปิดห้องอีกครั้ง' : 'ปิดห้องเพื่อซ่อม'}
        </button>` : ''}
    </div>`).join('');
  appendDamageReports($('#executive-damage-list'));
}

repairRoomList.addEventListener('click', event => {
  if (currentStaffSession?.role !== 'executive') return;
  const room = staffRooms.get(event.target.closest('[data-repair-room]')?.dataset.repairRoom);
  if (!room || !['available', 'queued', 'repair'].includes(room.state)) return;
  if (room.state === 'repair') room.state = room.beforeRepair || 'available';
  else {
    room.beforeRepair = room.state;
    room.state = 'repair';
  }
  renderRepairRooms();
  repairRoomList.querySelector(`[data-repair-room="${room.code}"]`)?.focus();
  toast(`ห้อง ${room.code} · ${roomStates[room.state]}`);
});

// bykoraphat: เก็บรายงานล่าสุดและรูปหนึ่งรูปต่อห้องในโหมดทดลอง
const damageDialog = $('#room-damage-dialog');
const damageForm = $('#room-damage-form');
const damagePreview = $('#room-damage-preview');
const damageReports = new Map();
let damageRoom = null;
let damageDraftUrl = null;

function openRoomDamage(room) {
  if (currentStaffSession?.role !== 'housekeeping') return;
  damageRoom = room;
  damageForm.reset();
  $('#room-damage-heading').textContent = `ห้อง ${room.code} · ${room.type}`;
  $('#room-damage-filename').textContent = 'ยังไม่มีรูปแนบ';
  damageDialog.showModal();
}

$('#choose-damage-room').addEventListener('submit', event => {
  event.preventDefault();
  const room = staffRooms.get(event.target.elements.room.value);
  if (room) openRoomDamage(room);
});

for (const [buttonId, fileId] of [
  ['#room-damage-camera', '#damage-camera-file'],
  ['#room-damage-gallery', '#damage-gallery-file']
]) {
  const input = $(fileId);
  $(buttonId).addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    input.value = '';
    if (!file.type.startsWith('image/')) {
      toast('กรุณาเลือกรูปภาพ');
      return;
    }
    if (damageDraftUrl) URL.revokeObjectURL(damageDraftUrl);
    damageDraftUrl = URL.createObjectURL(file);
    damagePreview.src = damageDraftUrl;
    damagePreview.hidden = false;
    $('#room-damage-filename').textContent = file.name;
  });
}

damageDialog.addEventListener('close', () => {
  if (damageDraftUrl) URL.revokeObjectURL(damageDraftUrl);
  damageDraftUrl = null;
  damagePreview.removeAttribute('src');
  damagePreview.hidden = true;
  damageRoom = null;
});

function appendDamageReports(target) {
  target.replaceChildren();
  for (const [code, report] of damageReports) {
    const details = document.createElement('details');
    details.className = 'staff-damage-report';
    const title = document.createElement('summary');
    title.textContent = `ห้อง ${code} · ${report.item}`;
    const description = document.createElement('p');
    description.textContent = report.description;
    const byline = document.createElement('p');
    byline.className = 'demo-note';
    byline.textContent = `${report.reporter} · ${report.reportedAt.toLocaleString('th-TH')}`;
    details.append(title, description, byline);
    if (report.photoUrl) {
      const image = document.createElement('img');
      image.className = 'staff-photo';
      image.src = report.photoUrl;
      image.alt = `ภาพความเสียหายห้อง ${code}`;
      details.append(image);
    }
    target.append(details);
  }
}

damageForm.addEventListener('submit', event => {
  event.preventDefault();
  if (currentStaffSession?.role !== 'housekeeping' || !damageRoom) return;
  const item = damageForm.elements.item.value.trim();
  const description = damageForm.elements.description.value.trim();
  if (!item || !description) {
    toast('กรุณาระบุสิ่งที่เสียหายและลักษณะความเสียหาย');
    damageForm.elements[!item ? 'item' : 'description'].focus();
    return;
  }
  const previous = damageReports.get(damageRoom.code);
  if (previous?.photoUrl) URL.revokeObjectURL(previous.photoUrl);
  damageReports.set(damageRoom.code, {
    item, description, photoUrl: damageDraftUrl,
    reporter: currentStaffSession.name, reportedAt: new Date()
  });
  damageDraftUrl = null;
  damageDialog.close();
  appendDamageReports($('#housekeeping-damage-list'));
  toast('ส่งรายงานความเสียหายแล้ว');
});

function refreshStaffDemo(role) {
  if (role === 'superadmin') renderStaffAccess();
  if (role === 'accounting') renderAccountingPayments();
  if (role === 'executive') renderRepairRooms();
  if (role === 'reception') {
    renderReceptionRooms();
    appendDamageReports($('#reception-damage-list'));
    $('#reception-cleaning-list').textContent = Array.from(staffRooms.values())
      .filter(room => room.cleanedAt).map(room => `ห้อง ${room.code} ทำความสะอาดเสร็จแล้ว`).join(' · ');
  }
  if (role === 'housekeeping') {
    renderCleaningQueue();
    appendDamageReports($('#housekeeping-damage-list'));
  }
}

$('#damage-room-choice').append(...Array.from(staffRooms.values(), room => new Option(`ห้อง ${room.code} · ${room.type}`, room.code)));
