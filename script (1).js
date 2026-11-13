/* ============================================================
   VOSILAK — Smart Charging Station
   Dashboard app: independent ports, insert-bottle timer popup,
   auto-voucher on finish, dedicated voucher redemption page,
   activity history, and system information.
============================================================ */

/* ---------- CONSTANTS ---------- */
const MINUTES_PER_BOTTLE = 3;         // reward rule
const INSERT_DURATION    = 10;        // seconds for bottle insertion sim

/* ---------- STATE ---------- */
const ports = {
  1: { minutes: 0, running: false, seconds: 0, vouchers: [], interval: null },
  2: { minutes: 0, running: false, seconds: 0, vouchers: [], interval: null },
  3: { minutes: 0, running: false, seconds: 0, vouchers: [], interval: null }
};

let historyItems = [];        // { date, time, port, bottles, minutes }
let pendingVoucher = null;    // voucher shown in generated modal
let verifiedVoucher = null;   // { code, port, minutes } validated voucher
let insertSession = null;     // { port, remaining, interval }

/* ---------- UTILITIES ---------- */
let toastTimer = null;
function notify(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

function formatTime(seconds) {
  if (seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function genVoucherCode(number) {
  return 'V' + number + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

/* ---------- NAVIGATION ---------- */
function setupNavigation() {
  const navLinks = document.querySelectorAll('.nav-link');
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const viewId = link.dataset.view;
      if (!viewId) return;
      switchView(viewId);
      closeMobileSidebar();
    });
  });
}

function switchView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById('view-' + viewId);
  if (target) target.classList.add('active');

  document.querySelectorAll('.nav-link').forEach(l => {
    l.classList.toggle('active', l.dataset.view === viewId);
  });
}

/* ---------- SIDEBAR TOGGLE ---------- */
function setupSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggle = document.getElementById('sidebarToggle');
  const overlay = document.getElementById('sidebarOverlay');

  toggle.addEventListener('click', () => {
    if (window.innerWidth <= 780) {
      sidebar.classList.toggle('mobile-open');
      overlay.classList.toggle('show', sidebar.classList.contains('mobile-open'));
    } else {
      sidebar.classList.toggle('collapsed');
    }
  });

  overlay.addEventListener('click', closeMobileSidebar);
}

function closeMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  sidebar.classList.remove('mobile-open');
  overlay.classList.remove('show');
}

/* ---------- RENDER PORTS ---------- */
function renderPorts() {
  const container = document.getElementById('portContainer');
  if (!container) return;
  container.innerHTML = '';

  let activeCount = 0;

  Object.keys(ports).forEach(numStr => {
    const number = Number(numStr);
    const port = ports[number];
    const busy = port.running;
    if (busy) activeCount++;

    const displaySeconds = busy ? port.seconds : port.minutes * 60;

    const card = document.createElement('div');
    card.className = 'port' + (busy ? ' charging' : '');

    card.innerHTML = `
      <div class="port-head">
        <h4>PORT 0${number}</h4>
        <span class="status ${busy ? 'busy' : ''}">${busy ? 'CHARGING' : 'AVAILABLE'}</span>
      </div>

      <div class="port-visual">
        <div class="port-circle">⚡</div>
      </div>

      <div class="port-time" id="timer${number}">${formatTime(displaySeconds)}</div>
      <div class="port-time-label">REMAINING TIME</div>

      <div class="port-actions">
        <button class="btn action btn-deposit" data-action="insert" data-port="${number}" ${busy ? 'disabled' : ''}>
          ♻ INSERT BOTTLE
        </button>
        <button class="btn action btn-start" data-action="start" data-port="${number}" ${busy || port.minutes === 0 ? 'disabled' : ''}>
          ⚡ START CHARGING
        </button>
        <button class="btn action btn-finish" data-action="finish" data-port="${number}" ${!busy ? 'disabled' : ''}>
          ■ FINISH CHARGING
        </button>
      </div>
    `;
    container.append(card);
  });

  const chip = document.getElementById('activeSessions');
  if (chip) {
    chip.textContent = activeCount + ' active session' + (activeCount === 1 ? '' : 's');
  }
}

/* ---------- EVENT DELEGATION FOR PORT BUTTONS ---------- */
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const portNumber = Number(btn.dataset.port);
  if (action === 'insert') openInsertModal(portNumber);
  if (action === 'start') startCharging(portNumber);
  if (action === 'finish') finishCharging(portNumber);
});

/* ---------- INSERT BOTTLE MODAL ---------- */
const insertModal = document.getElementById('insertModal');
const insertPortLabel = document.getElementById('insertPortLabel');
const insertProgress = document.getElementById('insertProgress');
const insertTimer = document.getElementById('insertTimer');

function openInsertModal(number) {
  const port = ports[number];
  if (!port || port.running) return;

  clearInsertSession();

  insertPortLabel.textContent = 'Port 0' + number + ' — Insert your bottle';
  insertTimer.textContent = formatTime(INSERT_DURATION);
  insertProgress.style.width = '100%';

  insertModal.classList.add('show');

  insertSession = {
    port: number,
    remaining: INSERT_DURATION,
    interval: setInterval(() => tickInsertTimer(), 1000)
  };
}

function tickInsertTimer() {
  if (!insertSession) return;
  insertSession.remaining -= 1;

  if (insertSession.remaining <= 0) {
    insertSession.remaining = 0;
    insertProgress.style.width = '0%';
    insertTimer.textContent = '00:00';
    clearInsertSession();
    insertModal.classList.remove('show');
    notify('Insertion time expired. No minutes were added. Please try again.');
    return;
  }

  const pct = (insertSession.remaining / INSERT_DURATION) * 100;
  insertProgress.style.width = pct + '%';
  insertTimer.textContent = formatTime(insertSession.remaining);
}

function clearInsertSession() {
  if (insertSession && insertSession.interval) {
    clearInterval(insertSession.interval);
  }
  insertSession = null;
}

document.getElementById('insertDoneBtn').addEventListener('click', () => {
  if (!insertSession) return;
  const number = insertSession.port;
  clearInsertSession();
  insertModal.classList.remove('show');

  const port = ports[number];
  if (!port) return;

  port.minutes += MINUTES_PER_BOTTLE;
  recordBottleActivity(number, 1, MINUTES_PER_BOTTLE);
  renderPorts();
  notify('Bottle accepted! Port 0' + number + ' received ' + MINUTES_PER_BOTTLE + ' minutes.');
});

document.getElementById('insertCancelBtn').addEventListener('click', () => {
  clearInsertSession();
  insertModal.classList.remove('show');
  notify('Insertion cancelled.');
});

insertModal.addEventListener('click', (e) => {
  if (e.target === insertModal) {
    clearInsertSession();
    insertModal.classList.remove('show');
  }
});

/* ---------- CHARGING ---------- */
function startCharging(number) {
  const port = ports[number];
  if (!port || port.running || port.minutes <= 0) return;

  port.seconds = port.minutes * 60;
  port.minutes = 0;
  port.running = true;

  if (port.interval) clearInterval(port.interval);

  port.interval = setInterval(() => {
    if (!port.running) return;
    port.seconds -= 1;

    const timerEl = document.getElementById('timer' + number);
    if (timerEl) timerEl.textContent = formatTime(port.seconds);

    if (port.seconds <= 0) {
      port.running = false;
      port.seconds = 0;
      clearInterval(port.interval);
      port.interval = null;
      renderPorts();
      notify('Port 0' + number + ' charging completed.');
    }
  }, 1000);

  renderPorts();
  notify('Charging started on Port 0' + number + '.');
}

function finishCharging(number) {
  const port = ports[number];
  if (!port || !port.running) return;

  if (port.interval) { clearInterval(port.interval); port.interval = null; }
  port.running = false;

  const remainingMinutes = Math.ceil(port.seconds / 60);
  port.seconds = 0;

  if (remainingMinutes <= 0) {
    renderPorts();
    notify('Port 0' + number + ' charging session completed. No unused minutes remained.');
    return;
  }

  const code = genVoucherCode(number);
  const voucher = { code, minutes: remainingMinutes, port: number, redeemed: false };
  port.vouchers.push(voucher);

  pendingVoucher = voucher;

  document.getElementById('voucherPort').textContent = 'Port 0' + number;
  document.getElementById('voucherMinutes').textContent = remainingMinutes + ' Minute' + (remainingMinutes > 1 ? 's' : '');
  document.getElementById('voucherCode').textContent = code;
  document.getElementById('voucherModal').classList.add('show');

  renderPorts();
}

/* ---------- VOUCHER GENERATED MODAL ---------- */
document.getElementById('voucherCopyBtn').addEventListener('click', () => {
  if (!pendingVoucher) return;
  const code = pendingVoucher.code;
  const done = () => notify('Voucher code ' + code + ' copied to clipboard.');

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(code).then(done).catch(() => fallbackCopy(code, done));
  } else {
    fallbackCopy(code, done);
  }
});

function fallbackCopy(text, done) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); done(); }
  catch (e) { notify('Copy failed. Please copy manually: ' + text); }
  document.body.removeChild(ta);
}

document.getElementById('voucherCloseBtn').addEventListener('click', () => {
  document.getElementById('voucherModal').classList.remove('show');
  pendingVoucher = null;
});

document.getElementById('voucherModal').addEventListener('click', (e) => {
  if (e.target.id === 'voucherModal') {
    document.getElementById('voucherModal').classList.remove('show');
    pendingVoucher = null;
  }
});

/* ---------- REDEEM: VALIDATE ---------- */
function findVoucher(code) {
  for (const numStr of Object.keys(ports)) {
    const number = Number(numStr);
    const port = ports[number];
    const idx = port.vouchers.findIndex(v => v.code === code);
    if (idx !== -1) return { port: number, index: idx, voucher: port.vouchers[idx] };
  }
  return null;
}

const redeemInput = document.getElementById('redeemInput');
const redeemError = document.getElementById('redeemError');
const redeemSubmitBtn = document.getElementById('redeemSubmitBtn');

redeemSubmitBtn.addEventListener('click', validateVoucher);
redeemInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); validateVoucher(); }
});

function validateVoucher() {
  const code = redeemInput.value.trim().toUpperCase();
  redeemError.textContent = '';

  if (!code) {
    redeemError.textContent = 'Please enter a voucher code.';
    return;
  }

  const found = findVoucher(code);

  if (!found) {
    redeemError.textContent = 'Invalid voucher code. Please check and try again.';
    return;
  }

  if (found.voucher.redeemed) {
    redeemError.textContent = 'This voucher has already been redeemed.';
    return;
  }

  verifiedVoucher = { code, port: found.port, minutes: found.voucher.minutes };

  document.getElementById('rewardPort').textContent = 'Port 0' + found.port;
  document.getElementById('rewardMinutes').textContent = found.voucher.minutes + ' Minute' + (found.voucher.minutes > 1 ? 's' : '');

  document.getElementById('rewardModal').classList.add('show');
}

/* ---------- REDEEM: CONFIRM ---------- */
document.getElementById('rewardModal').addEventListener('click', (e) => {
  if (e.target.id === 'rewardModal') {
    document.getElementById('rewardModal').classList.remove('show');
    verifiedVoucher = null;
  }
});

document.getElementById('rewardCancelBtn').addEventListener('click', () => {
  document.getElementById('rewardModal').classList.remove('show');
  verifiedVoucher = null;
});

document.getElementById('rewardConfirmBtn').addEventListener('click', () => {
  if (!verifiedVoucher) return;
  const { port: portNumber, minutes, code } = verifiedVoucher;
  const port = ports[portNumber];

  const idx = port.vouchers.findIndex(v => v.code === code && !v.redeemed);
  if (idx === -1) {
    notify('This voucher is no longer available.');
    document.getElementById('rewardModal').classList.remove('show');
    verifiedVoucher = null;
    return;
  }

  port.minutes += minutes;
  port.vouchers[idx].redeemed = true;

  verifiedVoucher = null;
  document.getElementById('rewardModal').classList.remove('show');
  redeemInput.value = '';
  renderPorts();
  notify('Restored ' + minutes + ' minute' + (minutes > 1 ? 's' : '') + ' to Port 0' + portNumber + '.');
});

/* ---------- HELP MODAL ---------- */
document.getElementById('helpBtn').addEventListener('click', () => {
  document.getElementById('helpModal').classList.add('show');
});
document.getElementById('helpCloseBtn').addEventListener('click', () => {
  document.getElementById('helpModal').classList.remove('show');
});
document.getElementById('helpModal').addEventListener('click', (e) => {
  if (e.target.id === 'helpModal') {
    document.getElementById('helpModal').classList.remove('show');
  }
});

/* ---------- ACTIVITY HISTORY ---------- */
function recordBottleActivity(portNumber, bottles, minutes) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  historyItems.unshift({
    date: dateStr,
    time: timeStr,
    port: portNumber,
    bottles,
    minutes,
    ts: now.getTime()
  });

  renderHistory();
}

function renderHistory() {
  const body = document.getElementById('historyBody');
  const empty = document.getElementById('historyEmpty');
  const countChip = document.getElementById('historyCount');
  if (!body) return;

  body.innerHTML = '';

  if (historyItems.length === 0) {
    empty.style.display = 'flex';
    if (countChip) countChip.textContent = '0 records';
    return;
  }
  empty.style.display = 'none';

  if (countChip) {
    countChip.textContent = historyItems.length + ' record' + (historyItems.length === 1 ? '' : 's');
  }

  historyItems.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.date}</td>
      <td>${item.time}</td>
      <td><span class="port-pill">Port ${item.port}</span></td>
      <td>Bottle Inserted</td>
      <td class="num">${item.bottles}</td>
      <td class="num"><span class="min-pill">+${item.minutes} min</span></td>
    `;
    body.append(tr);
  });
}

/* ---------- INIT ---------- */
function init() {
  setupSidebar();
  setupNavigation();
  renderPorts();
  renderHistory();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}