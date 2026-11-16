'use strict';

const $ = selector => document.querySelector(selector);

async function apiFetch(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(typeof options.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    }
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(body?.message || 'ไม่สามารถเชื่อมต่อระบบได้');
    error.status = response.status;
    error.code = body?.code;
    error.details = body?.details;
    throw error;
  }
  return body;
}
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

/* ==================== สิทธิ์พนักงาน (Role-Based Access) ==================== */
const staffRoleLabels = {
  superadmin: 'Super Admin',
  reception: 'ฝ่ายต้อนรับ',
  accounting: 'ฝ่ายบัญชี',
  housekeeping: 'แม่บ้าน',
  executive: 'ฝ่ายบริหาร'
};

let currentStaffSession = null;
let currentLoginMode = 'ลูกค้า';

const staffBookingTargets = {
  superadmin: { prefix: 'sa', selector: '#shared-booking-history-superadmin' },
  reception: { prefix: 'rec', selector: '#shared-booking-history-reception' },
  executive: { prefix: 'exec', selector: '#shared-booking-history-executive' }
};

async function renderStaffBookingHistory(role) {
  const targetConfig = staffBookingTargets[role];
  const target = targetConfig && $(targetConfig.selector);
  if (!target) return;
  target.innerHTML = '<p>กำลังโหลดรายการจองจากฐานข้อมูล...</p>';
  try {
    const { data, meta } = await apiFetch('/api/staff/bookings?page=1&limit=50');
    const receptionTable = role === 'reception' ? $('#reception-booking-list') : null;
    if (receptionTable) {
      receptionTable.innerHTML = data.length ? data.map(booking => `
        <tr>
          <td><strong>${escapeHtml(booking.bookingCode)}</strong><small>${escapeHtml(booking.status)}</small></td>
          <td><strong>${escapeHtml(booking.customerName)}</strong><small>${escapeHtml(booking.channel)}</small></td>
          <td><strong>${escapeHtml(booking.checkIn)}</strong><small>ถึง ${escapeHtml(booking.checkOut)}</small></td>
        </tr>`).join('') : '<tr><td colspan="3">ยังไม่มีรายการจองในฐานข้อมูล</td></tr>';
    }
    target.innerHTML = `
      <div class="admin-card-header">
        <div><h3>รายการจองล่าสุด</h3><p>ข้อมูลลูกค้าและสถานะจากฐานข้อมูลจริง</p></div>
        <div class="staff-actions">
          <span class="count-pill">${meta.total} รายการ</span>
          <button type="button" class="booking-outline" data-refresh-staff-bookings="${role}">รีเฟรช</button>
        </div>
      </div>
      ${data.length ? `
        <div class="history-split-grid">
          <div class="history-list">
            ${data.map((booking, index) => `
              <button type="button" class="history-item ${index === 0 ? 'active' : ''}"
                data-staff-booking-id="${booking.id}" data-staff-booking-prefix="${targetConfig.prefix}">
                <div>
                  <strong>${escapeHtml(booking.bookingCode)}</strong>
                  <p>${escapeHtml(booking.customerName)} · ${escapeHtml(booking.channel)}</p>
                  <small>${escapeHtml(booking.checkIn)} → ${escapeHtml(booking.checkOut)}</small>
                </div>
                <span class="status-badge ${booking.status === 'CONFIRMED' ? 'green' : 'yellow'}">${escapeHtml(booking.status)}</span>
              </button>`).join('')}
          </div>
          <div class="history-detail-box" id="${targetConfig.prefix}-live-booking-detail">
            <p>กำลังโหลดรายละเอียด...</p>
          </div>
        </div>` : '<p>ยังไม่มีรายการจองในฐานข้อมูล</p>'}`;
    if (data[0]) await loadStaffBookingDetail(data[0].id, targetConfig.prefix);
  } catch (error) {
    if (role === 'reception' && $('#reception-booking-list')) {
      $('#reception-booking-list').innerHTML = `<tr><td colspan="3">${escapeHtml(error.message)}</td></tr>`;
    }
    target.innerHTML = `<p class="login-error-text">โหลดรายการจองไม่สำเร็จ: ${escapeHtml(error.message)}</p>`;
  }
}

async function loadStaffBookingDetail(bookingId, prefix) {
  const pane = $(`#${prefix}-live-booking-detail`);
  if (!pane) return;
  pane.innerHTML = '<p>กำลังโหลดรายละเอียด...</p>';
  try {
    const { data: booking } = await apiFetch(`/api/staff/bookings/${bookingId}`);
    pane.innerHTML = `
      <div class="hd-top">
        <div>
          <small class="hd-code">BOOKING RECORD · ${escapeHtml(booking.bookingCode)}</small>
          <h4>${escapeHtml(booking.customer.fullName)}</h4>
          <p>${escapeHtml(booking.customer.email || 'ไม่มีอีเมล')} · ${escapeHtml(booking.customer.phone || '')}</p>
        </div>
        <span class="status-badge ${booking.status === 'CONFIRMED' ? 'green' : 'yellow'}">${escapeHtml(booking.status)}</span>
      </div>
      <div class="hd-info-cards">
        <div class="hd-mini-card"><small>ช่องทาง</small><strong>${escapeHtml(booking.channel)}</strong></div>
        <div class="hd-mini-card"><small>Check-in</small><strong>${escapeHtml(booking.checkIn)}</strong></div>
        <div class="hd-mini-card"><small>Check-out</small><strong>${escapeHtml(booking.checkOut)}</strong></div>
      </div>
      <div class="hd-bottom-grid">
        <div>
          <h5>ห้องที่จอง</h5>
          ${(booking.rooms || []).map(room => `<div class="cost-line"><span>${escapeHtml(room.roomTypeName)} · ${room.guestCount} คน</span><strong>${room.assignedRoomCode ? escapeHtml(room.assignedRoomCode) : 'ยังไม่จัดห้อง'}</strong></div>
            ${!room.assignedRoomId && ['reception', 'superadmin'].includes(currentStaffSession?.role) && ['CONFIRMED', 'LATE_ARRIVAL'].includes(booking.status)
              ? `<button type="button" class="booking-outline" data-assign-booking="${booking.id}" data-booking-room="${room.id}" data-room-type="${room.roomTypeId}" data-booking-prefix="${prefix}">จัดห้อง</button>` : ''}`).join('') || '<p>ไม่มีข้อมูลห้อง</p>'}
          <div class="cost-total"><span>ยอดรวม</span><strong>฿${money(Number(booking.total))}</strong></div>
        </div>
        <div><h5>สถานะปัจจุบัน</h5><p>${escapeHtml(booking.status)}</p>
          ${['reception', 'superadmin'].includes(currentStaffSession?.role) ? `<div class="staff-actions">
            ${['CONFIRMED', 'LATE_ARRIVAL'].includes(booking.status) ? `<button type="button" class="btn-dark-pill" data-stay-action="check-in" data-stay-booking="${booking.id}" data-booking-prefix="${prefix}">Check-in</button><button type="button" class="booking-outline" data-stay-action="no-show" data-stay-booking="${booking.id}" data-booking-prefix="${prefix}">No-show</button>` : ''}
            ${booking.status === 'CHECKED_IN' ? `<button type="button" class="btn-dark-pill" data-stay-action="check-out" data-stay-booking="${booking.id}" data-booking-prefix="${prefix}">Check-out</button>` : ''}
          </div>` : ''}
        </div>
      </div>`;
  } catch (error) {
    pane.innerHTML = `<p class="login-error-text">โหลดรายละเอียดไม่สำเร็จ: ${escapeHtml(error.message)}</p>`;
  }
}

document.addEventListener('click', event => {
  const refresh = event.target.closest('[data-refresh-staff-bookings]');
  if (refresh) {
    renderStaffBookingHistory(refresh.dataset.refreshStaffBookings);
    return;
  }
  const booking = event.target.closest('[data-staff-booking-id]');
  if (!booking) return;
  booking.closest('.history-list')?.querySelectorAll('.history-item').forEach(item => {
    item.classList.toggle('active', item === booking);
  });
  loadStaffBookingDetail(booking.dataset.staffBookingId, booking.dataset.staffBookingPrefix);
});

document.addEventListener('click', async event => {
  const assign = event.target.closest('[data-assign-booking]');
  const stay = event.target.closest('[data-stay-action]');
  if (!assign && !stay) return;
  const button = assign || stay;
  button.disabled = true;
  try {
    if (assign) {
      const { data: rooms } = await apiFetch('/api/staff/rooms?page=1&limit=100');
      const compatible = rooms.filter(room => room.roomTypeId === Number(assign.dataset.roomType) && room.status === 'AVAILABLE');
      if (!compatible.length) throw new Error('ไม่มีห้องประเภทนี้ที่พร้อมจัด');
      const answer = window.prompt(`เลือกเลขห้อง: ${compatible.map(room => `${room.id}=${room.code}`).join(', ')}`);
      const room = compatible.find(item => item.id === Number(answer));
      if (!room) throw new Error('ไม่ได้เลือกห้องที่พร้อมใช้งาน');
      await apiFetch(`/api/staff/bookings/${assign.dataset.assignBooking}/assignments`, {
        method: 'POST',
        body: JSON.stringify({ bookingRoomId: Number(assign.dataset.bookingRoom), roomId: room.id, reason: 'จัดห้องจากหน้ารายการจอง' })
      });
      toast(`จัดห้อง ${room.code} สำเร็จ`);
      await loadStaffBookingDetail(assign.dataset.assignBooking, assign.dataset.bookingPrefix);
      return;
    }
    const action = stay.dataset.stayAction;
    const reason = action === 'no-show' ? window.prompt('ระบุเหตุผล No-show') : null;
    if (action === 'no-show' && !reason) return;
    const stayEndpoints = {
      'check-in': `/api/staff/bookings/${stay.dataset.stayBooking}/check-in`,
      'no-show': `/api/staff/bookings/${stay.dataset.stayBooking}/no-show`,
      'check-out': `/api/staff/bookings/${stay.dataset.stayBooking}/check-out`
    };
    await apiFetch(stayEndpoints[action], {
      method: 'POST', body: JSON.stringify(reason ? { reason } : {})
    });
    toast(`${action} สำเร็จ`);
    await renderStaffBookingHistory(currentStaffSession.role);
    if (action === 'check-out') await renderReceptionRoomsApi();
  } catch (error) {
    toast(error.code === 'BOOKING_BALANCE_DUE'
      ? `ยังมียอดคงเหลือ ฿${money(Number(error.details?.outstanding || 0))}` : error.message);
  } finally {
    button.disabled = false;
  }
});

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

  refreshStaffDashboard(staffUser.role);
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
async function handleBackToHome() {
  await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  currentStaffSession = null;
  $('#staff-system-view').hidden = true;
  $('#public-site-view').hidden = false;
  window.scrollTo(0, 0);
  toast('ออกจากระบบพนักงานและกลับสู่หน้าหลักแล้ว');
}

$('#btn-back-to-home')?.addEventListener('click', handleBackToHome);
$('#btn-back-to-home-mobile')?.addEventListener('click', handleBackToHome);

/* ==================== ระบบห้องพักและการค้นหา ==================== */
const roomPresentationById = {
  1: { size: '18–25', bed: 'เตียงควีนไซส์', image: 'photo-1611892440504-42a792e24d32' },
  2: { size: '30–40', bed: 'เตียงคิงไซส์', image: 'photo-1590490360182-c33d57733427' },
  3: { size: '25–30', bed: 'เตียงคิงไซส์', image: 'photo-1566665797739-1674de7a421a' },
  4: { size: '35–50', bed: 'เตียงคู่สำหรับครอบครัว', minGuests: 3, image: 'photo-1566073771259-6a8506099945' }
};
let rooms = [];

// bykoraphat: อัตราอาหารเช้าต่อห้องต่อวันตามประเภทห้อง
const breakfastRate = room => room.breakfastRate ?? 0;
const money = value => value.toLocaleString('th-TH');
const escapeHtml = value => String(value).replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
})[character]);

function renderCatalogConsumers() {
  const select = $('#room-type');
  select.innerHTML = `<option value="all">ทุกประเภทห้อง</option>${rooms
    .map(room => `<option value="${room.id}">${escapeHtml(room.name)}</option>`).join('')}`;
  const summary = $('#room-type-summary-body');
  if (summary) summary.innerHTML = rooms.map(room => `
    <tr data-room-type-id="${room.id}">
      <td><strong>${escapeHtml(room.name)}</strong><small>${escapeHtml(room.size)} ตร.ม.</small></td>
      <td>${room.minGuests ? `พักได้ ${guestRange(room)}` : `สูงสุด ${room.capacity} คน`}</td>
      <td><strong>฿${money(room.price)}</strong></td>
      <td><strong>${money(room.inventory)} ห้อง</strong><small>ภายใต้ TKC Wekes Hotel</small></td>
      <td><button type="button" class="link-edit" data-edit-room-type="${room.id}">แก้ไข</button></td>
    </tr>`).join('');
}

// bykoraphat: Family รองรับผู้เข้าพักตั้งแต่ 3 ถึง 6 คนต่อห้อง
function guestRange(room) {
  return `${room.minGuests ?? 1}–${room.capacity} คน`;
}

function clampRoomGuests(room, guests) {
  return Math.max(room.minGuests ?? 1, Math.min(room.capacity, guests));
}

function renderRooms(list) {
  const roomGrid = $('#room-grid');
  const emptyState = $('#empty-state');

  if (roomGrid) {
    roomGrid.innerHTML = list.map(room => `
      <article class="room-card">
        <img class="room-photo" src="https://images.unsplash.com/${room.image}?auto=format&fit=crop&w=900&q=85" alt="${escapeHtml(room.name)}" loading="lazy">
        <div class="room-info">
          <h3>${escapeHtml(room.name)}</h3>
          <p class="price"><strong>${money(room.price)}</strong> บาท <small>/ คืน</small></p>
          <p class="capacity">
            <svg aria-hidden="true"><use href="#person"/></svg>
            เหมาะสำหรับจำนวนผู้เข้าพัก ${guestRange(room)}
          </p>
          <p class="details">ขนาดห้อง ${room.size} ตร.ม.<br>อาหารเช้า ${money(breakfastRate(room))} บาท / ห้อง / วัน</p>
          ${room.availableRooms === undefined ? '' : `<p class="availability"><strong>ว่าง ${money(room.availableRooms)} ห้อง</strong> ในช่วงวันที่เลือก</p>`}
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

async function loadRoomCatalog() {
  const status = $('#results-status');
  renderRooms([]);
  $('#room-type-summary-body').innerHTML = '';
  status.textContent = 'กำลังโหลดประเภทห้องจากฐานข้อมูล...';
  try {
    const { data } = await apiFetch('/api/room-types');
    rooms = data.map(record => ({
      id: String(record.id),
      name: record.name,
      price: Number(record.pricePerNight),
      capacity: Number(record.capacity),
      breakfastRate: Number(record.breakfastDailyRate),
      inventory: Number(record.totalRooms),
      ...(roomPresentationById[record.id] || {
        size: 'ไม่ระบุ',
        bed: 'เตียงมาตรฐาน',
        image: 'photo-1611892440504-42a792e24d32'
      })
    }));
    renderCatalogConsumers();
    renderRooms(rooms);
    status.textContent = '';
  } catch (error) {
    rooms = [];
    renderRooms(rooms);
    status.textContent = `โหลดประเภทห้องไม่สำเร็จ: ${error.message}`;
  }
}

loadRoomCatalog();

const localDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const parseDate = value => new Date(`${value}T00:00:00`);
const addDay = value => {
  const date = parseDate(value);
  date.setDate(date.getDate() + 1);
  return localDate(date);
};
const shiftDay = (value, amount) => {
  const date = parseDate(value);
  date.setDate(date.getDate() + amount);
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
const customerProfile = $('#customer-profile');
const customerProfileToggle = $('#customer-profile-toggle');
const customerProfileMenu = $('#customer-profile-menu');
const customerLoginButton = $('#customer-login-button');
const employeeLoginButton = $('#employee-login-button');
const bookingError = $('#booking-error');
const slipInput = $('#slip-upload-input');
const breakfastToggle = $('#modal-breakfast-checkbox');
const breakfastOptions = $('#breakfast-date-options');
const selectedRooms = $('#selected-rooms');
const bookingDate = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short' });
const profileDate = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
let customerEmail = '';
let customerPrincipal = null;
let pendingRoom = null;
let bookingRooms = [];

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

$('#search-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!validStay(searchIn.value, searchOut.value)) return;
  const type = $('#room-type').value;
  const guests = Number($('#guests').value);
  const status = $('#results-status');
  status.textContent = 'กำลังตรวจสอบห้องว่าง...';
  try {
    const params = new URLSearchParams({
      checkIn: searchIn.value,
      checkOut: searchOut.value,
      guests: String(guests)
    });
    const { data } = await apiFetch(`/api/rooms/availability?${params}`);
    const filtered = data
      .map(record => {
        const room = rooms.find(item => item.id === String(record.id));
        return room ? {
          ...room,
          price: Number(record.pricePerNight),
          capacity: Number(record.capacity),
          availableRooms: Number(record.availableRooms)
        } : null;
      })
      .filter(room => room && room.availableRooms > 0 && (type === 'all' || room.id === type));
    renderRooms(filtered);
    status.textContent = filtered.length
      ? `พบห้องว่าง ${filtered.length} ประเภทจากฐานข้อมูลจริง`
      : 'ไม่พบห้องว่างตามเงื่อนไขที่เลือก';
    $('#reset-search').hidden = false;
    $('#rooms').scrollIntoView({ behavior: 'smooth' });
  } catch (error) {
    status.textContent = error.message;
  }
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
  selectedRooms.innerHTML = bookingRooms.map(({ room, guests }, index) => {
    const minimum = room.minGuests ?? 1;
    const guestOptions = Array.from({ length: room.capacity - minimum + 1 }, (_, index) => minimum + index);
    return `
    <div class="selected-booking-room">
      <label>ประเภทห้อง <select data-room-type="${index}" aria-label="ประเภทห้อง ${index + 1}">
        ${rooms.map(option => `<option value="${option.id}" ${option === room ? 'selected' : ''}>${option.name}</option>`).join('')}
      </select></label>
      <label>ผู้พัก <select data-room-guests="${index}" aria-label="จำนวนผู้พักห้อง ${index + 1}">
        ${guestOptions.map(count => `<option value="${count}" ${count === guests ? 'selected' : ''}>${count} คน</option>`).join('')}
      </select></label>
      <button type="button" class="booking-outline" data-remove-room="${index}" aria-label="เอาห้อง ${index + 1} ออก" ${bookingRooms.length === 1 ? 'disabled' : ''}>เอาออก</button>
    </div>
    `;
  }).join('');
  const { room } = bookingRooms[0];
  $('#modal-room-name').textContent = room.name;
  $('#modal-room-img').src = `https://images.unsplash.com/${room.image}?auto=format&fit=crop&w=400&q=80`;
  $('#modal-room-img').alt = room.name;
  $('#modal-room-subtext').textContent = `${room.size} ตร.ม. · ${guestRange(room)}`;
  $('#modal-room-price').textContent = money(room.price);
  updateBookingTotal();
}

selectedRooms.addEventListener('change', event => {
  const { roomType, roomGuests } = event.target.dataset;
  if (roomType !== undefined) {
    const entry = bookingRooms[Number(roomType)];
    entry.room = rooms.find(room => room.id === event.target.value);
    entry.guests = clampRoomGuests(entry.room, entry.guests);
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
  const datesFound = validStay(searchIn.value, searchOut.value);
  modalIn.value = datesFound ? searchIn.value : '';
  modalOut.value = datesFound ? searchOut.value : '';
  syncDates(modalIn, modalOut);
  bookingRooms = [{ room, guests: clampRoomGuests(room, Number($('#guests').value)) }];
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
});

// bykoraphat: สร้างใบจองจริงและให้ API คำนวณยอด/hold จากฐานข้อมูล
bookingForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!customerEmail || !validStay(modalIn.value, modalOut.value)) return;
  if (bookingRooms.some(({ room, guests }) =>
    !Number.isInteger(guests) || guests !== clampRoomGuests(room, guests)
  )) {
    bookingError.textContent = 'กรุณาเลือกจำนวนผู้พักให้ตรงกับช่วงที่ห้องรองรับ';
    bookingError.hidden = false;
    return;
  }
  const amounts = bookingAmounts();
  if (breakfastToggle.checked && !amounts.breakfastDays) {
    bookingError.textContent = 'กรุณาเลือกวันอาหารเช้าอย่างน้อยหนึ่งวัน';
    bookingError.hidden = false;
    breakfastOptions.querySelector('input')?.focus();
    return;
  }
  const submit = bookingForm.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    const breakfastDates = breakfastToggle.checked
      ? Array.from(breakfastOptions.querySelectorAll('input:checked'), input => input.value)
      : [];
    const { data } = await apiFetch('/api/bookings', {
      method: 'POST',
      body: JSON.stringify({
        checkIn: modalIn.value,
        checkOut: modalOut.value,
        rooms: bookingRooms.map(({ room, guests }) => ({
          roomTypeId: Number(room.id),
          guestCount: guests
        })),
        breakfastDates,
        promotionCodes: [],
        paymentChoice: bookingForm.elements.payment_choice.value
      })
    });
    $('#booking-dialog').close();
    bookingForm.reset();
    toast(`สร้างใบจอง ${data.bookingCode} สำเร็จ ยอดที่ต้องชำระ ฿${money(Number(data.paymentDue))}`);
    await openMyBookings();
  } catch (error) {
    bookingError.textContent = error.code === 'ROOM_INVENTORY_UNAVAILABLE'
      ? 'ห้องที่เลือกเพิ่งถูกจอง กรุณาค้นหาห้องว่างอีกครั้ง'
      : error.message;
    bookingError.hidden = false;
  } finally {
    submit.disabled = false;
  }
});

function closeCustomerProfileMenu() {
  customerProfileMenu.hidden = true;
  customerProfileToggle.setAttribute('aria-expanded', 'false');
}

function renderCustomerProfile(principal) {
  $('#profile-trigger-name').textContent = principal.fullName;
  $('#profile-full-name').textContent = principal.fullName;
  $('#profile-email').textContent = principal.email;
  $('#profile-registered-at').textContent = principal.registeredAt
    ? `สมัครเมื่อ ${profileDate.format(new Date(principal.registeredAt))}`
    : 'สมาชิก TKC';
}

function startCustomerSession(principal) {
  customerPrincipal = principal;
  customerEmail = principal.email;
  bookingsButton.hidden = false;
  customerProfile.hidden = false;
  customerLoginButton.hidden = true;
  employeeLoginButton.hidden = true;
  renderCustomerProfile(principal);
  closeCustomerProfileMenu();
  const room = pendingRoom;
  pendingRoom = null;
  if (room) requestAnimationFrame(() => openBooking(room));
}

function endCustomerSession() {
  customerPrincipal = null;
  customerEmail = '';
  pendingRoom = null;
  bookingsButton.hidden = true;
  customerProfile.hidden = true;
  customerLoginButton.hidden = false;
  employeeLoginButton.hidden = false;
  closeCustomerProfileMenu();
  if ($('#my-bookings-dialog').open) $('#my-bookings-dialog').close();
}

customerProfileToggle.addEventListener('click', () => {
  const willOpen = customerProfileMenu.hidden;
  customerProfileMenu.hidden = !willOpen;
  customerProfileToggle.setAttribute('aria-expanded', String(willOpen));
});

document.addEventListener('click', event => {
  if (!customerProfile.contains(event.target)) closeCustomerProfileMenu();
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !customerProfileMenu.hidden) {
    closeCustomerProfileMenu();
    customerProfileToggle.focus();
  }
});

// bykoraphat: ประวัติการจองโหลดจาก API และคงอยู่หลังรีเฟรช
const paymentStatuses = {
  PENDING_PAYMENT: { label: 'รอชำระเงิน', color: 'yellow' },
  EXPIRED: { label: 'หมดเวลาชำระ', color: 'red-soft' },
  PAYMENT_REVIEW: { label: 'กำลังตรวจสอบ', color: 'yellow' },
  CONFIRMED: { label: 'ยืนยันแล้ว', color: 'green' },
  LATE_ARRIVAL: { label: 'แจ้งมาถึงช้า', color: 'yellow' },
  CHECKED_IN: { label: 'เข้าพักแล้ว', color: 'green' },
  CHECKED_OUT: { label: 'เช็กเอาต์แล้ว', color: 'green' },
  CANCELLED: { label: 'ยกเลิกแล้ว', color: 'red-soft' }
};
const myBookingsList = $('#my-bookings-list');

function renderMyBookings(bookings) {
  myBookingsList.innerHTML = bookings.length ? bookings.map(booking => {
    const effectiveStatus = booking.effectiveStatus || booking.status;
    const status = paymentStatuses[effectiveStatus] || { label: effectiveStatus, color: 'yellow' };
    const checkIn = String(booking.checkIn).slice(0, 10);
    const checkOut = String(booking.checkOut).slice(0, 10);
    const hold = booking.holdExpiresAt && effectiveStatus === 'PENDING_PAYMENT'
      ? `<p><strong>กันห้องถึง:</strong> ${new Date(booking.holdExpiresAt).toLocaleString('th-TH')}</p>`
      : '';
    const retryEvent = [...booking.timeline].reverse().find(item => item.action === 'PAYMENT_RETRY_OPENED');
    const canUpload = effectiveStatus === 'PENDING_PAYMENT';
    const paymentForm = canUpload ? `
      <form class="slip-resubmit" data-payment-proof="${booking.id}"
        data-payment-operation="${retryEvent ? 'resubmit' : 'initial'}"
        data-idempotency-key="WEB-${crypto.randomUUID()}">
        ${retryEvent?.reason ? `<p class="payment-reason">เหตุผลที่ให้ส่งใหม่: ${escapeHtml(retryEvent.reason)}</p>` : ''}
        <label>${retryEvent ? 'ส่งหลักฐานการโอนใหม่' : 'แนบหลักฐานการโอน'}
          <input name="proof" type="file" accept="image/png,image/jpeg,image/webp" required>
        </label>
        <button type="submit" class="btn-dark-pill">${retryEvent ? 'ส่งตรวจอีกครั้ง' : 'ส่งหลักฐานให้บัญชีตรวจ'}</button>
        <p class="demo-note" role="status"></p>
      </form>` : '';
    const extras = [
      ...(booking.services || []).filter(item => item.status === 'SELECTED').map(item =>
        `<li><strong>${escapeHtml(item.name)}</strong> · ${item.quantity} คน · ${String(item.startTime || '').slice(0, 5)} น. · ${money(Number(item.amount))} บาท</li>`),
      ...(booking.tours || []).map(item =>
        `<li><strong>${escapeHtml(item.name)}</strong> · ${item.quantity} คน · ${escapeHtml(item.location || '')} · ${String(item.startTime).slice(0, 5)} น. · ฟรี</li>`)
    ];
    const extrasBlock = extras.length
      ? `<div class="booking-extras"><strong>บริการและทริปที่จอง</strong><ul>${extras.join('')}</ul></div>`
      : '';
    return `
      <article class="customer-booking-card">
        <div class="customer-booking-heading">
          <strong>ใบจอง ${escapeHtml(booking.bookingCode)}</strong>
          <span class="status-badge ${status.color}">${status.label}</span>
        </div>
        <p>${bookingDate.format(parseDate(checkIn))} – ${bookingDate.format(parseDate(checkOut))}</p>
        <ul>${booking.rooms.map(room => `<li>${escapeHtml(room.roomTypeName)} · ${room.guestCount} คน</li>`).join('')}</ul>
        ${extrasBlock}
        ${hold}
        <dl class="booking-amounts">
          <div><dt>ยอดรวมจากระบบ</dt><dd>${money(Number(booking.total))} บาท</dd></div>
          <div><dt>ชำระแล้ว</dt><dd>${money(Number(booking.payment.paid))} บาท</dd></div>
          <div><dt>ยอดคงเหลือ</dt><dd>${money(Number(booking.payment.outstanding))} บาท</dd></div>
        </dl>
        ${paymentForm}
        ${['PENDING_PAYMENT', 'CONFIRMED', 'LATE_ARRIVAL'].includes(booking.status)
          ? `<button type="button" class="booking-outline" data-cancel-booking="${booking.id}">ยกเลิกการจอง</button>` : ''}
        ${booking.status === 'CHECKED_OUT' && !booking.review ? `
          <form data-create-review="${booking.id}" class="login-form-body">
            <label>คะแนน<select name="rating"><option value="5">5 ดาว</option><option value="4">4 ดาว</option><option value="3">3 ดาว</option><option value="2">2 ดาว</option><option value="1">1 ดาว</option></select></label>
            <label>รีวิว<textarea name="content" maxlength="2000" required></textarea></label>
            <button type="submit" class="booking-outline">ส่งรีวิว</button>
          </form>` : ''}
      </article>`;
  }).join('') : '<p>ยังไม่มีรายการจอง</p>';
}

async function openMyBookings() {
  if (!customerEmail) return;
  if (!$('#my-bookings-dialog').open) $('#my-bookings-dialog').showModal();
  myBookingsList.innerHTML = '<p>กำลังโหลดรายการจองจากฐานข้อมูล...</p>';
  try {
    const { data } = await apiFetch('/api/bookings/mine?limit=50');
    const bookings = await Promise.all(data.map(item =>
      apiFetch(`/api/bookings/${item.id}`).then(result => result.data)
    ));
    renderMyBookings(bookings);
  } catch (error) {
    myBookingsList.innerHTML = `<p class="login-error-text">${escapeHtml(error.message)}</p>`;
  }
}

myBookingsList.addEventListener('click', async event => {
  const button = event.target.closest('[data-cancel-booking]');
  if (!button) return;
  button.disabled = true;
  try {
    await apiFetch(`/api/bookings/${button.dataset.cancelBooking}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'ลูกค้ายกเลิกผ่านหน้าเว็บไซต์' })
    });
    toast('ยกเลิกการจองแล้ว');
    await openMyBookings();
  } catch (error) {
    toast(error.message);
    button.disabled = false;
  }
});

myBookingsList.addEventListener('submit', async event => {
  const form = event.target.closest('[data-payment-proof]');
  if (!form) return;
  event.preventDefault();
  const file = form.elements.proof.files[0];
  const status = form.querySelector('[role="status"]');
  if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    status.textContent = 'กรุณาเลือกไฟล์ PNG, JPEG หรือ WebP';
    return;
  }
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  status.textContent = 'กำลังส่งหลักฐาน...';
  const body = new FormData();
  body.append('idempotencyKey', form.dataset.idempotencyKey);
  body.append('proof', file);
  const route = form.dataset.paymentOperation === 'resubmit'
    ? `/api/bookings/${form.dataset.paymentProof}/payment-proof/resubmit`
    : `/api/bookings/${form.dataset.paymentProof}/payment-proof`;
  try {
    await apiFetch(route, {
      method: 'POST', body
    });
    toast('ส่งหลักฐานเรียบร้อย รอฝ่ายบัญชีตรวจสอบ');
    await openMyBookings();
  } catch (error) {
    status.textContent = error.message;
    submit.disabled = false;
  }
});

myBookingsList.addEventListener('submit', async event => {
  const form = event.target.closest('[data-create-review]');
  if (!form) return;
  event.preventDefault();
  const submit = form.querySelector('[type="submit"]'); submit.disabled = true;
  try {
    await apiFetch(`/api/bookings/${form.dataset.createReview}/reviews`, {
      method: 'POST', body: JSON.stringify({ rating: Number(form.elements.rating.value), content: form.elements.content.value.trim() })
    });
    await Promise.all([openMyBookings(), loadPublicReviews()]);
    toast('เผยแพร่รีวิวแล้ว');
  } catch (error) { toast(error.message); submit.disabled = false; }
});

bookingsButton.addEventListener('click', openMyBookings);
async function signOutCustomer() {
  await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  endCustomerSession();
  customerLoginButton.focus();
}

$('#customer-sign-out').addEventListener('click', signOutCustomer);
$('#profile-sign-out').addEventListener('click', signOutCustomer);

$('#open-profile-edit').addEventListener('click', () => {
  closeCustomerProfileMenu();
  const form = $('#profile-edit-form');
  form.elements.full_name.value = customerPrincipal.fullName;
  form.elements.phone.value = customerPrincipal.phone;
  $('#profile-edit-email').value = customerPrincipal.email;
  $('#profile-edit-error').hidden = true;
  $('#profile-edit-dialog').showModal();
});

$('#profile-edit-form').addEventListener('submit', async event => {
  event.preventDefault();
  const errorText = $('#profile-edit-error');
  const submit = event.submitter;
  submit.disabled = true;
  try {
    const data = new FormData(event.target);
    const result = await apiFetch('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify({
        full_name: data.get('full_name'),
        phone: data.get('phone')
      })
    });
    startCustomerSession(result.data.principal);
    $('#profile-edit-dialog').close();
    toast('บันทึกข้อมูลส่วนตัวแล้ว');
  } catch (error) {
    errorText.textContent = error.message;
    errorText.hidden = false;
  } finally {
    submit.disabled = false;
  }
});

$('#open-change-password').addEventListener('click', () => {
  closeCustomerProfileMenu();
  $('#change-password-form').reset();
  $('#change-password-error').hidden = true;
  $('#change-password-dialog').showModal();
});

$('#change-password-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target;
  const errorText = $('#change-password-error');
  if (form.elements.new_password.value !== form.elements.confirm_password.value) {
    errorText.textContent = 'รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน';
    errorText.hidden = false;
    form.elements.confirm_password.focus();
    return;
  }
  const submit = event.submitter;
  submit.disabled = true;
  try {
    await apiFetch('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({
        current_password: form.elements.current_password.value,
        new_password: form.elements.new_password.value
      })
    });
    $('#change-password-dialog').close();
    form.reset();
    toast('เปลี่ยนรหัสผ่านเรียบร้อยแล้ว');
  } catch (error) {
    errorText.textContent = error.code === 'INVALID_CURRENT_PASSWORD'
      ? 'รหัสผ่านปัจจุบันไม่ถูกต้อง'
      : error.message;
    errorText.hidden = false;
  } finally {
    submit.disabled = false;
  }
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
      if (demoBox) demoBox.hidden = true;
    } else {
      if (loginTitle) loginTitle.textContent = 'เข้าสู่ระบบ';
      if (regWrapper) regWrapper.hidden = false;
      if (demoBox) demoBox.hidden = true;
    }

    $('#login-dialog')?.showModal();
  });
});

$('#login-form')?.addEventListener('submit', async event => {
  event.preventDefault();
  const email = $('#login-email')?.value.trim().toLowerCase();
  const password = $('#login-password')?.value;
  const errText = $('#login-error-msg');

  try {
    const result = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        account_type: currentLoginMode === 'พนักงาน' ? 'employee' : 'customer',
        email,
        password
      })
    });
    const principal = result.data.principal;
    $('#login-dialog')?.close();
    event.target.reset();
    if (principal.type === 'employee') enterStaffSystem(staffPrincipal(principal));
    else {
      startCustomerSession(principal);
      toast(`ยินดีต้อนรับ ${principal.fullName}`);
    }
  } catch (error) {
    errText.textContent = error.code === 'INVALID_CREDENTIALS'
      ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
      : error.message;
    errText.hidden = false;
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
$('#register-form')?.addEventListener('submit', async event => {
  event.preventDefault();
  const confirmation = $('#reg-confirm-password');
  if ($('#reg-password').value !== confirmation.value) {
    registerPasswordError.textContent = 'รหัสผ่านทั้งสองช่องไม่ตรงกัน';
    registerPasswordError.hidden = false;
    confirmation.setAttribute('aria-invalid', 'true');
    confirmation.focus();
    return;
  }
  const data = new FormData(event.target);
  try {
    const result = await apiFetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        full_name: data.get('full_name'),
        email: data.get('email'),
        phone: data.get('phone'),
        identity_type: data.get('identity_type'),
        identity_number: data.get('identity_number'),
        password: $('#reg-password').value
      })
    });
    startCustomerSession(result.data.principal);
    $('#register-dialog').close();
    event.target.reset();
    toast(`สมัครสมาชิกสำเร็จ ยินดีต้อนรับ ${result.data.principal.fullName}`);
  } catch (error) {
    registerPasswordError.textContent = error.code === 'EMAIL_IN_USE'
      ? 'อีเมลนี้ถูกสมัครไว้แล้ว'
      : error.message;
    registerPasswordError.hidden = false;
  }
});

function staffPrincipal(principal) {
  const role = principal.role === 'management' ? 'executive' : principal.role;
  return {
    ...principal,
    role,
    roleLabel: staffRoleLabels[role] || principal.role
  };
}

async function restoreSession() {
  try {
    const { data } = await apiFetch('/api/auth/me');
    if (data.principal.type === 'employee') enterStaffSystem(staffPrincipal(data.principal));
    else startCustomerSession(data.principal);
  } catch (error) {
    if (error.status !== 401) console.error('Session restore failed');
  }
}

restoreSession();

/* ==================== Facilities & Chat & Toast ==================== */
// bykoraphat: ใช้การ์ดเดิมกับฟอร์มตรวจรายการสองขั้น
let activeFacilityBtn = null;
let activeFacilityContext = null;
const facilityForm = $('#facility-form');
const facilityReview = $('#facility-review');
const facilityLocationField = $('#facility-location-field');
const facilityLocation = $('#facility-location');
const facilityGuests = $('#facility-guests');
const tourFacilityKinds = new Set(['sunset', 'market']);

async function facilityBookingOptions(kind) {
  const { data } = await apiFetch('/api/bookings/mine?limit=50');
  const details = await Promise.all(data.map(item => apiFetch(`/api/bookings/${item.id}`).then(result => result.data)));
  const allowed = tourFacilityKinds.has(kind)
    ? ['PENDING_PAYMENT', 'PAYMENT_REVIEW', 'CONFIRMED', 'LATE_ARRIVAL', 'CHECKED_IN']
    : ['PENDING_PAYMENT', 'CONFIRMED', 'LATE_ARRIVAL'];
  return details.filter(booking => allowed.includes(booking.effectiveStatus || booking.status)).flatMap(booking =>
    booking.rooms.map(room => ({
      value: `${booking.id}:${room.id}`,
      label: `${booking.bookingCode} · ${room.roomTypeName}`,
      bookingId: booking.id,
      bookingRoomId: room.id,
      guestCount: Number(room.guestCount),
      checkIn: String(booking.checkIn).slice(0, 10),
      checkOut: String(booking.checkOut).slice(0, 10)
    }))
  );
}

function currentFacilityBooking() {
  return activeFacilityContext?.bookings.find(item => item.value === facilityForm.elements.booking_room.value);
}

function currentFacilityRound() {
  return activeFacilityContext?.rounds?.find(item => String(item.id || item.startTime) === facilityForm.elements.time.value);
}

function facilityRoundRemaining(round) {
  if (!round) return 0;
  const value = tourFacilityKinds.has(activeFacilityContext.kind) ? round.remainingSeats : round.remaining;
  return value == null ? Number.MAX_SAFE_INTEGER : Number(value);
}

function facilityLocationName(round) {
  if (!round) return '';
  if (!tourFacilityKinds.has(activeFacilityContext.kind)) return '';
  if (activeFacilityContext.kind === 'market') return 'ตลาดกลางคืน';
  return round.name.replace(/^ชมพระอาทิตย์ตก\s*-\s*/, '');
}

function updateFacilityQuantity() {
  const booking = currentFacilityBooking();
  const round = currentFacilityRound();
  const maximum = Math.max(1, Math.min(booking?.guestCount || 1, facilityRoundRemaining(round)));
  facilityGuests.max = String(maximum);
  facilityGuests.value = String(Math.min(maximum, Math.max(1, Number(facilityGuests.value) || 1)));
  $('#facility-guest-decrease').disabled = Number(facilityGuests.value) <= 1;
  $('#facility-guest-increase').disabled = Number(facilityGuests.value) >= maximum;
  const quantity = Number(facilityGuests.value);
  const total = tourFacilityKinds.has(activeFacilityContext?.kind)
    ? 'ฟรี'
    : `${money(Number(activeFacilityContext?.service?.defaultRate || 0) * quantity)} บาท`;
  $('#facility-status').textContent = round
    ? `${tourFacilityKinds.has(activeFacilityContext.kind) ? 'ทริปฟรี' : `ราคา ${money(Number(activeFacilityContext.service.defaultRate))} บาท/คน`} · เลือกได้สูงสุด ${maximum} คน · รวม ${total}`
    : 'ยังไม่มีรอบที่ว่างในวันที่เลือก';
}

function renderFacilityTimes() {
  const rounds = tourFacilityKinds.has(activeFacilityContext.kind)
    ? activeFacilityContext.rounds.filter(round => String(round.serviceId) === facilityLocation.value)
    : activeFacilityContext.rounds;
  const options = rounds.filter(round => facilityRoundRemaining(round) > 0).map(round => {
    const value = String(round.id || round.startTime);
    const remaining = facilityRoundRemaining(round);
    const suffix = remaining === Number.MAX_SAFE_INTEGER ? '' : ` · เหลือ ${remaining} ที่`;
    return new Option(`${String(round.startTime).slice(0, 5)} น.${suffix}`, value);
  });
  facilityForm.elements.time.replaceChildren(
    new Option(options.length ? 'เลือกรอบเวลา' : 'ไม่มีรอบว่าง', ''), ...options
  );
  facilityForm.elements.time.value = options[0]?.value || '';
  updateFacilityQuantity();
}

async function loadFacilityAvailability() {
  if (!activeFacilityContext || !facilityForm.elements.date.value || !currentFacilityBooking()) return;
  const date = facilityForm.elements.date.value;
  $('#facility-status').textContent = 'กำลังตรวจสอบที่ว่าง...';
  if (tourFacilityKinds.has(activeFacilityContext.kind)) {
    const { data } = await apiFetch(`/api/tours/rounds?from=${date}&to=${date}`);
    activeFacilityContext.rounds = data.filter(round => activeFacilityContext.kind === 'sunset'
      ? /ชมพระอาทิตย์ตก/.test(round.name)
      : /ตลาดกลางคืน/.test(round.name));
    const locations = Array.from(new Map(activeFacilityContext.rounds.map(round => [String(round.serviceId), facilityLocationName(round)])).entries());
    facilityLocationField.hidden = false;
    facilityLocation.replaceChildren(...locations.map(([value, label]) => new Option(label, value)));
  } else {
    const selected = currentFacilityBooking();
    const { data } = await apiFetch(`/api/services/${activeFacilityContext.service.id}/rounds?date=${date}&bookingRoomId=${selected.bookingRoomId}`);
    activeFacilityContext.rounds = data;
    facilityLocationField.hidden = true;
    facilityLocation.replaceChildren(new Option('', ''));
  }
  renderFacilityTimes();
}

async function syncFacilityBookingSelection() {
  const selected = currentFacilityBooking();
  if (!selected) return;
  facilityForm.elements.date.min = selected.checkIn;
  facilityForm.elements.date.max = shiftDay(selected.checkOut, -1);
  facilityForm.elements.date.value = selected.checkIn;
  facilityGuests.value = '1';
  await loadFacilityAvailability();
}

facilityForm.elements.booking_room.addEventListener('change', () => {
  syncFacilityBookingSelection().catch(error => { $('#facility-status').textContent = error.message; });
});
facilityForm.elements.date.addEventListener('change', () => {
  loadFacilityAvailability().catch(error => { $('#facility-status').textContent = error.message; });
});
facilityLocation.addEventListener('change', renderFacilityTimes);
facilityForm.elements.time.addEventListener('change', updateFacilityQuantity);
facilityGuests.addEventListener('input', updateFacilityQuantity);
$('#facility-guest-decrease').addEventListener('click', () => {
  facilityGuests.value = String(Math.max(1, Number(facilityGuests.value) - 1));
  updateFacilityQuantity();
});
$('#facility-guest-increase').addEventListener('click', () => {
  facilityGuests.value = String(Math.min(Number(facilityGuests.max), Number(facilityGuests.value) + 1));
  updateFacilityQuantity();
});

document.querySelectorAll('[data-facility]').forEach(button => {
  button.addEventListener('click', async () => {
    if (!customerEmail) {
      pendingRoom = null;
      toast('กรุณาเข้าสู่ระบบลูกค้าก่อนจองบริการ');
      $('[data-login="ลูกค้า"]')?.click();
      return;
    }
    activeFacilityBtn = button;
    facilityForm.reset();
    facilityForm.hidden = false;
    facilityReview.hidden = true;
    $('#facility-title').textContent = `จอง${button.closest('.facility-card').querySelector('h3').textContent}`;
    $('#facility-status').textContent = 'กำลังโหลดข้อมูลจากฐานข้อมูล...';
    try {
      const kind = button.dataset.facility;
      const bookings = await facilityBookingOptions(kind);
      if (!bookings.length) throw new Error('ไม่พบใบจองที่สามารถเพิ่มบริการนี้ได้');
      activeFacilityContext = { kind, bookings };
      activeFacilityContext.rounds = [];
      facilityGuests.value = '1';
      if (!tourFacilityKinds.has(kind)) {
        const { data: services } = await apiFetch('/api/services');
        const serviceKind = kind === 'fitness' ? 'FITNESS' : 'SAUNA';
        const service = services.find(item => item.serviceKind === serviceKind);
        if (!service) throw new Error('บริการนี้ยังไม่เปิดใช้งาน');
        activeFacilityContext.service = service;
      }
      facilityForm.elements.booking_room.replaceChildren(...bookings.map(item => new Option(item.label, item.value)));
      await syncFacilityBookingSelection();
      $('#facility-dialog').showModal();
    } catch (error) { toast(error.message); }
  });
});

facilityForm.addEventListener('submit', event => {
  event.preventDefault();
  const selected = new FormData(facilityForm);
  facilityReview.querySelector('[data-facility-review="service"]').textContent =
    activeFacilityBtn.closest('.facility-card').querySelector('h3').textContent;
  const round = currentFacilityRound();
  const locationRow = $('#facility-review-location-row');
  locationRow.hidden = !tourFacilityKinds.has(activeFacilityContext.kind);
  facilityReview.querySelector('[data-facility-review="location"]').textContent = facilityLocationName(round);
  facilityReview.querySelector('[data-facility-review="date"]').textContent =
    bookingDate.format(parseDate(selected.get('date')));
  facilityReview.querySelector('[data-facility-review="time"]').textContent =
    facilityForm.elements.time.selectedOptions[0]?.textContent || `${selected.get('time')} น.`;
  facilityReview.querySelector('[data-facility-review="guests"]').textContent = `${selected.get('guests')} คน`;
  $('#facility-total').textContent = tourFacilityKinds.has(activeFacilityContext.kind)
    ? 'ฟรี'
    : `${money(Number(activeFacilityContext.service.defaultRate) * Number(selected.get('guests')))} บาท`;
  facilityForm.hidden = true;
  facilityReview.hidden = false;
  $('#edit-facility').focus();
});

$('#edit-facility').addEventListener('click', () => {
  facilityReview.hidden = true;
  facilityForm.hidden = false;
  facilityForm.elements.date.focus();
});

$('#confirm-facility').addEventListener('click', async event => {
  const selected = activeFacilityContext?.bookings.find(item => item.value === facilityForm.elements.booking_room.value);
  if (!selected) return;
  event.currentTarget.disabled = true;
  try {
    if (tourFacilityKinds.has(activeFacilityContext.kind)) {
      await apiFetch(`/api/bookings/${selected.bookingId}/tours/party`, {
        method: 'POST',
        body: JSON.stringify({
          tourRoundId: Number(facilityForm.elements.time.value),
          bookingRoomId: selected.bookingRoomId,
          quantity: Number(facilityForm.elements.guests.value)
        })
      });
    } else {
      await apiFetch(`/api/bookings/${selected.bookingId}/services`, {
        method: 'POST',
        body: JSON.stringify({
          serviceId: activeFacilityContext.service.id,
          bookingRoomId: selected.bookingRoomId,
          usageDate: facilityForm.elements.date.value,
          startTime: facilityForm.elements.time.value,
          quantity: Number(facilityForm.elements.guests.value)
        })
      });
    }
    activeFacilityBtn.classList.add('booked');
    activeFacilityBtn.textContent = 'จองแล้ว';
    $('#facility-dialog').close();
    toast(tourFacilityKinds.has(activeFacilityContext.kind)
      ? 'จองทริปฟรีเรียบร้อยแล้ว'
      : 'บันทึกบริการเสริมและยอดชำระแล้ว');
  } catch (error) {
    facilityReview.hidden = true;
    facilityForm.hidden = false;
    $('#facility-status').textContent = error.message;
    facilityForm.elements.time.focus();
  } finally { event.currentTarget.disabled = false; }
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
// หลักฐานชำระเงินและผลตรวจโหลดจาก API/ฐานข้อมูลจริง
const accountingPayments = $('#accounting-payments');
const paymentDialog = $('#payment-review-dialog');
const paymentImage = $('#payment-review-image');
let reviewingPayment = null;
let accountingQueue = [];

async function renderAccountingPayments() {
  accountingPayments.innerHTML = '<tr><td colspan="6">กำลังโหลดธุรกรรมจากฐานข้อมูล...</td></tr>';
  try {
    const [submitted, verified] = await Promise.all([
      apiFetch('/api/accounting/payments?status=SUBMITTED&page=1&limit=100'),
      apiFetch('/api/accounting/payments?status=VERIFIED&page=1&limit=100')
    ]);
    accountingQueue = [...submitted.data, ...verified.data];
    const pendingTotal = submitted.data.reduce((sum, item) => sum + Number(item.amount), 0);
    $('#accounting-pending-total').textContent = `฿${money(pendingTotal)}`;
    $('#accounting-pending-count').textContent = `${submitted.meta.total} ธุรกรรม`;
    accountingPayments.innerHTML = accountingQueue.length ? accountingQueue.map(payment => `
      <tr>
        <td><strong>PAY-${payment.id}</strong></td>
        <td><strong>${escapeHtml(payment.booking.code)}</strong><small>${escapeHtml(payment.booking.status)}</small></td>
        <td>${escapeHtml(payment.customer.name)}<small>${escapeHtml(payment.customer.email || '')}</small></td>
        <td>${escapeHtml(payment.transactionType)}</td>
        <td><strong>฿${money(Number(payment.amount))}</strong></td>
        <td>${payment.status === 'SUBMITTED'
          ? `<button type="button" class="status-badge yellow" data-review-payment="${payment.id}">เปิดดูหลักฐาน</button>`
          : `<button type="button" class="booking-outline" data-request-refund="${payment.id}" data-payment-amount="${payment.amount}">ขอคืนเงิน</button>`}</td>
      </tr>`).join('') : '<tr><td colspan="6">ไม่มีหลักฐานรอตรวจ</td></tr>';
  } catch (error) {
    accountingPayments.innerHTML = `<tr><td colspan="6">${escapeHtml(error.message)}</td></tr>`;
  }
}

accountingPayments.addEventListener('click', async event => {
  if (currentStaffSession?.role !== 'accounting') return;
  const refundButton = event.target.closest('[data-request-refund]');
  if (refundButton) {
    const amount = window.prompt(`ยอดที่ต้องการคืน (ไม่เกิน ${refundButton.dataset.paymentAmount} บาท)`);
    if (!amount) return;
    const reason = window.prompt('เหตุผลในการขอคืนเงิน');
    if (!reason) return;
    refundButton.disabled = true;
    try {
      await apiFetch(`/api/accounting/payments/${refundButton.dataset.requestRefund}/refund-requests`, {
        method: 'POST', body: JSON.stringify({ amount, reason })
      });
      await renderRefunds('accounting-refund-list', 'accounting');
      toast('สร้างคำขอคืนเงินแล้ว');
    } catch (error) { toast(error.message); }
    finally { refundButton.disabled = false; }
    return;
  }
  const button = event.target.closest('[data-review-payment]');
  if (!button) return;
  button.disabled = true;
  try {
    const { data } = await apiFetch(`/api/accounting/payments/${button.dataset.reviewPayment}`);
    reviewingPayment = data;
    $('#payment-review-summary').textContent = `${data.booking.code} · ฿${money(Number(data.amount))}`;
    paymentImage.src = data.proofUrl;
    paymentImage.hidden = false;
    $('#reject-slip-form').reset();
    paymentDialog.showModal();
  } catch (error) {
    toast(error.message);
    button.disabled = false;
  }
});

paymentDialog.addEventListener('close', () => {
  paymentImage.removeAttribute('src');
  paymentImage.hidden = true;
  reviewingPayment = null;
});

async function savePaymentReview(decision, reason = '') {
  if (currentStaffSession?.role !== 'accounting' || reviewingPayment?.status !== 'SUBMITTED') return;
  const paymentId = reviewingPayment.id;
  const route = decision === 'approve'
    ? `/api/accounting/payments/${paymentId}/approve`
    : `/api/accounting/payments/${paymentId}/reject`;
  try {
    await apiFetch(route, {
      method: 'POST',
      body: JSON.stringify(decision === 'reject' ? { reason } : {})
    });
    paymentDialog.close();
    await Promise.all([renderAccountingPayments(), renderFinancialSummary('accounting-financial-summary')]);
    toast(decision === 'approve' ? 'อนุมัติหลักฐานแล้ว' : 'บันทึกผลให้ลูกค้าส่งใหม่แล้ว');
  } catch (error) {
    toast(error.message);
  }
}

async function renderPromotions() {
  const target = $('#executive-promotion-list');
  if (!target) return;
  target.innerHTML = '<p>กำลังโหลดโปรโมชั่น...</p>';
  try {
    const { data } = await apiFetch('/api/staff/promotions');
    target.innerHTML = data.length ? data.map(item => `
      <div class="promo-card">
        <span class="promo-code">${escapeHtml(item.code)}</span>
        <strong>${escapeHtml(item.name)} · ลด ${escapeHtml(item.discountPercent)}%</strong>
        <small>${item.active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'} · ลำดับ ${item.priority}</small>
      </div>`).join('') : '<p>ยังไม่มีโปรโมชั่น</p>';
  } catch (error) { target.innerHTML = `<p>${escapeHtml(error.message)}</p>`; }
}

async function renderRefunds(targetId, role) {
  const target = $(`#${targetId}`);
  if (!target) return;
  target.innerHTML = '<p>กำลังโหลดคำขอคืนเงิน...</p>';
  try {
    const { data } = await apiFetch('/api/management/refunds?page=1&limit=100');
    target.innerHTML = data.length ? data.map(item => `
      <div class="service-mini-box">
        <div><strong>REF-${item.id} · ฿${money(Number(item.amount))}</strong><small>${escapeHtml(item.reason || '')} · ${escapeHtml(item.status)}</small></div>
        ${role === 'executive' && item.status === 'PENDING' ? `<span><button class="booking-outline" data-refund-approve="${item.id}">อนุมัติ</button> <button class="booking-outline" data-refund-reject="${item.id}">ปฏิเสธ</button></span>` : ''}
        ${role === 'accounting' && item.status === 'APPROVED' ? `<button class="btn-dark-pill" data-refund-payout="${item.id}">บันทึกจ่ายคืน</button>` : ''}
      </div>`).join('') : '<p>ยังไม่มีคำขอคืนเงิน</p>';
  } catch (error) { target.innerHTML = `<p>${escapeHtml(error.message)}</p>`; }
}

$('#executive-refund-list')?.addEventListener('click', async event => {
  const button = event.target.closest('[data-refund-approve],[data-refund-reject]');
  if (!button) return;
  const decision = button.dataset.refundApprove ? 'approve' : 'reject';
  const refundId = button.dataset.refundApprove || button.dataset.refundReject;
  const reason = window.prompt(decision === 'approve' ? 'หมายเหตุการอนุมัติ' : 'เหตุผลที่ปฏิเสธ');
  if (!reason) return;
  button.disabled = true;
  try {
    await apiFetch(`/api/management/refunds/${refundId}/${decision}`, { method: 'POST', body: JSON.stringify({ reason }) });
    await renderRefunds('executive-refund-list', 'executive');
    toast('บันทึกผลคำขอคืนเงินแล้ว');
  } catch (error) { toast(error.message); button.disabled = false; }
});

$('#accounting-refund-list')?.addEventListener('click', async event => {
  const button = event.target.closest('[data-refund-payout]');
  if (!button) return;
  button.disabled = true;
  try {
    await apiFetch(`/api/accounting/refunds/${button.dataset.refundPayout}/payout`, {
      method: 'POST', body: JSON.stringify({ method: 'BANK_TRANSFER', idempotencyKey: `WEB-REFUND-${crypto.randomUUID()}` })
    });
    await Promise.all([renderRefunds('accounting-refund-list', 'accounting'), renderFinancialSummary('accounting-financial-summary')]);
    toast('บันทึกการจ่ายคืนแล้ว');
  } catch (error) { toast(error.message); button.disabled = false; }
});

$('#create-promotion')?.addEventListener('click', async () => {
  const code = window.prompt('รหัสโปรโมชั่น'); if (!code) return;
  const name = window.prompt('ชื่อโปรโมชั่น'); if (!name) return;
  const discountPercent = window.prompt('เปอร์เซ็นต์ส่วนลด เช่น 10.00'); if (!discountPercent) return;
  try {
    await apiFetch('/api/staff/promotions', { method: 'POST', body: JSON.stringify({ code, name, discountPercent, priority: 0, validFrom: null, validUntil: null, active: true }) });
    await renderPromotions(); toast('สร้างโปรโมชั่นแล้ว');
  } catch (error) { toast(error.message); }
});

$('#approve-slip').addEventListener('click', () => savePaymentReview('approve'));
$('#reject-slip-form').addEventListener('submit', event => {
  event.preventDefault();
  const input = event.target.elements.reason;
  const reason = input.value.trim();
  if (reason) savePaymentReview('reject', reason);
  else {
    toast('กรุณาระบุเหตุผลที่ขอให้ส่งสลิปใหม่');
    input.focus();
  }
});

async function renderFinancialSummary(targetId) {
  const target = $(`#${targetId}`);
  if (!target) return;
  target.innerHTML = '<p>กำลังโหลดสรุปจากฐานข้อมูล...</p>';
  try {
    const { data } = await apiFetch(`/api/accounting/financial-summary?from=${today}&to=${today}`);
    target.innerHTML = `
      <div class="df-row"><span>ยอดรับรวม</span><strong>฿${money(Number(data.incomingTotal))}</strong></div>
      <div class="df-row"><span>จำนวนรายการที่รับเงินจริง</span><strong>${data.paymentCount} รายการ</strong></div>
      ${data.byTransactionType.map(item => `<div class="df-row"><span>${escapeHtml(item.transactionType)}</span><strong>฿${money(Number(item.amount))}</strong></div>`).join('')}`;
    if (targetId === 'accounting-financial-summary') {
      $('#accounting-verified-total').textContent = `฿${money(Number(data.incomingTotal))}`;
      $('#accounting-verified-count').textContent = `${data.paymentCount} ธุรกรรม`;
    }
  } catch (error) {
    target.innerHTML = `<p class="login-error-text">${escapeHtml(error.message)}</p>`;
  }
}

$('#reception-payment-form')?.addEventListener('submit', async event => {
  event.preventDefault();
  if (currentStaffSession?.role !== 'reception') return;
  const form = event.target;
  const result = $('#reception-payment-result');
  const submit = form.querySelector('[type="submit"]');
  const bookingId = form.elements.bookingId.value;
  const amount = form.elements.amount.value.trim();
  const method = form.elements.method.value;
  const signature = `${bookingId}|${amount}|${method}`;
  if (form.dataset.paymentSignature !== signature) {
    form.dataset.paymentSignature = signature;
    form.dataset.paymentKey = `RECEPTION-${bookingId}-${crypto.randomUUID()}`;
  }
  submit.disabled = true;
  result.textContent = 'กำลังตรวจสอบยอดคงเหลือ...';
  try {
    const response = await apiFetch(`/api/staff/bookings/${bookingId}/payments`, {
      method: 'POST',
      body: JSON.stringify({
        amount,
        method,
        idempotencyKey: form.dataset.paymentKey
      })
    });
    result.textContent = `บันทึก PAY-${response.data.id} แล้ว · คงเหลือ ฿${money(Number(response.data.outstanding))}`;
    form.elements.amount.value = '';
    delete form.dataset.paymentKey;
    delete form.dataset.paymentSignature;
  } catch (error) {
    result.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

// API-backed staff, room, and damage UI references
const staffAccountForm = $('#staff-account-form');
const staffAccessList = $('#staff-access-list');
let editingStaffEmail = null;
const receptionRoomList = $('#reception-room-list');
const cleaningQueue = $('#cleaning-queue');
const repairRoomList = $('#repair-room-list');
const damageDialog = $('#room-damage-dialog');
const damagePreview = $('#room-damage-preview');
let damageDraftUrl = null;

for (const [buttonId, fileId] of [
  ['#room-damage-camera', '#damage-camera-file'],
  ['#room-damage-gallery', '#damage-gallery-file']
]) {
  const input = $(fileId);
  $(buttonId)?.addEventListener('click', () => input?.click());
  input?.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      input.value = '';
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

damageDialog?.addEventListener('close', () => {
  if (damageDraftUrl) URL.revokeObjectURL(damageDraftUrl);
  damageDraftUrl = null;
  damagePreview.removeAttribute('src');
  damagePreview.hidden = true;
});

// Room operations below are the persistent replacement for the legacy in-memory demo maps.
let apiRoomRecords = [];
let apiDamageRoom = null;
const apiDamageForm = $('#room-damage-form');

async function loadStaffRoomsApi() {
  const { data } = await apiFetch('/api/staff/rooms?page=1&limit=100');
  apiRoomRecords = data;
  return data;
}

async function renderReceptionRoomsApi() {
  receptionRoomList.innerHTML = '<tr><td colspan="5">กำลังโหลดห้องจากฐานข้อมูล...</td></tr>';
  try {
    const rooms = await loadStaffRoomsApi();
    receptionRoomList.innerHTML = rooms.map(room => `
      <tr data-api-room-id="${room.id}">
        <td><strong>${escapeHtml(room.code)}</strong></td><td>—</td>
        <td>${escapeHtml(room.roomTypeName)}</td>
        <td><span class="status-badge ${room.status === 'AVAILABLE' ? 'green' : 'yellow'}">${escapeHtml(room.status)}</span></td>
        <td><button type="button" class="link-edit" data-room-history="${room.id}">ดูประวัติ</button></td>
      </tr>`).join('') || '<tr><td colspan="5">ไม่พบห้อง</td></tr>';
    const counts = Object.fromEntries(['AVAILABLE','OCCUPIED','NEEDS_CLEANING','OUT_OF_SERVICE'].map(status =>
      [status, rooms.filter(room => room.status === status).length]));
    $('#cleaning-room-count').textContent = `${counts.NEEDS_CLEANING} ห้อง`;
  } catch (error) { receptionRoomList.innerHTML = `<tr><td colspan="5">${escapeHtml(error.message)}</td></tr>`; }
}

receptionRoomList.addEventListener('click', async event => {
  const button = event.target.closest('[data-room-history]');
  if (!button) return;
  try {
    const { data } = await apiFetch(`/api/staff/rooms/${button.dataset.roomHistory}/history?page=1&limit=10`);
    toast(data.length ? data.map(item => item.eventType).join(' · ') : 'ห้องนี้ยังไม่มีประวัติเหตุการณ์');
  } catch (error) { toast(error.message); }
});

async function renderCleaningSummaryApi() {
  try {
    const { data } = await apiFetch('/api/housekeeping/cleaning');
    $('#reception-cleaning-list').textContent = data.length
      ? data.map(item => `ห้อง ${item.roomCode} · ${item.status}`).join(' · ')
      : 'ไม่มีห้องรอทำความสะอาด';
  } catch (error) { $('#reception-cleaning-list').textContent = error.message; }
}

async function renderCleaningQueueApi() {
  cleaningQueue.innerHTML = '<p>กำลังโหลดคิวทำความสะอาด...</p>';
  try {
    const [cleaning, rooms] = await Promise.all([
      apiFetch('/api/housekeeping/cleaning'),
      loadStaffRoomsApi()
    ]);
    cleaningQueue.innerHTML = cleaning.data.length ? cleaning.data.map(item => `
      <div class="housekeeping-item staff-room-row">
        <div><strong>ห้อง ${escapeHtml(item.roomCode)}</strong><small>${escapeHtml(item.roomTypeName)} · ${escapeHtml(item.status)}</small></div>
        <div class="staff-actions">
          <button type="button" class="btn-dark-pill" data-clean-event="${item.id}" data-clean-action="${item.startedAt ? 'complete' : 'start'}">${item.startedAt ? 'ยืนยันว่าทำเสร็จ' : 'เริ่มทำความสะอาด'}</button>
          <button type="button" class="booking-outline" data-api-damage-room="${item.roomId}">แจ้งความเสียหาย</button>
        </div>
      </div>`).join('') : '<p class="demo-note">ยังไม่มีห้องในคิว</p>';
    $('#damage-room-choice').querySelector('select').replaceChildren(...rooms.map(room => new Option(`ห้อง ${room.code} · ${room.roomTypeName}`, room.id)));
  } catch (error) { cleaningQueue.innerHTML = `<p>${escapeHtml(error.message)}</p>`; }
}

function openApiDamage(roomId) {
  apiDamageRoom = apiRoomRecords.find(room => room.id === Number(roomId));
  if (!apiDamageRoom) return;
  apiDamageForm.reset();
  $('#room-damage-heading').textContent = `ห้อง ${apiDamageRoom.code} · ${apiDamageRoom.roomTypeName}`;
  $('#room-damage-filename').textContent = 'ยังไม่มีรูปแนบ';
  damageDialog.showModal();
}

cleaningQueue.addEventListener('click', async event => {
  const damage = event.target.closest('[data-api-damage-room]');
  if (damage) { openApiDamage(damage.dataset.apiDamageRoom); return; }
  const button = event.target.closest('[data-clean-event]');
  if (!button) return;
  button.disabled = true;
  try {
    await apiFetch(`/api/housekeeping/cleaning/${button.dataset.cleanEvent}/${button.dataset.cleanAction}`, { method: 'POST', body: JSON.stringify({}) });
    await renderCleaningQueueApi();
    toast(button.dataset.cleanAction === 'start' ? 'เริ่มทำความสะอาดแล้ว' : 'บันทึกว่าทำความสะอาดเสร็จแล้ว');
  } catch (error) { toast(error.message); button.disabled = false; }
});

$('#choose-damage-room').addEventListener('submit', event => {
  const value = event.target.elements.room.value;
  if (/^\d+$/.test(value)) { event.preventDefault(); openApiDamage(value); }
});

apiDamageForm.addEventListener('submit', async event => {
  if (!apiDamageRoom) return;
  event.preventDefault();
  const file = $('#damage-camera-file').files[0] || $('#damage-gallery-file').files[0];
  if (!file) { toast('กรุณาแนบรูปความเสียหาย'); return; }
  const body = new FormData(apiDamageForm);
  body.set('expectedVersion', String(apiDamageRoom.statusVersion));
  body.set('photo', file);
  const submit = apiDamageForm.querySelector('[type="submit"]'); submit.disabled = true;
  try {
    await apiFetch(`/api/housekeeping/rooms/${apiDamageRoom.id}/damages`, { method: 'POST', body });
    damageDialog.close(); apiDamageRoom = null;
    await Promise.all([renderCleaningQueueApi(), renderDamageReportsApi($('#housekeeping-damage-list'))]);
    toast('ส่งรายงานความเสียหายลงฐานข้อมูลแล้ว');
  } catch (error) { toast(error.message); }
  finally { submit.disabled = false; }
});

async function renderDamageReportsApi(target) {
  if (!target) return;
  target.innerHTML = '<p>กำลังโหลดรายงานความเสียหาย...</p>';
  try {
    const { data } = await apiFetch('/api/management/damages');
    target.innerHTML = data.length ? data.map(report => `
      <details class="staff-damage-report"><summary>ห้อง ${escapeHtml(report.roomCode)} · ${escapeHtml(report.item)}</summary>
        <p>${escapeHtml(report.description)}</p>
        <img class="staff-photo" src="/api/room-events/${report.id}/photo" alt="ภาพความเสียหายห้อง ${escapeHtml(report.roomCode)}">
        <p class="demo-note">${report.resolved ? 'แก้ไขแล้ว' : report.reviewed ? 'ตรวจสอบแล้ว' : 'รอตรวจสอบ'}</p>
        ${currentStaffSession?.role === 'executive' && !report.reviewed ? `<button class="booking-outline" data-review-damage="${report.id}">ตรวจสอบ</button>` : ''}
        ${currentStaffSession?.role === 'executive' && report.reviewed && !report.resolved ? `<button class="btn-dark-pill" data-resolve-damage="${report.id}">ยืนยันแก้ไขแล้ว</button>` : ''}
      </details>`).join('') : '<p>ยังไม่มีรายงานความเสียหาย</p>';
  } catch (error) { target.innerHTML = `<p>${escapeHtml(error.message)}</p>`; }
}

$('#executive-damage-list')?.addEventListener('click', async event => {
  const button = event.target.closest('[data-review-damage],[data-resolve-damage]'); if (!button) return;
  const action = button.dataset.reviewDamage ? 'review' : 'resolve'; const id = button.dataset.reviewDamage || button.dataset.resolveDamage;
  const reason = window.prompt(action === 'review' ? 'ผลการตรวจสอบ' : 'รายละเอียดการแก้ไข'); if (!reason) return;
  try { await apiFetch(`/api/management/damages/${id}/${action}`, { method: 'POST', body: JSON.stringify({ reason }) }); await renderDamageReportsApi($('#executive-damage-list')); }
  catch (error) { toast(error.message); }
});

async function activeClosureForRoom(roomId) {
  const { data } = await apiFetch(`/api/staff/rooms/${roomId}/history?page=1&limit=100`);
  const reopened = new Set(data.filter(item => item.eventType === 'ROOM_REOPENED').map(item => item.relatedEventId));
  return data.find(item => item.eventType === 'ROOM_CLOSED' && !reopened.has(item.id));
}

async function renderRepairRoomsApi() {
  repairRoomList.innerHTML = '<p>กำลังโหลดสถานะห้อง...</p>';
  try {
    const rooms = await loadStaffRoomsApi();
    repairRoomList.innerHTML = rooms.map(room => `
      <div class="housekeeping-item staff-room-row">
        <div><strong>ห้อง ${escapeHtml(room.code)}</strong><small>${escapeHtml(room.roomTypeName)} · ${escapeHtml(room.status)}</small></div>
        ${room.status !== 'OCCUPIED' ? `<button type="button" class="booking-outline" ${room.status === 'OUT_OF_SERVICE' ? `data-api-reopen-room="${room.id}"` : `data-api-close-room="${room.id}"`}>${room.status === 'OUT_OF_SERVICE' ? 'เปิดห้องอีกครั้ง' : 'ปิดห้องเพื่อซ่อม'}</button>` : ''}
      </div>`).join('');
    await renderDamageReportsApi($('#executive-damage-list'));
  } catch (error) { repairRoomList.innerHTML = `<p>${escapeHtml(error.message)}</p>`; }
}

repairRoomList.addEventListener('click', async event => {
  const closeButton = event.target.closest('[data-api-close-room]');
  const reopenButton = event.target.closest('[data-api-reopen-room]');
  if (!closeButton && !reopenButton) return;
  const roomId = Number(closeButton?.dataset.apiCloseRoom || reopenButton?.dataset.apiReopenRoom);
  const room = apiRoomRecords.find(item => item.id === roomId); if (!room) return;
  const reason = window.prompt(closeButton ? 'เหตุผลที่ปิดห้อง' : 'เหตุผลที่เปิดห้อง'); if (!reason) return;
  try {
    if (closeButton) await apiFetch(`/api/management/rooms/${roomId}/closures`, { method: 'POST', body: JSON.stringify({ expectedVersion: room.statusVersion, reason, effectiveFrom: null, effectiveTo: null }) });
    else {
      const closure = await activeClosureForRoom(roomId); if (!closure) throw new Error('ไม่พบรายการปิดห้องที่ยังมีผล');
      await apiFetch(`/api/management/room-closures/${closure.id}/reopen`, { method: 'POST', body: JSON.stringify({ expectedVersion: room.statusVersion, reason }) });
    }
    await renderRepairRoomsApi();
  } catch (error) { toast(error.message); }
});

async function loadPublicReviews() {
  const target = $('#public-review-list');
  if (!target) return;
  try {
    const { data } = await apiFetch('/api/reviews?page=1&limit=20');
    target.innerHTML = data.length ? data.map(review => `
      <blockquote><span class="stars" aria-label="${review.rating} ดาว">${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</span>
        <p>“${escapeHtml(review.content)}”</p><footer>${escapeHtml(review.customerName)} · ${escapeHtml(review.roomTypeName || 'TKC Hotel')}</footer></blockquote>`).join('')
      : '<p>ยังไม่มีรีวิวจากผู้เข้าพัก</p>';
  } catch (error) { target.innerHTML = `<p>${escapeHtml(error.message)}</p>`; }
}
loadPublicReviews();

async function loadCustomerChat() {
  if (!customerEmail) return;
  const box = $('#chat-messages');
  try {
    const { data } = await apiFetch('/api/chat/messages?after=0&limit=100');
    box.innerHTML = data.length ? data.map(item => `
      <p class="message ${item.senderType === 'CUSTOMER' ? 'guest' : 'staff'}">${escapeHtml(item.message)}</p>`).join('')
      : '<p class="message staff">สวัสดีค่ะ สอบถามฝ่ายต้อนรับได้ที่นี่</p>';
    box.scrollTop = box.scrollHeight;
  } catch (error) { if (error.status !== 401) box.innerHTML = `<p>${escapeHtml(error.message)}</p>`; }
}

$('#chat-form')?.addEventListener('submit', async event => {
  event.preventDefault(); event.stopImmediatePropagation();
  if (!customerEmail) { toast('กรุณาเข้าสู่ระบบลูกค้าก่อนส่งข้อความ'); return; }
  const input = $('#chat-input'); const message = input.value.trim(); if (!message) return;
  try { await apiFetch('/api/chat/messages', { method: 'POST', body: JSON.stringify({ message }) }); input.value = ''; await loadCustomerChat(); }
  catch (error) { toast(error.message); }
}, { capture: true });
$('#chat-toggle')?.addEventListener('click', loadCustomerChat);
document.querySelectorAll('[data-open-chat]').forEach(button => button.addEventListener('click', loadCustomerChat));
setInterval(() => { if (customerEmail && !$('#chat-panel').hidden) loadCustomerChat(); }, 5000);

let activeReceptionCustomerId = null;
async function renderReceptionChatsApi() {
  const select = $('#reception-chat-customer'); const box = $('#rec-chat-box');
  try {
    const { data } = await apiFetch('/api/reception/chats?page=1&limit=100');
    select.replaceChildren(new Option('เลือกลูกค้าที่สนทนา', ''), ...data.map(item =>
      new Option(`${item.customerName}${item.unreadCount ? ` · ยังไม่อ่าน ${item.unreadCount}` : ''}`, item.customerId)));
    if (activeReceptionCustomerId && data.some(item => item.customerId === activeReceptionCustomerId)) select.value = String(activeReceptionCustomerId);
    else activeReceptionCustomerId = null;
    if (!data.length) box.innerHTML = '<p>ยังไม่มีข้อความจากลูกค้า</p>';
  } catch (error) { box.innerHTML = `<p>${escapeHtml(error.message)}</p>`; }
}

async function loadReceptionThread() {
  const box = $('#rec-chat-box');
  if (!activeReceptionCustomerId) { box.innerHTML = '<p>เลือกลูกค้าที่ต้องการสนทนา</p>'; return; }
  try {
    const { data } = await apiFetch(`/api/reception/chats/${activeReceptionCustomerId}/messages?after=0&limit=100`);
    box.innerHTML = data.map(item => `<div class="rec-msg ${item.senderType === 'CUSTOMER' ? 'customer' : 'staff'}"><p>${escapeHtml(item.message)}</p><small>${new Date(item.sentAt).toLocaleTimeString('th-TH')}</small></div>`).join('');
    box.scrollTop = box.scrollHeight;
  } catch (error) { box.innerHTML = `<p>${escapeHtml(error.message)}</p>`; }
}
$('#reception-chat-customer')?.addEventListener('change', event => { activeReceptionCustomerId = Number(event.target.value) || null; loadReceptionThread(); });
$('#rec-chat-form')?.addEventListener('submit', async event => {
  event.preventDefault(); event.stopImmediatePropagation(); if (!activeReceptionCustomerId) return;
  const input = $('#rec-chat-input'); const message = input.value.trim(); if (!message) return;
  try { await apiFetch(`/api/reception/chats/${activeReceptionCustomerId}/messages`, { method: 'POST', body: JSON.stringify({ message }) }); input.value = ''; await loadReceptionThread(); }
  catch (error) { toast(error.message); }
}, { capture: true });

async function renderStaffAccessApi() {
  staffAccessList.innerHTML = '<tr><td colspan="4">กำลังโหลดพนักงาน...</td></tr>';
  try {
    const { data } = await apiFetch('/api/staff/employees?page=1&limit=100');
    staffAccessList.innerHTML = data.map(employee => `<tr>
      <td>${escapeHtml(employee.name)}<small>${escapeHtml(employee.email)}</small></td>
      <td>${escapeHtml(employee.department)}</td><td>${escapeHtml(employee.role)}</td>
      <td><button class="link-edit" data-api-employee="${employee.id}" data-employee-record="${escapeHtml(encodeURIComponent(JSON.stringify(employee)))}">แก้ไขสิทธิ์</button></td>
    </tr>`).join('');
  } catch (error) { staffAccessList.innerHTML = `<tr><td colspan="4">${escapeHtml(error.message)}</td></tr>`; }
}

staffAccessList.addEventListener('click', event => {
  const button = event.target.closest('[data-api-employee]'); if (!button) return;
  const employee = JSON.parse(decodeURIComponent(button.dataset.employeeRecord));
  staffAccountForm.reset(); editingStaffEmail = employee.email;
  staffAccountForm.dataset.employeeId = employee.id;
  const { name, email, department, role, password } = staffAccountForm.elements;
  name.value = employee.name; email.value = employee.email; department.value = employee.department; role.value = employee.role;
  email.readOnly = false; password.required = false; password.disabled = true; $('#staff-temp-password').hidden = true;
  $('#staff-account-dialog').showModal();
});

staffAccountForm.addEventListener('submit', async event => {
  event.preventDefault(); event.stopImmediatePropagation();
  const form = event.target; const data = new FormData(form); const employeeId = form.dataset.employeeId;
  const body = { name: data.get('name').trim(), email: data.get('email').trim(), department: data.get('department').trim(), role: data.get('role').toUpperCase(), active: true };
  if (!employeeId) body.password = data.get('password');
  try {
    await apiFetch(employeeId ? `/api/staff/employees/${employeeId}` : '/api/staff/employees', { method: employeeId ? 'PATCH' : 'POST', body: JSON.stringify(body) });
    delete form.dataset.employeeId; $('#staff-account-dialog').close(); await renderStaffAccessApi(); toast('บันทึกพนักงานแล้ว');
  } catch (error) { $('#staff-account-error').textContent = error.message; $('#staff-account-error').hidden = false; }
}, { capture: true });

async function renderAuditApi() {
  const target = $('#executive-audit-list');
  try {
    const { data } = await apiFetch('/api/management/audit?page=1&limit=50');
    target.innerHTML = data.length ? data.map(item => `<div class="service-mini-box"><div><strong>${escapeHtml(item.action)}</strong><small>${escapeHtml(item.entityType)} #${item.entityId} · ${new Date(item.createdAt).toLocaleString('th-TH')}</small></div></div>`).join('') : '<p>ยังไม่มี Audit</p>';
  } catch (error) { target.innerHTML = `<p>${escapeHtml(error.message)}</p>`; }
}

function refreshStaffDashboard(role) {
  if (role === 'superadmin') {
    renderStaffAccessApi();
    renderStaffBookingHistory(role);
  }
  if (role === 'accounting') {
    renderAccountingPayments();
    renderFinancialSummary('accounting-financial-summary');
    renderRefunds('accounting-refund-list', role);
  }
  if (role === 'executive') {
    renderRepairRoomsApi();
    renderFinancialSummary('executive-financial-summary');
    renderStaffBookingHistory(role);
    renderPromotions();
    renderRefunds('executive-refund-list', role);
    renderAuditApi();
  }
  if (role === 'reception') {
    renderReceptionRoomsApi();
    renderStaffBookingHistory(role);
    renderDamageReportsApi($('#reception-damage-list'));
    renderCleaningSummaryApi();
    renderReceptionChatsApi();
  }
  if (role === 'housekeeping') {
    renderCleaningQueueApi();
    renderDamageReportsApi($('#housekeeping-damage-list'));
  }
}
