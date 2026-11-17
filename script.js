'use strict';

const $ = selector => document.querySelector(selector);

// จุดเรียก API กลางของหน้าเว็บ: ปรับ cookie, header และการแปลง error ของคำขอได้ที่นี่
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
  accounting: { prefix: 'acc', selector: '#shared-booking-history-accounting' },
  reception: { prefix: 'rec', selector: '#shared-booking-history-reception' },
  executive: { prefix: 'exec', selector: '#shared-booking-history-executive' }
};
const scrollableBookingListRoles = new Set(['superadmin', 'accounting', 'reception', 'executive']);

// ประวัติการจองพนักงาน: UI อยู่ที่นี่; API/SQL อยู่ api/modules/bookings (Booking, BookingRoom และตารางลูก)
async function renderStaffBookingHistory(role) {
  const targetConfig = staffBookingTargets[role];
  const target = targetConfig && $(targetConfig.selector);
  if (!target) return;
  target.innerHTML = '<p>กำลังโหลดรายการจองจากฐานข้อมูล...</p>';
  try {
    const params = new URLSearchParams({ page: '1', limit: '50' });
    if (role === 'accounting') params.set('status', 'PENDING_PAYMENT');
    const { data, meta } = await apiFetch(`/api/staff/bookings?${params}`);
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
        <div><h3>${role === 'accounting' ? 'รายการจองที่รอชำระเงิน' : 'รายการจองล่าสุด'}</h3><p>${role === 'accounting' ? 'เลือกยกเลิกได้เฉพาะรายการที่ยังไม่มีประวัติชำระหรือส่งสลิป' : 'ข้อมูลลูกค้าและสถานะจากฐานข้อมูลจริง'}</p></div>
        <div class="staff-actions">
          <span class="count-pill">${meta.total} รายการ</span>
          <button type="button" class="booking-outline" data-refresh-staff-bookings="${role}">รีเฟรช</button>
        </div>
      </div>
      ${data.length ? `
        <div class="history-split-grid">
          <div class="history-list ${scrollableBookingListRoles.has(role) ? 'history-list-scroll' : ''} ${role === 'accounting' ? 'accounting-pending-booking-list' : ''}"
            ${scrollableBookingListRoles.has(role) ? `tabindex="0" aria-label="${role === 'accounting' ? 'รายการจองที่รอชำระเงิน เลื่อนเพื่อดูรายการอื่น' : 'รายการจองล่าสุด เลื่อนเพื่อดูรายการอื่น'}"` : ''}>
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
          <div class="history-detail-box ${scrollableBookingListRoles.has(role) && role !== 'accounting' ? 'history-detail-box-scroll' : ''}" id="${targetConfig.prefix}-live-booking-detail">
            <p>กำลังโหลดรายละเอียด...</p>
          </div>
        </div>` : role === 'accounting' ? '<p>ไม่มีรายการจองที่รอชำระเงิน</p>' : '<p>ยังไม่มีรายการจองในฐานข้อมูล</p>'}`;
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
  pane.scrollTop = 0;
  pane.innerHTML = '<p>กำลังโหลดรายละเอียด...</p>';
  try {
    const { data: booking } = await apiFetch(`/api/staff/bookings/${bookingId}`);
    const serviceLines = (booking.services || []).map(item =>
      `<div class="cost-line"><span>${escapeHtml(item.name)}${item.quantity ? ` · ${item.quantity} คน` : ''}${item.usageDate ? ` · ${escapeHtml(item.usageDate)}` : ''}${item.startTime ? ` · ${String(item.startTime).slice(0, 5)} น.` : ''}</span><strong>฿${money(Number(item.amount))}</strong></div>`);
    const tourLines = (booking.tours || []).map(item =>
      `<div class="cost-line"><span>${escapeHtml(item.name)} · ${item.quantity} คน · ${escapeHtml(item.location || '')}${item.tourDate ? ` · ${escapeHtml(item.tourDate)}` : ''} · ${String(item.startTime || '').slice(0, 5)} น.</span><strong>${Number(item.amount) > 0 ? `฿${money(Number(item.amount))}` : 'ฟรี'}</strong></div>`);
    const extras = [...serviceLines, ...tourLines];
    const bookingStatusLabels = {
      PENDING_PAYMENT: 'รอชำระเงิน', PAYMENT_REVIEW: 'รอตรวจสอบการชำระเงิน',
      CONFIRMED: 'ยืนยันแล้ว', LATE_ARRIVAL: 'แจ้งเข้าพักล่าช้า', CHECKED_IN: 'เช็คอินแล้ว',
      CHECKED_OUT: 'เช็คเอาท์แล้ว', CANCELLED: 'ยกเลิกแล้ว', NO_SHOW: 'ไม่เข้าพัก'
    };
    const paymentTypeLabels = {
      PAYMENT: 'ชำระเงิน', DEPOSIT: 'มัดจำ', BALANCE: 'ยอดคงเหลือ',
      FULL_PAYMENT: 'ชำระเต็ม', SERVICE_PAYMENT: 'ค่าบริการ',
      REFUND_REQUEST: 'คำขอคืนเงิน', REFUND_PAYOUT: 'จ่ายคืนเงิน'
    };
    const paymentStatusLabels = {
      SUBMITTED: 'รอตรวจสอบ', VERIFIED: 'ตรวจสอบแล้ว', COMPLETED: 'สำเร็จ',
      REJECTED: 'ไม่ผ่านการตรวจสอบ', APPROVED: 'อนุมัติแล้ว', CANCELLED: 'ยกเลิก'
    };
    const actionLabels = {
      BOOKING_CREATED: 'สร้างรายการจอง', PAYMENT_REVIEW_STARTED: 'ส่งหลักฐาน รอตรวจสอบ',
      PAYMENT_REVIEW_RESTARTED: 'ส่งหลักฐานใหม่ รอตรวจสอบ', PAYMENT_RECEIVED: 'รับชำระเงินแล้ว',
      CONFIRMED: 'ยืนยันการจองแล้ว', CHECKED_IN: 'เช็คอินแล้ว', CHECKED_OUT: 'เช็คเอาท์แล้ว',
      NO_SHOW_RECORDED: 'บันทึกไม่เข้าพัก', BOOKING_CANCELLED: 'ยกเลิกการจอง',
      STAFF_BOOKING_CANCELLED_UNPAID: 'พนักงานยกเลิกการจองที่ยังไม่ชำระ'
    };
    const paymentMethodLabels = { BANK_TRANSFER: 'โอนธนาคาร', CASH: 'เงินสด', CARD: 'บัตร' };
    const paymentLines = (booking.payments || []).map(payment => `
      <div class="pay-slip-row">
        <div><strong>PAY-${payment.id}</strong><small>${escapeHtml(paymentTypeLabels[payment.transactionType] || payment.transactionType)} · ${escapeHtml(paymentMethodLabels[payment.method] || payment.method || '-')} · ${escapeHtml(paymentStatusLabels[payment.status] || payment.status)}</small></div>
        <strong>${payment.direction === 'OUT' ? '−' : ''}฿${money(Number(payment.amount))}</strong>
      </div>`);
    const timelineItems = (booking.timeline || []).map(item => {
      const label = item.status
        ? bookingStatusLabels[item.status] || item.status
        : actionLabels[item.action] || String(item.action || '').replaceAll('_', ' ');
      return `<li><span class="dot"></span><div><strong>${escapeHtml(label)}</strong><small>${escapeHtml(item.createdAt || '')}</small><small>ดำเนินการโดย ${escapeHtml(item.actorName || 'ระบบ')}</small>${item.reason ? `<small>หมายเหตุ: ${escapeHtml(item.reason)}</small>` : ''}</div></li>`;
    });
    const roomSummary = (booking.rooms || []).map(room =>
      `${room.roomTypeName} · ${room.guestCount} คน${room.assignedRoomCode ? ` · ห้อง ${room.assignedRoomCode}` : ''}`).join(' / ');
    const nights = Math.max(1, Math.round((Date.parse(`${booking.checkOut}T00:00:00Z`) - Date.parse(`${booking.checkIn}T00:00:00Z`)) / 86400000));
    const roomLines = (booking.rooms || []).map(room =>
      `<div class="cost-line"><span>${escapeHtml(room.roomTypeName)} · ${nights} คืน · ห้องพัก</span><strong>฿${money(Number(room.netAmount))}</strong></div>`);
    const paid = Number(booking.payment?.paid || 0);
    const total = Number(booking.total || 0);
    pane.innerHTML = `
      <div class="hd-top">
        <div>
          <small class="hd-code">BOOKING RECORD · ${escapeHtml(booking.bookingCode)}</small>
          <h4>${escapeHtml(booking.customer.fullName)}</h4>
          <p>${escapeHtml(booking.customer.email || 'ไม่มีอีเมล')} · ${escapeHtml(booking.customer.phone || '')}</p>
          <small class="hd-guest-id">รหัสลูกค้า ${escapeHtml(booking.customer.id)}</small>
        </div>
        <span class="status-badge ${booking.status === 'CONFIRMED' ? 'green' : 'yellow'}">${escapeHtml(booking.status)}</span>
      </div>
      <div class="hd-info-cards">
        <div class="hd-mini-card"><small>ห้องพัก</small><strong>${escapeHtml(roomSummary || 'ไม่มีข้อมูลห้อง')}</strong></div>
        <div class="hd-mini-card"><small>Check-in</small><strong>${escapeHtml(booking.checkIn)}</strong></div>
        <div class="hd-mini-card"><small>Check-out</small><strong>${escapeHtml(booking.checkOut)}</strong></div>
      </div>
      ${['reception', 'superadmin'].includes(currentStaffSession?.role) ? `<div class="staff-actions booking-detail-actions">
        ${['CONFIRMED', 'LATE_ARRIVAL'].includes(booking.status) ? `<button type="button" class="btn-dark-pill" data-open-settlement="CHECK_IN" data-booking-code="${escapeHtml(booking.bookingCode)}">Check-in</button><button type="button" class="booking-outline" data-stay-action="no-show" data-stay-booking="${booking.id}" data-booking-prefix="${prefix}">No-show</button>` : ''}
        ${booking.status === 'CHECKED_IN' ? `<button type="button" class="btn-dark-pill" data-open-settlement="CHECK_OUT" data-booking-code="${escapeHtml(booking.bookingCode)}">Check-out</button><button type="button" class="booking-outline" data-open-staff-service="${booking.id}" data-booking-prefix="${prefix}">เพิ่มบริการเสริม</button>` : ''}
      </div>` : ''}
      <div class="hd-bottom-grid">
        <div>
          <h5>ห้องที่จอง</h5>
          ${roomLines.join('')}
          ${(booking.rooms || []).map(room => `<div class="cost-line"><span>${escapeHtml(room.roomTypeName)} · ${room.guestCount} คน</span><strong>${room.assignedRoomCode ? `ห้อง ${escapeHtml(room.assignedRoomCode)}` : 'ยังไม่จัดห้อง'}</strong></div>
            ${!room.assignedRoomId && ['reception', 'superadmin'].includes(currentStaffSession?.role) && ['CONFIRMED', 'LATE_ARRIVAL'].includes(booking.status)
              ? `<button type="button" class="booking-outline" data-assign-booking="${booking.id}" data-booking-room="${room.id}" data-room-type="${room.roomTypeId}" data-booking-prefix="${prefix}">จัดห้อง</button>` : ''}`).join('') || '<p>ไม่มีข้อมูลห้อง</p>'}
          <h5>บริการเสริมและทริป</h5>
          ${extras.join('') || '<p>ยังไม่มีบริการเสริมหรือทริป</p>'}
          ${Number(booking.discountTotal) > 0 ? `<div class="cost-line"><span>ส่วนลด</span><strong>−฿${money(Number(booking.discountTotal))}</strong></div>` : ''}
          <div class="cost-total"><span>ยอดรวม</span><strong>฿${money(Number(booking.total))}</strong></div>
          <h5 class="mt-16">ประวัติการชำระเงิน</h5>
          ${paymentLines.join('') || '<p>ยังไม่มีรายการชำระเงิน</p>'}
          <p class="paid-summary">ชำระแล้ว ฿${money(paid)} / ฿${money(total)}${Number(booking.payment?.outstanding || 0) > 0 ? ` · คงเหลือ ฿${money(Number(booking.payment.outstanding))}` : ''}</p>
        </div>
        <div><h5>ลำดับสถานะย้อนหลัง</h5>
          ${timelineItems.length ? `<ul class="timeline-list">${timelineItems.join('')}</ul>` : '<p>ยังไม่มีประวัติสถานะ</p>'}
          <h5 class="mt-16">สถานะปัจจุบัน</h5><p>${escapeHtml(bookingStatusLabels[booking.status] || booking.status)}</p>
          ${booking.canStaffCancelUnpaid && ['reception', 'accounting', 'superadmin', 'executive'].includes(currentStaffSession?.role)
            ? `<button type="button" class="booking-outline" data-cancel-unpaid-booking="${booking.id}" data-booking-prefix="${prefix}">ยกเลิกจอง (ยังไม่ส่งสลิป)</button>` : ''}
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
      const { data: compatible } = await apiFetch(
        `/api/staff/bookings/${assign.dataset.assignBooking}/available-rooms?bookingRoomId=${assign.dataset.bookingRoom}`
      );
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

document.addEventListener('click', event => {
  const button = event.target.closest('[data-open-settlement]');
  if (!button) return;
  const form = $('#reception-payment-form');
  if (!form) return;
  form.elements.bookingCode.value = button.dataset.bookingCode;
  form.elements.settlementAction.value = button.dataset.openSettlement;
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  $('#reception-settlement-preview')?.click();
});

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-cancel-unpaid-booking]');
  if (!button || !window.confirm('ยืนยันยกเลิกการจองนี้? ระบบจะยกเลิกได้เฉพาะรายการที่ไม่มีประวัติชำระหรือส่งสลิป และจะไม่สร้างรายการคืนเงิน')) return;
  button.disabled = true;
  try {
    await apiFetch(`/api/staff/bookings/${button.dataset.cancelUnpaidBooking}/cancel-unpaid`, { method: 'POST', body: JSON.stringify({}) });
    toast('ยกเลิกการจองที่ยังไม่ส่งสลิปแล้ว ไม่มีการสร้างรายการคืนเงิน');
    await renderStaffBookingHistory(currentStaffSession.role);
    if (currentStaffSession.role === 'accounting') await renderAccountingPayments();
  } catch (error) {
    toast(error.message);
    button.disabled = false;
  }
});

const staffServiceForm = $('#staff-service-form');
let staffServiceBooking = null;
let staffServicePrefix = 'rec';

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-open-staff-service]');
  if (!button) return;
  button.disabled = true;
  const status = $('#staff-service-status');
  status.hidden = true;
  try {
    const [{ data: booking }, { data: services }] = await Promise.all([
      apiFetch(`/api/staff/bookings/${button.dataset.openStaffService}`),
      apiFetch('/api/services')
    ]);
    if (booking.status !== 'CHECKED_IN') throw new Error('เพิ่มบริการได้หลัง Check-in เท่านั้น');
    const available = services.filter(service => !service.includedInRoom && !['TOUR', 'ATTRACTION'].includes(service.serviceKind));
    if (!available.length) throw new Error('ไม่มีบริการเสริมที่เปิดใช้งาน');
    staffServiceBooking = booking;
    staffServicePrefix = button.dataset.bookingPrefix || 'rec';
    staffServiceForm.elements.serviceId.replaceChildren(...available.map(service =>
      new Option(`${service.name} · ฿${money(Number(service.defaultRate))}`, service.id)));
    staffServiceForm.elements.bookingRoomId.replaceChildren(...booking.rooms.map(room =>
      new Option(`${room.roomTypeName} · ${room.assignedRoomCode || 'ยังไม่ระบุห้อง'}`, room.id)));
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
    const serviceDate = staffServiceForm.elements.usageDate;
    serviceDate.min = String(booking.checkIn).slice(0, 10);
    serviceDate.max = shiftDay(String(booking.checkOut).slice(0, 10), -1);
    serviceDate.value = today < serviceDate.min ? serviceDate.min : today > serviceDate.max ? serviceDate.max : today;
    staffServiceForm.elements.quantity.value = '1';
    $('#staff-service-dialog').showModal();
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
});

staffServiceForm?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!staffServiceBooking) return;
  const submit = staffServiceForm.querySelector('[type="submit"]');
  const status = $('#staff-service-status');
  const date = staffServiceForm.elements.usageDate.value || null;
  const time = staffServiceForm.elements.startTime.value || null;
  submit.disabled = true;
  status.hidden = true;
  try {
    const { data } = await apiFetch(`/api/staff/bookings/${staffServiceBooking.id}/services`, {
      method: 'POST',
      body: JSON.stringify({
        serviceId: Number(staffServiceForm.elements.serviceId.value),
        bookingRoomId: Number(staffServiceForm.elements.bookingRoomId.value),
        usageDate: date,
        startTime: time,
        quantity: Number(staffServiceForm.elements.quantity.value),
        method: 'CASH',
        idempotencyKey: `STAFF-SERVICE-${staffServiceBooking.id}-${crypto.randomUUID()}`
      })
    });
    $('#staff-service-dialog').close();
    toast(`เพิ่ม${data.serviceName || 'บริการเสริม'}แล้ว ฿${money(Number(data.amount))} · ชำระตอน Check-out`);
    await renderStaffBookingHistory(currentStaffSession?.role || 'reception');
    await loadStaffBookingDetail(staffServiceBooking.id, staffServicePrefix);
  } catch (error) {
    status.textContent = error.message;
    status.hidden = false;
  } finally {
    submit.disabled = false;
  }
});

// เปิดระบบพนักงานและล็อกสิทธิ์เฉพาะฝ่ายนั้น
// เปิด dashboard ตาม role และเริ่มโหลดข้อมูลของแผนกนั้น
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
const roomStatusLabels = {
  AVAILABLE: 'ว่าง', OCCUPIED: 'มีผู้เข้าพัก', NEEDS_CLEANING: 'รอทำความสะอาด', OUT_OF_SERVICE: 'ปิดปรับปรุง'
};
const escapeHtml = value => String(value).replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
})[character]);

// แสดงข้อมูลประเภทห้องที่โหลดจาก GET /api/room-types ในหน้าลูกค้าและหน้าแอดมิน
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

// โหลดประเภทห้อง/ห้องว่าง; API และ SQL อยู่ api/modules/rooms
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

function promptRoomType(current = {}) {
  const name = window.prompt('ชื่อประเภทห้อง', current.name || '');
  if (name === null) return null;
  const capacity = window.prompt('จำนวนผู้เข้าพักสูงสุด', current.capacity ?? '');
  if (capacity === null) return null;
  const pricePerNight = window.prompt('ราคาต่อคืน (บาท)', current.pricePerNight ?? current.price ?? '');
  if (pricePerNight === null) return null;
  const breakfastDailyRate = window.prompt('ราคาอาหารเช้าต่อห้องต่อวัน (บาท)', current.breakfastDailyRate ?? current.breakfastRate ?? '0');
  if (breakfastDailyRate === null) return null;
  return { name: name.trim(), capacity: Number(capacity), pricePerNight: pricePerNight.trim(), breakfastDailyRate: breakfastDailyRate.trim() };
}

$('#create-room-type')?.addEventListener('click', async buttonEvent => {
  const button = buttonEvent.currentTarget;
  const input = promptRoomType();
  if (!input) return;
  button.disabled = true;
  try {
    await apiFetch('/api/staff/room-types', { method: 'POST', body: JSON.stringify(input) });
    await loadRoomCatalog();
    toast('เพิ่มประเภทห้องแล้ว');
  } catch (error) { toast(error.message); }
  finally { button.disabled = false; }
});

$('#room-type-summary-body')?.addEventListener('click', async event => {
  const button = event.target.closest('[data-edit-room-type]');
  if (!button) return;
  const current = rooms.find(room => String(room.id) === button.dataset.editRoomType);
  if (!current) return toast('ไม่พบประเภทห้อง กรุณาโหลดหน้าใหม่');
  const input = promptRoomType(current);
  if (!input) return;
  button.disabled = true;
  try {
    await apiFetch(`/api/staff/room-types/${current.id}`, { method: 'PATCH', body: JSON.stringify(input) });
    await loadRoomCatalog();
    toast('บันทึกประเภทห้องแล้ว');
  } catch (error) { toast(error.message); }
  finally { button.disabled = false; }
});

async function renderSuperadminRoomsApi() {
  const target = $('#superadmin-room-list');
  const roomTypeFilter = $('#superadmin-room-type-filter');
  if (!target || !roomTypeFilter) return;
  target.innerHTML = '<tr><td colspan="5">เลือกประเภทห้องเพื่อดูเลขห้อง</td></tr>';
  try {
    if (roomTypeFilter.options.length === 1) {
      const { data: roomTypes } = await apiFetch('/api/room-types');
      roomTypes.forEach(type => roomTypeFilter.add(new Option(type.name, type.id)));
    }
    const roomTypeId = roomTypeFilter.value;
    if (!roomTypeId) return;

    target.innerHTML = '<tr><td colspan="5">กำลังโหลดห้องจากฐานข้อมูล...</td></tr>';
    const data = await loadAllStaffRooms(roomTypeId);
    target.innerHTML = data.length ? data.map(room => `
      <tr>
        <td><strong>${escapeHtml(room.code)}</strong><small>${escapeHtml(room.area || 'ไม่ระบุพื้นที่')}</small></td>
        <td>${escapeHtml(room.area || '—')}</td>
        <td>${escapeHtml(room.roomTypeName)}</td>
        <td><span class="status-badge ${room.status === 'AVAILABLE' ? 'green' : room.status === 'OUT_OF_SERVICE' ? 'red-soft' : 'yellow'}">${escapeHtml(roomStatusLabels[room.status] || room.status)}</span></td>
        <td><button type="button" class="link-edit" data-edit-superadmin-room="${room.id}">แก้ไขห้อง</button></td>
      </tr>`).join('') : '<tr><td colspan="5">ยังไม่มีห้องในฐานข้อมูล</td></tr>';
  } catch (error) { target.innerHTML = `<tr><td colspan="5">${escapeHtml(error.message)}</td></tr>`; }
}

$('#superadmin-room-type-filter')?.addEventListener('change', renderSuperadminRoomsApi);

async function loadAllStaffRooms(roomTypeId = null) {
  const rooms = [];
  for (let page = 1; page <= 100; page += 1) {
    const params = new URLSearchParams({ page: String(page), limit: '100' });
    if (roomTypeId !== null && roomTypeId !== '') params.set('roomTypeId', roomTypeId);
    const { data } = await apiFetch(`/api/staff/rooms?${params}`);
    rooms.push(...data);
    if (data.length < 100) break;
  }
  return rooms;
}

async function saveRoomCatalog(room, update = false) {
  const { data: roomTypes } = await apiFetch('/api/room-types');
  const choices = roomTypes.map(type => `${type.id}=${type.name}`).join(', ');
  const defaultTypeId = room?.roomTypeId || roomTypes[0]?.id || '';
  const roomTypeId = window.prompt(`รหัสประเภทห้อง (${choices})`, String(defaultTypeId));
  if (roomTypeId === null) return false;
  const code = window.prompt('เลขห้อง', room?.code || '');
  if (code === null) return false;
  const area = window.prompt('พื้นที่/ชั้น (ถ้ามี)', room?.area || '');
  if (area === null) return false;
  const body = { roomTypeId: Number(roomTypeId), code: code.trim(), area: area.trim() || null };
  if (update) body.expectedVersion = Number(room.statusVersion);
  await apiFetch(update ? `/api/staff/rooms/${room.id}` : '/api/staff/rooms', {
    method: update ? 'PATCH' : 'POST', body: JSON.stringify(body)
  });
  await renderSuperadminRoomsApi();
  return true;
}

$('#create-room')?.addEventListener('click', async event => {
  const button = event.currentTarget;
  button.disabled = true;
  try { if (await saveRoomCatalog()) toast('เพิ่มห้องแล้ว'); }
  catch (error) { toast(error.message); }
  finally { button.disabled = false; }
});

$('#superadmin-room-list')?.addEventListener('click', async event => {
  const button = event.target.closest('[data-edit-superadmin-room]');
  if (!button) return;
  button.disabled = true;
  try {
    const data = await loadAllStaffRooms($('#superadmin-room-type-filter').value);
    const room = data.find(item => String(item.id) === button.dataset.editSuperadminRoom);
    if (!room) throw new Error('ไม่พบห้อง กรุณาโหลดหน้าใหม่');
    if (await saveRoomCatalog(room, true)) toast('บันทึกข้อมูลห้องแล้ว');
  } catch (error) { toast(error.message); }
  finally { button.disabled = false; }
});

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
const reviewPromptedBookingIds = new Set();
let reviewPromptCheckInFlight = false;
let reviewPromptShownThisSession = false;

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

// คำนวณยอดเพื่อแสดงในฟอร์มเท่านั้น; การคิดราคาและบันทึกยอดจริงอยู่ฝั่ง API
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
  const promotionCodes = ($('#booking-promotion-codes')?.value || '')
    .split(',').map(code => code.trim().toUpperCase()).filter(Boolean);
  if (promotionCodes.length > 10 || new Set(promotionCodes).size !== promotionCodes.length) {
    bookingError.textContent = promotionCodes.length > 10
      ? 'ใส่รหัสโปรโมชันได้ไม่เกิน 10 รหัส'
      : 'มีรหัสโปรโมชันซ้ำ กรุณาตรวจสอบอีกครั้ง';
    bookingError.hidden = false;
    return;
  }
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
        promotionCodes,
        paymentChoice: bookingForm.elements.payment_choice.value
      })
    });
    $('#booking-dialog').close();
    bookingForm.reset();
    toast(`สร้างใบจอง ${data.bookingCode} สำเร็จ · ส่วนลด ฿${money(Number(data.discountTotal))} · ยอดที่ต้องชำระ ฿${money(Number(data.paymentDue))}`);
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
  reviewPromptedBookingIds.clear();
  reviewPromptShownThisSession = false;
  bookingsButton.hidden = false;
  customerProfile.hidden = false;
  customerLoginButton.hidden = true;
  employeeLoginButton.hidden = true;
  renderCustomerProfile(principal);
  closeCustomerProfileMenu();
  promptForPendingCheckoutReview();
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
let myBookingsRefreshInFlight = false;

// แสดงรายการจองลูกค้าและการกระทำต่อรายการ; ข้อมูลอ่านจาก Booking API
function renderMyBookings(bookings, focusReviewBookingId = null) {
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
    const canCancelTours = ['PENDING_PAYMENT', 'PAYMENT_REVIEW', 'CONFIRMED', 'LATE_ARRIVAL', 'CHECKED_IN'].includes(effectiveStatus);
    const extras = [
      ...(booking.services || []).filter(item => item.status === 'SELECTED').map(item => {
        return `<li><strong>${escapeHtml(item.name)}</strong> · ${item.quantity} คน · ${String(item.startTime || '').slice(0, 5)} น. · ${money(Number(item.amount))} บาท</li>`;
      }),
      ...(booking.tours || []).map(item =>
        `<li><strong>${escapeHtml(item.name)}</strong>${item.participantName ? ` · ${escapeHtml(item.participantName)}` : ''} · ${escapeHtml(item.location || '')} · ${String(item.startTime || '').slice(0, 5)} น. · ฟรี${canCancelTours
          ? ` <button type="button" class="booking-outline" data-cancel-tour="${Number(item.id)}" data-cancel-tour-booking="${Number(booking.id)}">ยกเลิกที่นั่งนี้</button>` : ''}</li>`)
    ];
    const extrasBlock = extras.length
      ? `<div class="booking-extras"><strong>บริการและทริปที่จอง</strong><ul>${extras.join('')}</ul></div>`
      : '';
    const refundStatuses = {
      PENDING: 'ส่งคำขอคืนเงินแล้ว · รอฝ่ายบริหารอนุมัติ',
      APPROVED: 'ฝ่ายบริหารอนุมัติแล้ว · รอจ่ายคืน',
      REJECTED: 'คำขอคืนเงินไม่ผ่านการอนุมัติ',
      COMPLETED: 'คืนเงินเรียบร้อยแล้ว'
    };
    const refundsBlock = (booking.refunds || []).length
      ? `<div class="booking-refunds"><strong>สถานะการคืนเงิน</strong>${booking.refunds.map(refund => `
          <p>฿${money(Number(refund.amount))} · ${refundStatuses[refund.status] || escapeHtml(refund.status)}</p>
          ${refund.rejectionReason ? `<small>เหตุผล: ${escapeHtml(refund.rejectionReason)}</small>` : ''}
        `).join('')}</div>`
      : '';
    const promotionBlock = Number(booking.discountTotal) > 0
      ? `<div class="booking-extras"><strong>โปรโมชัน ${escapeHtml(booking.promotionCodes || '')}</strong><p>ส่วนลด ฿${money(Number(booking.discountTotal))}</p></div>`
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
        ${promotionBlock}
        <dl class="booking-amounts">
          <div><dt>ยอดรวมจากระบบ</dt><dd>${money(Number(booking.total))} บาท</dd></div>
          <div><dt>ชำระแล้ว</dt><dd>${money(Number(booking.payment.paid))} บาท</dd></div>
          <div><dt>ยอดคงเหลือ</dt><dd>${money(Number(booking.payment.outstanding))} บาท</dd></div>
        </dl>
        ${refundsBlock}
        ${effectiveStatus === 'CHECKED_IN' ? `<div class="staff-actions booking-service-actions">
          <button type="button" class="booking-outline" data-booking-facility="fitness" data-booking-id="${booking.id}">จองฟิตเนส</button>
          <button type="button" class="booking-outline" data-booking-facility="sauna" data-booking-id="${booking.id}">จองซาวน่า</button>
        </div>` : ''}
        ${paymentForm}
        ${['PENDING_PAYMENT', 'PAYMENT_REVIEW', 'CONFIRMED', 'LATE_ARRIVAL'].includes(effectiveStatus)
          ? `<button type="button" class="booking-outline" data-cancel-booking="${booking.id}" data-cancel-payment-review="${effectiveStatus === 'PAYMENT_REVIEW'}">ยกเลิกการจอง</button>` : ''}
        ${booking.status === 'CHECKED_OUT' && !booking.review ? `
          <form data-create-review="${booking.id}" class="login-form-body">
            <label>คะแนน<select name="rating"><option value="5">5 ดาว</option><option value="4">4 ดาว</option><option value="3">3 ดาว</option><option value="2">2 ดาว</option><option value="1">1 ดาว</option></select></label>
            <label>รีวิว<textarea name="content" maxlength="2000" required></textarea></label>
            <button type="submit" class="booking-outline">ส่งรีวิว</button>
          </form>` : ''}
      </article>`;
  }).join('') : '<p>ยังไม่มีรายการจอง</p>';
  if (focusReviewBookingId !== null) {
    const reviewForm = myBookingsList.querySelector(`[data-create-review="${focusReviewBookingId}"]`);
    if (reviewForm) {
      reviewForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
      reviewForm.elements.rating.focus({ preventScroll: true });
    }
  }
}

async function openMyBookings({ focusReviewBookingId = null } = {}) {
  if (!customerEmail) return;
  if (myBookingsRefreshInFlight) return;
  myBookingsRefreshInFlight = true;
  if (!$('#my-bookings-dialog').open) $('#my-bookings-dialog').showModal();
  if (!myBookingsList.childElementCount) myBookingsList.innerHTML = '<p>กำลังโหลดรายการจองจากฐานข้อมูล...</p>';
  try {
    const { data } = await apiFetch('/api/bookings/mine?limit=50');
    const bookings = await Promise.all(data.map(item =>
      apiFetch(`/api/bookings/${item.id}`).then(result => result.data)
    ));
    renderMyBookings(bookings, focusReviewBookingId);
  } catch (error) {
    myBookingsList.innerHTML = `<p class="login-error-text">${escapeHtml(error.message)}</p>`;
  } finally {
    myBookingsRefreshInFlight = false;
  }
}

async function promptForPendingCheckoutReview() {
  if (!customerEmail || reviewPromptCheckInFlight || reviewPromptShownThisSession) return;
  reviewPromptCheckInFlight = true;
  try {
    const { data: bookings } = await apiFetch('/api/bookings/mine?limit=50');
    const completed = bookings.find(booking =>
      booking.status === 'CHECKED_OUT'
      && !reviewPromptedBookingIds.has(Number(booking.id))
    );
    if (!completed) return;

    const { data: booking } = await apiFetch(`/api/bookings/${completed.id}`);
    if (booking.status !== 'CHECKED_OUT' || booking.review) {
      reviewPromptedBookingIds.add(Number(completed.id));
      return;
    }
    reviewPromptedBookingIds.add(Number(completed.id));
    reviewPromptShownThisSession = true;
    await openMyBookings({ focusReviewBookingId: Number(completed.id) });
  } catch (error) {
    if (error.status !== 401) console.error('Checkout review prompt failed');
  } finally {
    reviewPromptCheckInFlight = false;
  }
}

myBookingsList.addEventListener('click', async event => {
  const button = event.target.closest('[data-cancel-booking], [data-cancel-booking-service], [data-cancel-tour]');
  if (!button) return;
  const cancelBooking = button.hasAttribute('data-cancel-booking');
  const cancelService = button.hasAttribute('data-cancel-booking-service');
  const confirmMessage = cancelBooking && button.dataset.cancelPaymentReview === 'true'
    ? 'ยืนยันยกเลิกการจอง? หลักฐานโอนที่ส่งแล้วจะยังอยู่ในคิวบัญชี หากตรวจพบว่าได้รับเงินจริง ฝ่ายบัญชีจะดำเนินการคืนเงิน'
    : cancelBooking
    ? 'ยืนยันยกเลิกการจองทั้งหมดหรือไม่?'
    : cancelService
      ? 'ยืนยันยกเลิกบริการเสริมรายการนี้ทั้งหมดหรือไม่?'
      : 'ยืนยันยกเลิกที่นั่งทัวร์ของผู้เข้าร่วมรายนี้หรือไม่?';
  if (!window.confirm(confirmMessage)) return;
  button.disabled = true;
  try {
    const endpoint = cancelBooking
      ? `/api/bookings/${button.dataset.cancelBooking}/cancel`
      : cancelService
        ? `/api/bookings/${button.dataset.cancelServiceBooking}/services/${button.dataset.cancelBookingService}/cancel`
        : `/api/bookings/${button.dataset.cancelTourBooking}/tours/${button.dataset.cancelTour}/cancel`;
    await apiFetch(endpoint, {
      method: 'POST',
      body: JSON.stringify({ reason: 'ลูกค้ายกเลิกผ่านหน้าเว็บไซต์' })
    });
    toast(cancelBooking ? 'ยกเลิกการจองแล้ว' : cancelService ? 'ยกเลิกบริการเสริมแล้ว' : 'ยกเลิกที่นั่งทัวร์แล้ว');
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
let preferredFacilityBookingId = null;

document.addEventListener('click', event => {
  const button = event.target.closest('[data-booking-facility]');
  if (!button) return;
  preferredFacilityBookingId = Number(button.dataset.bookingId);
  document.querySelector(`[data-facility="${button.dataset.bookingFacility}"]`)?.click();
});

// โหลดตัวเลือกบริการ/ทริปของลูกค้า; แก้กติกาบันทึกใน api/modules/services หรือ tours
async function facilityBookingOptions(kind) {
  const { data } = await apiFetch('/api/bookings/mine?limit=50');
  const details = await Promise.all(data.map(item => apiFetch(`/api/bookings/${item.id}`).then(result => result.data)));
  const allowed = tourFacilityKinds.has(kind)
    ? ['PENDING_PAYMENT', 'PAYMENT_REVIEW', 'CONFIRMED', 'LATE_ARRIVAL', 'CHECKED_IN']
    : ['PENDING_PAYMENT', 'CONFIRMED', 'LATE_ARRIVAL', 'CHECKED_IN'];
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
  const destination = round.name.replace(/^(?:ชมพระอาทิตย์ตก|เที่ยวตลาดกลางคืน)\s*-\s*/, '');
  return destination || (activeFacilityContext.kind === 'market' ? 'ตลาดกลางคืน' : '');
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
    : `ไม่เกิน ${money(Number(activeFacilityContext?.service?.defaultRate || 0) * quantity)} บาท`;
  $('#facility-status').textContent = round
    ? `${tourFacilityKinds.has(activeFacilityContext.kind) ? 'ทริปฟรี' : `สิทธิ์ตลอดการเข้าพัก ${money(Number(activeFacilityContext.service.defaultRate))} บาท/คน`} · เลือกได้สูงสุด ${maximum} คน · ${total}`
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
      if (preferredFacilityBookingId !== null) {
        const preferred = bookings.find(item => item.bookingId === preferredFacilityBookingId);
        if (preferred) facilityForm.elements.booking_room.value = preferred.value;
        preferredFacilityBookingId = null;
      }
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
    : `ไม่เกิน ${money(Number(activeFacilityContext.service.defaultRate) * Number(selected.get('guests')))} บาท (ซื้อสิทธิ์ครั้งเดียว)`;
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
  const confirmButton = event.currentTarget;
  const isTour = tourFacilityKinds.has(activeFacilityContext.kind);
  let serviceResult = null;
  confirmButton.disabled = true;
  try {
    if (isTour) {
      await apiFetch(`/api/bookings/${selected.bookingId}/tours/party`, {
        method: 'POST',
        body: JSON.stringify({
          tourRoundId: Number(facilityForm.elements.time.value),
          bookingRoomId: selected.bookingRoomId,
          quantity: Number(facilityForm.elements.guests.value)
        })
      });
    } else {
      serviceResult = await apiFetch(`/api/bookings/${selected.bookingId}/services`, {
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
    toast(isTour
      ? 'จองทริปฟรีเรียบร้อยแล้ว'
      : `บันทึกรอบแล้ว · เพิ่มยอด ฿${money(Number(serviceResult.data.amount))} · สิทธิ์ ${serviceResult.data.passQuantity} คน ชำระตอน Check-out`);
  } catch (error) {
    facilityReview.hidden = true;
    facilityForm.hidden = false;
    $('#facility-status').textContent = error.message;
    facilityForm.elements.time.focus();
  } finally { confirmButton.disabled = false; }
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

// ตารางรายการรับชำระของฝ่ายบัญชี; การดึง/อนุมัติอยู่ api/modules/payments และตาราง Payment
async function renderAccountingPayments() {
  const countTarget = $('#accounting-payment-count');
  accountingPayments.innerHTML = '<tr><td colspan="7">กำลังโหลดธุรกรรมจากฐานข้อมูล...</td></tr>';
  try {
    const [submitted, verified] = await Promise.all([
      apiFetch('/api/accounting/payments?status=SUBMITTED&page=1&limit=100'),
      apiFetch('/api/accounting/payments?status=VERIFIED&page=1&limit=100')
    ]);
    accountingQueue = [...submitted.data, ...verified.data];
    const totalCount = Number(submitted.meta.total || 0) + Number(verified.meta.total || 0);
    if (countTarget) countTarget.textContent = `แสดง ${accountingQueue.length.toLocaleString('th-TH')} จาก ${totalCount.toLocaleString('th-TH')} รายการ`;
    const pendingTotal = submitted.data.reduce((sum, item) => sum + Number(item.amount), 0);
    $('#accounting-pending-total').textContent = `฿${money(pendingTotal)}`;
    $('#accounting-pending-count').textContent = `${submitted.meta.total} ธุรกรรม`;
    accountingPayments.innerHTML = accountingQueue.length ? accountingQueue.map(payment => `
      <tr>
        <td><strong>PAY-${payment.id}</strong></td>
        <td><strong>${escapeHtml(payment.booking.code)}</strong><small>${escapeHtml(payment.booking.status)}</small></td>
        <td>${escapeHtml(payment.customer.name)}<small>${escapeHtml(payment.customer.email || '')}</small></td>
        <td>${escapeHtml(payment.transactionType)}</td>
        <td>${payment.method === 'BANK_TRANSFER' ? 'โอนธนาคาร' : payment.method === 'CARD' ? 'บัตร' : payment.method === 'CASH' ? 'เงินสด' : escapeHtml(payment.method || '-')}</td>
        <td><strong>฿${money(Number(payment.amount))}</strong></td>
        <td>${payment.status === 'SUBMITTED'
          ? `<button type="button" class="status-badge yellow" data-review-payment="${payment.id}">ตรวจหลักฐาน · รอตรวจ</button>`
          : `<button type="button" class="booking-outline" data-request-refund="${payment.id}" data-payment-amount="${payment.amount}">ขอคืนเงิน</button>`}</td>
      </tr>`).join('') : '<tr><td colspan="7">ไม่มีรายการชำระเงิน</td></tr>';
  } catch (error) {
    if (countTarget) countTarget.textContent = 'โหลดจำนวนรายการไม่สำเร็จ';
    accountingPayments.innerHTML = `<tr><td colspan="7">${escapeHtml(error.message)}</td></tr>`;
  }
}

const accountingPaymentsCard = $('#accounting-payments-card');
const accountingPaymentsExpand = $('#toggle-accounting-payments-fullscreen');
function setAccountingPaymentsExpanded(expanded) {
  accountingPaymentsCard?.classList.toggle('is-expanded', expanded);
  if (accountingPaymentsExpand) {
    accountingPaymentsExpand.setAttribute('aria-expanded', String(expanded));
    accountingPaymentsExpand.textContent = expanded ? 'ย่อกลับ' : 'ขยายเต็มจอ';
  }
  document.body.classList.toggle('accounting-payments-expanded', expanded);
}
accountingPaymentsExpand?.addEventListener('click', () => {
  setAccountingPaymentsExpanded(!accountingPaymentsCard?.classList.contains('is-expanded'));
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && accountingPaymentsCard?.classList.contains('is-expanded')) {
    setAccountingPaymentsExpanded(false);
  }
});

$('#refresh-accounting-payments')?.addEventListener('click', async event => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    await renderAccountingPayments();
    await renderFinancialSummary('accounting-financial-summary');
  } finally {
    button.disabled = false;
  }
});

setInterval(() => {
  if (currentStaffSession?.role === 'accounting' && !$('#panel-accounting')?.hidden && !document.hidden) {
    renderAccountingPayments();
  }
}, 15000);

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

// รายการโปรโมชันฝ่ายบริหาร; คำสั่งอ่าน/บันทึก MySQL อยู่ api/modules/promotions (Promotion)
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
        <button type="button" class="link-edit" data-edit-promotion="${item.id}">แก้ไขโปรโมชัน</button>
      </div>`).join('') : '<p>ยังไม่มีโปรโมชั่น</p>';
  } catch (error) { target.innerHTML = `<p>${escapeHtml(error.message)}</p>`; }
}

function promptAttraction(current = {}) {
  const inferredType = current.name?.startsWith('ชมพระอาทิตย์ตก - ')
    ? '1' : current.name?.startsWith('เที่ยวตลาดกลางคืน - ') || current.name === 'เที่ยวตลาดกลางคืน' ? '2' : '';
  const typeText = window.prompt('ประเภททริป\n1 = ชมพระอาทิตย์ตก\n2 = ตลาดกลางคืน', inferredType);
  if (typeText === null) return null;
  const tripType = typeText.trim() === '1' ? 'SUNSET' : typeText.trim() === '2' ? 'NIGHT_MARKET' : null;
  if (!tripType) throw new Error('เลือกประเภททริปเป็น 1 (ชมพระอาทิตย์ตก) หรือ 2 (ตลาดกลางคืน)');
  const previousDestination = current.name?.replace(/^(ชมพระอาทิตย์ตก|เที่ยวตลาดกลางคืน)\s*-\s*/, '') || '';
  const destinationName = window.prompt('ชื่อสถานที่ที่จะไป', previousDestination);
  if (destinationName === null) return null;
  if (!destinationName.trim()) throw new Error('กรุณาระบุชื่อสถานที่');
  const description = window.prompt('รายละเอียด', current.description || '');
  if (description === null) return null;
  const season = window.prompt('ฤดูกาล/ช่วงเวลา (ถ้ามี)', current.season || '');
  if (season === null) return null;
  const imageReference = window.prompt('ชื่อไฟล์หรือ URL รูปภาพ (ถ้ามี)', current.imageReference || '');
  if (imageReference === null) return null;
  const existingSchedule = typeof current.schedule === 'string'
    ? (() => { try { return JSON.parse(current.schedule); } catch { return {}; } })()
    : current.schedule || {};
  const schedule = {
    ...existingSchedule,
    location: destinationName.trim(),
    times: tripType === 'SUNSET'
      ? ['15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30']
      : ['19:30', '20:00', '20:30'],
    capacity: Number.isSafeInteger(existingSchedule.capacity) ? existingSchedule.capacity : 10
  };
  const visibleText = window.prompt('การแสดงบนหน้าเว็บ (แสดง/ซ่อน)', current.visible === false ? 'ซ่อน' : 'แสดง');
  if (visibleText === null) return null;
  if (!['แสดง', 'ซ่อน'].includes(visibleText.trim())) throw new Error('เลือก “แสดง” หรือ “ซ่อน” เท่านั้น');
  const activeText = window.prompt('สถานะข้อมูล (เปิด/ปิด)', current.active === false ? 'ปิด' : 'เปิด');
  if (activeText === null) return null;
  if (!['เปิด', 'ปิด'].includes(activeText.trim())) throw new Error('เลือก “เปิด” หรือ “ปิด” เท่านั้น');
  return {
    tripType, destinationName: destinationName.trim(),
    name: `${tripType === 'SUNSET' ? 'ชมพระอาทิตย์ตก' : 'เที่ยวตลาดกลางคืน'} - ${destinationName.trim()}`,
    description: description.trim() || null, season: season.trim() || null,
    imageReference: imageReference.trim() || null, schedule,
    visible: visibleText.trim() === 'แสดง', active: activeText.trim() === 'เปิด'
  };
}

async function renderSuperadminAttractions() {
  const target = $('#superadmin-activity-list');
  if (!target) return;
  target.innerHTML = '<p>กำลังโหลดสถานที่ท่องเที่ยวจากฐานข้อมูล...</p>';
  try {
    const { data } = await apiFetch('/api/staff/attractions');
    target.innerHTML = data.length ? data.map(item => `
      <div class="facility-admin-item">
        <div class="fa-icon bg-cyan" aria-hidden="true">📍</div>
        <div class="fa-info"><strong>${escapeHtml(item.name)}</strong><span>${item.serviceKind === 'TOUR' ? (item.name.startsWith('ชมพระอาทิตย์ตก') ? 'ทริปชมพระอาทิตย์ตก' : 'ทริปตลาดกลางคืน') : 'สถานที่ท่องเที่ยว'}${item.season ? ` · ${escapeHtml(item.season)}` : ''}</span></div>
        <span class="status-badge ${item.active && item.visible ? 'green' : 'yellow'}">${item.active && item.visible ? 'เปิดแสดง' : 'ปิด/ซ่อน'}</span>
        <button type="button" class="link-edit" data-edit-attraction="${item.id}">แก้ไข</button>
      </div>`).join('') : '<p>ยังไม่มีสถานที่ท่องเที่ยวในฐานข้อมูล</p>';
  } catch (error) { target.innerHTML = `<p>${escapeHtml(error.message)}</p>`; }
}

$('#create-attraction')?.addEventListener('click', async event => {
  const button = event.currentTarget;
  try {
    const input = promptAttraction();
    if (!input) return;
    button.disabled = true;
    await apiFetch('/api/staff/attractions', { method: 'POST', body: JSON.stringify(input) });
    await renderSuperadminAttractions();
    toast('เพิ่มสถานที่ท่องเที่ยวแล้ว');
  } catch (error) { toast(error.message); }
  finally { button.disabled = false; }
});

$('#superadmin-activity-list')?.addEventListener('click', async event => {
  const button = event.target.closest('[data-edit-attraction]');
  if (!button) return;
  button.disabled = true;
  try {
    const { data } = await apiFetch('/api/staff/attractions');
    const current = data.find(item => String(item.id) === button.dataset.editAttraction);
    if (!current) throw new Error('ไม่พบสถานที่นี้ กรุณาโหลดรายการใหม่');
    const input = promptAttraction(current);
    if (!input) return;
    await apiFetch(`/api/staff/attractions/${current.id}`, { method: 'PATCH', body: JSON.stringify(input) });
    await renderSuperadminAttractions();
    toast('บันทึกสถานที่ท่องเที่ยวแล้ว');
  } catch (error) { toast(error.message); }
  finally { button.disabled = false; }
});

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

$('#executive-promotion-list')?.addEventListener('click', async event => {
  const button = event.target.closest('[data-edit-promotion]');
  if (!button) return;

  button.disabled = true;
  try {
    const { data } = await apiFetch('/api/staff/promotions');
    const promotion = data.find(item => String(item.id) === button.dataset.editPromotion);
    if (!promotion) throw new Error('ไม่พบโปรโมชันนี้แล้ว กรุณาโหลดรายการใหม่');

    const code = window.prompt('รหัสโปรโมชัน', promotion.code);
    if (code === null) return;
    const name = window.prompt('ชื่อโปรโมชัน', promotion.name);
    if (name === null) return;
    const discountPercent = window.prompt('เปอร์เซ็นต์ส่วนลด', promotion.discountPercent);
    if (discountPercent === null) return;
    const priorityValue = window.prompt('ลำดับการใช้ (ตัวเลข)', String(promotion.priority));
    if (priorityValue === null) return;
    const validFrom = window.prompt('เริ่มใช้ (วันเวลา ISO; เว้นว่างถ้าไม่กำหนด)', promotion.validFrom || '');
    if (validFrom === null) return;
    const validUntil = window.prompt('สิ้นสุด (วันเวลา ISO; เว้นว่างถ้าไม่กำหนด)', promotion.validUntil || '');
    if (validUntil === null) return;
    const activeValue = window.prompt('สถานะโปรโมชัน (เปิด/ปิด)', promotion.active ? 'เปิด' : 'ปิด');
    if (activeValue === null) return;
    if (!['เปิด', 'ปิด'].includes(activeValue.trim())) throw new Error('สถานะต้องเป็น “เปิด” หรือ “ปิด”');

    await apiFetch(`/api/staff/promotions/${promotion.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        code,
        name,
        discountPercent,
        priority: Number(priorityValue),
        validFrom: validFrom.trim() || null,
        validUntil: validUntil.trim() || null,
        active: activeValue.trim() === 'เปิด'
      })
    });
    await renderPromotions();
    toast('บันทึกการแก้ไขโปรโมชันแล้ว');
  } catch (error) {
    toast(error.message);
  } finally { button.disabled = false; }
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

async function loadAllAccountingPayments() {
  const payments = [];
  for (let page = 1; page <= 100; page += 1) {
    const response = await apiFetch(`/api/accounting/payments?page=${page}&limit=100`);
    payments.push(...response.data);
    if (response.data.length < 100) break;
  }
  return payments;
}

async function renderExecutivePayments() {
  const target = $('#executive-payment-list');
  if (!target) return;
  target.innerHTML = '<tr><td colspan="6">กำลังโหลดธุรกรรมจากฐานข้อมูล...</td></tr>';
  try {
    const payments = await loadAllAccountingPayments();
    const transactionLabels = {
      DEPOSIT: 'มัดจำ', FULL_PAYMENT: 'ชำระเต็ม', BALANCE_PAYMENT: 'ยอดคงเหลือ',
      SERVICE_PAYMENT: 'บริการเสริม', REFUND_REQUEST: 'คำขอคืนเงิน', REFUND_PAYOUT: 'จ่ายคืน'
    };
    const statusLabels = { SUBMITTED: 'รอตรวจสอบ', VERIFIED: 'ตรวจสอบแล้ว', APPROVED: 'อนุมัติ', REJECTED: 'ไม่อนุมัติ', COMPLETED: 'เสร็จสิ้น' };
    target.innerHTML = payments.length ? payments.map(payment => `
      <tr>
        <td><strong>PAY-${payment.id}</strong></td>
        <td><strong>${escapeHtml(payment.booking.code)}</strong><small>${escapeHtml(payment.booking.status)}</small></td>
        <td>${escapeHtml(payment.customer.name)}</td>
        <td>${transactionLabels[payment.transactionType] || escapeHtml(payment.transactionType)}</td>
        <td><strong>${payment.direction === 'OUT' ? '−' : ''}฿${money(Number(payment.amount))}</strong></td>
        <td><span class="status-badge ${['VERIFIED', 'APPROVED', 'COMPLETED'].includes(payment.status) ? 'green' : payment.status === 'REJECTED' ? 'red-soft' : 'yellow'}">${statusLabels[payment.status] || escapeHtml(payment.status)}</span></td>
      </tr>`).join('') : '<tr><td colspan="6">ยังไม่มีธุรกรรมในฐานข้อมูล</td></tr>';
  } catch (error) { target.innerHTML = `<tr><td colspan="6">${escapeHtml(error.message)}</td></tr>`; }
}

function csvCell(value) {
  const safe = String(value ?? '').replace(/^[=+@-]/, "'$&");
  return `"${safe.replaceAll('"', '""')}"`;
}

$('#export-executive-report')?.addEventListener('click', async event => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const payments = await loadAllAccountingPayments();
    const rows = [
      ['เลขรายการ', 'รหัสการจอง', 'ลูกค้า', 'ประเภทธุรกรรม', 'ทิศทาง', 'วิธีชำระ', 'ยอดเงิน', 'สถานะ', 'วันที่ส่งรายการ'],
      ...payments.map(payment => [
        `PAY-${payment.id}`, payment.booking.code, payment.customer.name, payment.transactionType,
        payment.direction === 'OUT' ? 'จ่ายออก' : 'รับเข้า', payment.method || '', payment.amount,
        payment.status, payment.submittedAt || ''
      ])
    ];
    const csv = `\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `tkc-payment-report-${today}.csv`;
    link.style.display = 'none';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) { toast(`ส่งออกรายงานไม่สำเร็จ: ${error.message}`); }
  finally { button.disabled = false; }
});

async function renderDashboardSummary() {
  try {
    const { data } = await apiFetch('/api/staff/dashboard-summary');
    for (const element of document.querySelectorAll('[data-dashboard-stat]')) {
      const key = element.dataset.dashboardStat;
      if (key === 'occupancyPercent') element.textContent = `${data.occupancyPercent}%`;
      else if (key === 'checkedInRooms') element.textContent = `${data.checkedInRooms} ห้อง`;
      else if (key === 'arrivalsDueRooms') element.textContent = `${data.arrivalsDueRooms} ห้องรอเช็คอิน`;
      else if (key === 'activitiesToday') element.textContent = `${data.activitiesToday} รายการ`;
      else if (key === 'toursToday') element.textContent = `${data.toursToday} ทริปวันนี้`;
      else if (key === 'monthlyNetRevenue') element.textContent = `฿${money(Number(data.monthlyNetRevenue))}`;
    }
  } catch (error) {
    for (const element of document.querySelectorAll('[data-dashboard-stat]')) element.textContent = 'โหลดไม่สำเร็จ';
    toast(`โหลดตัวเลขสรุปไม่สำเร็จ: ${error.message}`);
  }
}

// แสดงยอดก่อน Check-in/Check-out; การรับเงินจริงและเปลี่ยนสถานะอยู่ API ฝั่ง server
async function previewReceptionSettlement() {
  const form = $('#reception-payment-form');
  const summary = $('#reception-settlement-summary');
  const roomChoices = $('#reception-settlement-room-choices');
  $('#reception-payment-result').textContent = '';
  const bookingCode = form.elements.bookingCode.value.trim().toUpperCase();
  const action = form.elements.settlementAction.value;
  delete form.dataset.bookingId;
  delete form.dataset.previewSignature;
  delete form.dataset.amountDue;
  roomChoices.replaceChildren();
  roomChoices.hidden = true;
  setSettlementPaymentVisible(false);
  $('#reception-settlement-submit').textContent = 'ยืนยันและเปลี่ยนสถานะ';
  if (!bookingCode) {
    summary.innerHTML = '<span>กรุณากรอกรหัสการจอง</span>';
    return null;
  }
  summary.innerHTML = '<span>กำลังตรวจสอบข้อมูล...</span>';
  try {
    const { data } = await apiFetch(`/api/staff/settlements/preview?bookingCode=${encodeURIComponent(bookingCode)}&action=${action}`);
    form.dataset.bookingId = data.id;
    form.dataset.previewSignature = `${bookingCode}|${action}`;
    form.dataset.amountDue = String(Number(data.amountDue));
    summary.innerHTML = `
      <div><small>ลูกค้า</small><strong>${escapeHtml(data.customer.name)}</strong></div>
      <div><small>ห้อง</small><strong>${data.rooms.map(room => `${escapeHtml(room.roomType)} · ${escapeHtml(room.roomCode || 'ยังไม่จัดห้อง')}`).join(', ')}</strong></div>
      <div><small>${action === 'CHECK_IN' ? 'ค่าห้องคงเหลือ' : 'ค่าบริการเสริม'}</small><strong>฿${money(Number(data.amountDue))}</strong></div>`;
    await renderSettlementRoomChoices(data, action);
    const hasPaymentDue = Number(data.amountDue) > 0;
    setSettlementPaymentVisible(hasPaymentDue);
    $('#reception-settlement-submit').textContent = hasPaymentDue
      ? `รับชำระและยืนยัน ${action === 'CHECK_IN' ? 'Check-in' : 'Check-out'}`
      : `ยืนยัน ${action === 'CHECK_IN' ? 'Check-in' : 'Check-out'}`;
    return data;
  } catch (error) {
    delete form.dataset.bookingId;
    delete form.dataset.previewSignature;
    delete form.dataset.amountDue;
    summary.innerHTML = `<span class="login-error-text">${escapeHtml(error.message)}</span>`;
    return null;
  }
}

function setSettlementPaymentVisible(visible) {
  const fields = $('#reception-settlement-payment-fields');
  fields.hidden = !visible;
  fields.querySelectorAll('input, select').forEach(field => {
    field.disabled = !visible;
    field.required = visible;
  });
}

async function renderSettlementRoomChoices(booking, action) {
  const container = $('#reception-settlement-room-choices');
  if (action !== 'CHECK_IN') return;
  const roomsToChoose = booking.rooms.filter(room => !room.id || room.status !== 'AVAILABLE');
  if (!roomsToChoose.length) return;
  const alreadyAssignedRoomIds = new Set(booking.rooms
    .filter(room => room.id && room.status === 'AVAILABLE')
    .map(room => Number(room.id)));

  container.hidden = false;
  const heading = document.createElement('strong');
  heading.textContent = 'เลือกห้องว่างก่อน Check-in';
  container.append(heading);

  for (const bookedRoom of roomsToChoose) {
    let available = [];
    let availabilityError = null;
    try {
      const response = await apiFetch(`/api/staff/bookings/${booking.id}/available-rooms?bookingRoomId=${bookedRoom.bookingRoomId}`);
      available = response.data;
    } catch (error) {
      availabilityError = error.message;
    }

    const label = document.createElement('label');
    label.textContent = `${bookedRoom.roomType} · ${bookedRoom.guestCount} คน`;
    const selectableRooms = available.filter(room => !alreadyAssignedRoomIds.has(Number(room.id)));
    const select = document.createElement('select');
    select.dataset.bookingRoomId = String(bookedRoom.bookingRoomId);
    select.required = true;
    const emptyOption = availabilityError
      ? `โหลดห้องว่างไม่ได้: ${availabilityError}`
      : selectableRooms.length ? 'เลือกห้องว่าง' : 'ไม่มีห้องว่างประเภทนี้';
    select.add(new Option(emptyOption, ''));
    for (const room of selectableRooms) {
      select.add(new Option(`${room.code}${room.area ? ` · ${room.area}` : ''}`, String(room.id)));
    }
    select.disabled = !selectableRooms.length;
    label.append(select);
    container.append(label);
  }
}

$('#reception-settlement-preview')?.addEventListener('click', previewReceptionSettlement);
$('#reception-payment-form')?.addEventListener('change', event => {
  if (['bookingCode', 'settlementAction'].includes(event.target.name)) {
    delete event.currentTarget.dataset.bookingId;
    delete event.currentTarget.dataset.previewSignature;
    delete event.currentTarget.dataset.amountDue;
    delete event.currentTarget.dataset.paymentKey;
    delete event.currentTarget.dataset.paymentSignature;
    event.currentTarget.elements.proof.value = '';
    $('#reception-settlement-room-choices').replaceChildren();
    $('#reception-settlement-room-choices').hidden = true;
    $('#reception-settlement-summary').innerHTML = '<span>กรอกรหัสการจองแล้วกดตรวจสอบยอด</span>';
    $('#reception-payment-result').textContent = '';
    setSettlementPaymentVisible(false);
  }
});

$('#reception-payment-form')?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!['reception', 'superadmin'].includes(currentStaffSession?.role)) return;
  const form = event.target;
  const result = $('#reception-payment-result');
  const submit = form.querySelector('[type="submit"]');
  const bookingCode = form.elements.bookingCode.value.trim().toUpperCase();
  const action = form.elements.settlementAction.value;
  if (!form.dataset.bookingId || form.dataset.previewSignature !== `${bookingCode}|${action}`) {
    const preview = await previewReceptionSettlement();
    if (!preview) return;
  }
  const amountDue = Number(form.dataset.amountDue || 0);
  if (amountDue > 0 && !form.reportValidity()) return;

  const selectedRooms = Array.from($('#reception-settlement-room-choices')
    .querySelectorAll('select[data-booking-room-id]'));
  if (action === 'CHECK_IN' && selectedRooms.some(select => !select.value)) {
    result.textContent = 'กรุณาเลือกห้องว่างให้ครบทุกห้องก่อน Check-in';
    return;
  }
  const selectedRoomIds = selectedRooms.map(select => select.value);
  if (new Set(selectedRoomIds).size !== selectedRoomIds.length) {
    result.textContent = 'กรุณาเลือกคนละห้องสำหรับแต่ละรายการจอง';
    return;
  }

  if (amountDue > 0) {
    const signature = `${form.dataset.bookingId}|${action}|${form.elements.method.value}`;
    if (form.dataset.paymentSignature !== signature) {
      form.dataset.paymentSignature = signature;
      form.dataset.paymentKey = `RECEPTION-${action}-${form.dataset.bookingId}-${crypto.randomUUID()}`;
    }
  }
  const payload = amountDue > 0 ? new FormData() : JSON.stringify({});
  if (amountDue > 0) {
    payload.append('method', form.elements.method.value);
    payload.append('idempotencyKey', form.dataset.paymentKey);
    payload.append('proof', form.elements.proof.files[0]);
  }
  submit.disabled = true;
  result.textContent = 'กำลังตรวจห้องและยืนยันสถานะ...';
  try {
    if (action === 'CHECK_IN') {
      for (const select of selectedRooms) {
        await apiFetch(`/api/staff/bookings/${form.dataset.bookingId}/assignments`, {
          method: 'POST',
          body: JSON.stringify({
            bookingRoomId: Number(select.dataset.bookingRoomId),
            roomId: Number(select.value),
            reason: 'จัดห้องก่อน Check-in'
          })
        });
      }
    }
    const slug = action === 'CHECK_IN' ? 'check-in' : 'check-out';
    const response = await apiFetch(`/api/staff/bookings/${form.dataset.bookingId}/${slug}-settlement`, {
      method: 'POST', body: payload
    });
    result.textContent = response.data.payment
      ? `${action === 'CHECK_IN' ? 'Check-in' : 'Check-out'} สำเร็จ · รับชำระ ฿${money(Number(response.data.payment.amount))} · บันทึกเลขรายการ ${response.data.payment.reference} อัตโนมัติ`
      : `${action === 'CHECK_IN' ? 'Check-in' : 'Check-out'} สำเร็จ · ไม่มียอดค้างชำระ`;
    form.elements.proof.value = '';
    setSettlementPaymentVisible(false);
    $('#reception-settlement-room-choices').replaceChildren();
    $('#reception-settlement-room-choices').hidden = true;
    $('#reception-settlement-summary').innerHTML = '<span>กรอกรหัสการจองแล้วกดตรวจสอบยอด</span>';
    delete form.dataset.amountDue;
    delete form.dataset.paymentKey;
    delete form.dataset.paymentSignature;
    delete form.dataset.bookingId;
    delete form.dataset.previewSignature;
    await Promise.all([
      renderStaffBookingHistory(currentStaffSession.role),
      renderReceptionRoomsApi(),
      renderCleaningSummaryApi()
    ]);
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
const receptionRoomTypeFilter = $('#reception-room-type-filter');
const cleaningQueue = $('#cleaning-queue');
const repairRoomList = $('#repair-room-list');
const repairRoomTypeFilter = $('#repair-room-type-filter');
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
let apiRoomSummary = null;
let apiDamageRoom = null;
const apiDamageForm = $('#room-damage-form');

// โหลดทะเบียนห้องพนักงาน; API/SQL อยู่ api/modules/rooms (Room, RoomType)
async function loadStaffRoomsApi(roomTypeId = 'all') {
  const params = new URLSearchParams({ page: '1', limit: '100' });
  if (roomTypeId !== 'all') params.set('roomTypeId', roomTypeId);
  const response = await apiFetch(`/api/staff/rooms?${params}`);
  apiRoomRecords = response.data;
  apiRoomSummary = response.meta?.summary || null;
  return response.data;
}

async function loadReceptionRoomTypes() {
  if (!receptionRoomTypeFilter || receptionRoomTypeFilter.options.length > 1) return;
  const { data } = await apiFetch('/api/room-types');
  for (const roomType of data) {
    receptionRoomTypeFilter.add(new Option(roomType.name, roomType.id));
  }
}

async function renderReceptionRoomsApi() {
  receptionRoomList.innerHTML = '<tr><td colspan="5">กำลังโหลดห้องจากฐานข้อมูล...</td></tr>';
  try {
    await loadReceptionRoomTypes();
    const selectedRoomType = receptionRoomTypeFilter?.value || 'all';
    const visibleRooms = await loadStaffRoomsApi(selectedRoomType);
    renderReceptionRoomCounts(apiRoomSummary);
    receptionRoomList.innerHTML = visibleRooms.map(room => `
      <tr data-api-room-id="${room.id}">
        <td><strong>${escapeHtml(room.code)}</strong></td><td>—</td>
        <td>${escapeHtml(room.roomTypeName)}</td>
        <td><span class="status-badge ${room.status === 'AVAILABLE' ? 'green' : 'yellow'}">${escapeHtml(room.status)}</span></td>
        <td><button type="button" class="link-edit" data-room-history="${room.id}">ดูประวัติ</button></td>
      </tr>`).join('') || '<tr><td colspan="5">ไม่พบห้อง</td></tr>';
    $('#cleaning-room-count').textContent = `${apiRoomSummary.cleaning} ห้อง`;
  } catch (error) {
    renderReceptionRoomCounts(null);
    receptionRoomList.innerHTML = `<tr><td colspan="5">${escapeHtml(error.message)}</td></tr>`;
  }
}

function renderReceptionRoomCounts(summary) {
  const values = summary
    ? [summary.available, summary.booked, summary.occupied, summary.cleaning, summary.outOfService]
    : ['—', '—', '—', '—', '—'];
  $('#reception-room-counts')?.querySelectorAll('strong').forEach((count, index) => {
    count.textContent = values[index];
  });
}

receptionRoomTypeFilter?.addEventListener('change', renderReceptionRoomsApi);

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

async function renderReceptionActivities() {
  const target = $('#reception-activity-summary');
  if (!target) return;
  target.innerHTML = '<p>กำลังโหลดรายการวันนี้...</p>';
  try {
    const { data } = await apiFetch('/api/staff/dashboard-summary');
    const items = [
      ...(data.serviceBreakdown || []).map(item => ({ ...item, kind: 'บริการ' })),
      ...(data.tourBreakdown || []).map(item => ({ ...item, kind: 'ทริป' }))
    ];
    target.innerHTML = items.length ? items.map(item => `
      <div class="service-mini-box">
        <div><strong>${escapeHtml(item.name)}</strong><small>${item.bookingCount} รายการวันนี้</small></div>
        <span class="status-badge green">${item.kind}</span>
      </div>`).join('') : '<p>วันนี้ยังไม่มีรายการบริการหรือทริป</p>';
  } catch (error) { target.innerHTML = `<p>${escapeHtml(error.message)}</p>`; }
}

// คิวแม่บ้านและปุ่มเริ่ม/เสร็จงาน; API บันทึก RoomEvent
async function renderCleaningQueueApi() {
  cleaningQueue.innerHTML = '<p>กำลังโหลดคิวทำความสะอาด...</p>';
  try {
    const [cleaning, rooms, roomTypes] = await Promise.all([
      apiFetch('/api/housekeeping/cleaning'),
      loadAllStaffRooms(),
      apiFetch('/api/room-types')
    ]);
    // ตัวเลือกความเสียหายต้องเห็นห้องทุกประเภท; endpoint แบ่งหน้าไม่เกิน 100 ห้องต่อครั้ง
    apiRoomRecords = rooms;
    const roomTypeChoice = $('#damage-room-type-choice');
    roomTypeChoice.replaceChildren(
      new Option('เลือกประเภทห้อง', ''),
      ...roomTypes.data.map(type => new Option(type.name, type.id))
    );
    const roomChoice = $('#damage-room-choice');
    roomChoice.replaceChildren(new Option('เลือกประเภทห้องก่อน', ''));
    roomChoice.disabled = true;
    roomTypeChoice.onchange = () => {
      const selectedTypeId = Number(roomTypeChoice.value);
      const matchingRooms = rooms.filter(room => Number(room.roomTypeId) === selectedTypeId);
      roomChoice.replaceChildren(
        new Option(selectedTypeId ? matchingRooms.length ? 'เลือกเลขห้อง' : 'ไม่มีห้องในประเภทนี้' : 'เลือกประเภทห้องก่อน', ''),
        ...matchingRooms.map(room => new Option(room.code, room.id))
      );
      roomChoice.disabled = !selectedTypeId || !matchingRooms.length;
    };
    cleaningQueue.innerHTML = cleaning.data.length ? cleaning.data.map(item => `
      <div class="housekeeping-item staff-room-row">
        <div><strong>ห้อง ${escapeHtml(item.roomCode)}</strong><small>${escapeHtml(item.roomTypeName)} · ${item.startedAt ? 'กำลังทำความสะอาด' : 'รอทำความสะอาด'}</small></div>
        <div class="staff-actions">
          <button type="button" class="btn-dark-pill" data-clean-event="${item.id}" data-clean-action="${item.startedAt ? 'complete' : 'start'}">${item.startedAt ? 'ยืนยันว่าทำเสร็จ' : 'เริ่มทำความสะอาด'}</button>
          <button type="button" class="booking-outline" data-api-damage-room="${item.roomId}">แจ้งความเสียหาย</button>
        </div>
      </div>`).join('') : '<p class="demo-note">ยังไม่มีห้องในคิว</p>';
  } catch (error) { cleaningQueue.innerHTML = `<p>${escapeHtml(error.message)}</p>`; }
}

// เปิดฟอร์มรายงานความเสียหาย; รายละเอียดอยู่ RoomEvent และรูปอยู่ private storage
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
  repairRoomList.innerHTML = '<p>เลือกประเภทห้องเพื่อดูเลขห้อง</p>';
  try {
    if (repairRoomTypeFilter.options.length === 1) {
      const { data: roomTypes } = await apiFetch('/api/room-types');
      roomTypes.forEach(type => repairRoomTypeFilter.add(new Option(type.name, type.id)));
    }
    await renderDamageReportsApi($('#executive-damage-list'));
    const roomTypeId = repairRoomTypeFilter.value;
    if (!roomTypeId) return;

    repairRoomList.innerHTML = '<p>กำลังโหลดเลขห้อง...</p>';
    const rooms = await loadAllStaffRooms(roomTypeId);
    apiRoomRecords = rooms;
    repairRoomList.innerHTML = rooms.map(room => `
      <div class="housekeeping-item staff-room-row">
        <div><strong>ห้อง ${escapeHtml(room.code)}</strong><small>${escapeHtml(room.roomTypeName)} · ${escapeHtml(room.status)}</small></div>
        ${room.status !== 'OCCUPIED' ? `<button type="button" class="booking-outline" ${room.status === 'OUT_OF_SERVICE' ? `data-api-reopen-room="${room.id}"` : `data-api-close-room="${room.id}"`}>${room.status === 'OUT_OF_SERVICE' ? 'เปิดห้องอีกครั้ง' : 'ปิดห้องเพื่อซ่อม'}</button>` : ''}
      </div>`).join('') || '<p>ไม่พบห้องในประเภทที่เลือก</p>';
  } catch (error) { repairRoomList.innerHTML = `<p>${escapeHtml(error.message)}</p>`; }
}

repairRoomTypeFilter?.addEventListener('change', renderRepairRoomsApi);

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

// โหลดรีวิวที่เผยแพร่บนหน้าเว็บจาก Review API
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

async function renderReviewModeration() {
  const target = $('#superadmin-review-list');
  if (!target) return;
  target.innerHTML = '<p>กำลังโหลดรีวิว...</p>';
  try {
    const { data } = await apiFetch('/api/reviews?page=1&limit=100');
    target.innerHTML = data.length ? data.map(review => `
      <article class="review-moderation-item">
        <div><strong>${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</strong>
          <p>“${escapeHtml(review.content)}”</p>
          <small>${escapeHtml(review.customerName)} · ${escapeHtml(review.roomTypeName || 'TKC Hotel')}</small>
        </div>
        <button type="button" class="booking-outline" data-hide-review="${review.id}">ลบออกจากหน้าเว็บ</button>
      </article>`).join('') : '<p>ไม่มีรีวิวที่แสดงอยู่ในขณะนี้</p>';
  } catch (error) {
    target.innerHTML = `<p class="login-error-text">โหลดรีวิวไม่สำเร็จ: ${escapeHtml(error.message)}</p>`;
  }
}

$('#refresh-review-moderation')?.addEventListener('click', renderReviewModeration);
$('#superadmin-review-list')?.addEventListener('click', async event => {
  const button = event.target.closest('[data-hide-review]');
  if (!button || currentStaffSession?.role !== 'superadmin') return;
  if (!window.confirm('ยืนยันนำรีวิวนี้ออกจากหน้าเว็บ?')) return;
  const reason = window.prompt('ระบุเหตุผลที่ซ่อนรีวิว');
  if (!reason?.trim()) return;
  button.disabled = true;
  try {
    await apiFetch(`/api/staff/reviews/${button.dataset.hideReview}/hide`, {
      method: 'POST', body: JSON.stringify({ reason: reason.trim() })
    });
    await Promise.all([renderReviewModeration(), loadPublicReviews()]);
    toast('นำรีวิวออกจากหน้าเว็บแล้ว');
  } catch (error) {
    button.disabled = false;
    toast(error.message);
  }
});

// โหลดแชตลูกค้า; API/SQL อยู่ api/modules/chat (ChatMessage)
async function loadCustomerChat() {
  if (!customerEmail) return;
  const box = $('#chat-messages');
  try {
    const { data } = await apiFetch('/api/chat/messages?after=0&limit=100');
    const visibleMessages = data.filter(item => !item.deleted);
    box.innerHTML = visibleMessages.length ? visibleMessages.map(item => `
      <p class="message ${item.senderType === 'CUSTOMER' ? 'guest' : 'staff'}">${escapeHtml(item.message)}</p>`).join('')
      : data.length ? '<p class="message staff">ยังไม่มีข้อความในบทสนทนานี้</p>'
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
setInterval(promptForPendingCheckoutReview, 10000);
setInterval(() => {
  if (customerEmail && $('#my-bookings-dialog')?.open) openMyBookings();
}, 15000);

let activeReceptionCustomerId = null;
async function renderReceptionChatsApi() {
  const selects = [$('#reception-chat-customer'), $('#superadmin-chat-customer')].filter(Boolean);
  const boxes = [$('#rec-chat-box'), $('#superadmin-chat-box')].filter(Boolean);
  try {
    const { data } = await apiFetch('/api/reception/chats?page=1&limit=100');
    if (activeReceptionCustomerId && !data.some(item => item.customerId === activeReceptionCustomerId)) activeReceptionCustomerId = null;
    if (!activeReceptionCustomerId && data.length) activeReceptionCustomerId = data[0].customerId;
    for (const select of selects) {
      select.replaceChildren(new Option('เลือกลูกค้าที่สนทนา', ''), ...data.map(item =>
        new Option(`${item.customerName}${item.unreadCount ? ` · ยังไม่อ่าน ${item.unreadCount}` : ''}`, item.customerId)));
      select.value = activeReceptionCustomerId ? String(activeReceptionCustomerId) : '';
    }
    if (!activeReceptionCustomerId) boxes.forEach(box => { box.innerHTML = '<p>ยังไม่มีข้อความจากลูกค้า</p>'; });
    else await loadReceptionThread();
  } catch (error) { boxes.forEach(box => { box.innerHTML = `<p>${escapeHtml(error.message)}</p>`; }); }
}

async function loadReceptionThread() {
  const boxes = [$('#rec-chat-box'), $('#superadmin-chat-box')].filter(Boolean);
  if (!activeReceptionCustomerId) { boxes.forEach(box => { box.innerHTML = '<p>เลือกลูกค้าที่ต้องการสนทนา</p>'; }); return; }
  try {
    const { data } = await apiFetch(`/api/reception/chats/${activeReceptionCustomerId}/messages?after=0&limit=100`);
    const messages = data.filter(item => !item.deleted).map(item => `<div class="rec-msg ${item.senderType === 'CUSTOMER' ? 'customer' : 'staff'}">
      <p>${escapeHtml(item.message)}</p>
      <div class="rec-msg-meta"><small>${new Date(item.sentAt).toLocaleTimeString('th-TH')}</small>
        <button type="button" class="rec-msg-delete" data-delete-chat-message="${item.id}" aria-label="ลบข้อความนี้">ลบ</button>
      </div>
    </div>`).join('') || '<p>ยังไม่มีข้อความในบทสนทนานี้</p>';
    boxes.forEach(box => { box.innerHTML = messages; box.scrollTop = box.scrollHeight; });
  } catch (error) { boxes.forEach(box => { box.innerHTML = `<p>${escapeHtml(error.message)}</p>`; }); }
}
[$('#reception-chat-customer'), $('#superadmin-chat-customer')].filter(Boolean).forEach(select => select.addEventListener('change', event => {
  activeReceptionCustomerId = Number(event.target.value) || null;
  [$(`#reception-chat-customer`), $('#superadmin-chat-customer')].filter(Boolean).forEach(item => { item.value = event.target.value; });
  loadReceptionThread();
}));

document.querySelectorAll('[data-staff-chat-form]').forEach(form => form.addEventListener('submit', async event => {
  event.preventDefault(); event.stopImmediatePropagation();
  if (!activeReceptionCustomerId) return toast('เลือกลูกค้าที่ต้องการตอบแชตก่อน');
  const input = form.querySelector('input'); const message = input.value.trim(); if (!message) return;
  try {
    await apiFetch(`/api/reception/chats/${activeReceptionCustomerId}/messages`, { method: 'POST', body: JSON.stringify({ message }) });
    input.value = '';
    await loadReceptionThread();
  } catch (error) { toast(error.message); }
}, { capture: true }));

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-delete-chat-message]');
  if (!button || !activeReceptionCustomerId) return;
  if (!window.confirm('ยืนยันลบข้อความนี้ออกจากแชตกับลูกค้า?')) return;
  button.disabled = true;
  try {
    await apiFetch(`/api/reception/chats/${activeReceptionCustomerId}/messages/${button.dataset.deleteChatMessage}`, { method: 'DELETE' });
    await renderReceptionChatsApi();
    toast('ลบข้อความแล้ว');
  } catch (error) {
    button.disabled = false;
    toast(error.message);
  }
});

// โหลดรายชื่อพนักงานและสิทธิ์; API/SQL อยู่ api/modules/employees (Employee)
async function renderStaffAccessApi() {
  staffAccessList.innerHTML = '<tr><td colspan="4">กำลังโหลดพนักงาน...</td></tr>';
  try {
    const { data } = await apiFetch('/api/staff/employees?page=1&limit=100');
    staffAccessList.innerHTML = data.map(employee => `<tr>
      <td>${escapeHtml(employee.name)}<small>${escapeHtml(employee.email)}</small></td>
      <td>${escapeHtml(employee.department)}</td><td>${escapeHtml(employee.role)}</td>
      <td>${currentStaffSession.role === 'superadmin' && employee.role === 'management'
        ? '<span class="muted-action">จัดการโดยฝ่ายบริหาร</span>'
        : `<button class="link-edit" data-api-employee="${employee.id}" data-employee-record="${escapeHtml(encodeURIComponent(JSON.stringify(employee)))}">แก้ไขสิทธิ์</button>`}</td>
    </tr>`).join('');
  } catch (error) { staffAccessList.innerHTML = `<tr><td colspan="4">${escapeHtml(error.message)}</td></tr>`; }
}

$('#add-staff')?.addEventListener('click', () => {
  staffAccountForm.reset();
  delete staffAccountForm.dataset.employeeId;
  $('#staff-account-title').textContent = 'เพิ่มพนักงาน';
  $('#staff-account-error').hidden = true;
  const { email, password } = staffAccountForm.elements;
  email.readOnly = false;
  password.disabled = false;
  password.required = true;
  $('#staff-temp-password').hidden = false;
  $('#staff-account-dialog').showModal();
});

staffAccessList.addEventListener('click', event => {
  const button = event.target.closest('[data-api-employee]'); if (!button) return;
  const employee = JSON.parse(decodeURIComponent(button.dataset.employeeRecord));
  staffAccountForm.reset(); editingStaffEmail = employee.email;
  staffAccountForm.dataset.employeeId = employee.id;
  $('#staff-account-title').textContent = 'แก้ไขบัญชีพนักงาน';
  $('#staff-account-error').hidden = true;
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

// แสดงประวัติการเปลี่ยนแปลง; ข้อมูลอ่านจาก AuditLog ผ่าน api/modules/audit
async function renderAuditApi() {
  const target = $('#executive-audit-list');
  try {
    const { data } = await apiFetch('/api/management/audit?page=1&limit=50');
    target.innerHTML = data.length ? data.map(item => `<div class="service-mini-box"><div><strong>${escapeHtml(item.action)}</strong><small>${escapeHtml(item.entityType)} #${item.entityId} · ${new Date(item.createdAt).toLocaleString('th-TH')}</small></div></div>`).join('') : '<p>ยังไม่มี Audit</p>';
  } catch (error) { target.innerHTML = `<p>${escapeHtml(error.message)}</p>`; }
}

// จุดรวมการโหลดข้อมูล dashboard ตาม role; เพิ่มการเรียกโหลดของแผนกที่นี่
function refreshStaffDashboard(role) {
  if (role === 'superadmin') {
    renderDashboardSummary();
    renderStaffAccessApi();
    renderSuperadminRoomsApi();
    renderSuperadminAttractions();
    renderStaffBookingHistory(role);
    renderReceptionChatsApi();
    renderReviewModeration();
  }
  if (role === 'accounting') {
    renderAccountingPayments();
    renderFinancialSummary('accounting-financial-summary');
    renderRefunds('accounting-refund-list', role);
    renderStaffBookingHistory(role);
  }
  if (role === 'executive') {
    renderDashboardSummary();
    renderExecutivePayments();
    renderRepairRoomsApi();
    renderFinancialSummary('executive-financial-summary');
    renderStaffBookingHistory(role);
    renderPromotions();
    renderRefunds('executive-refund-list', role);
    renderAuditApi();
  }
  if (role === 'reception') {
    renderDashboardSummary();
    renderReceptionRoomsApi();
    renderStaffBookingHistory(role);
    renderDamageReportsApi($('#reception-damage-list'));
    renderCleaningSummaryApi();
    renderReceptionChatsApi();
    renderReceptionActivities();
  }
  if (role === 'housekeeping') {
    renderCleaningQueueApi();
    renderDamageReportsApi($('#housekeeping-damage-list'));
  }
}
