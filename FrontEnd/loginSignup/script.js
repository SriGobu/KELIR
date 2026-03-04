const API = 'https://www.kelir-api.sg247.dev';

// ── Tab switching ─────────────────────────────────────────────────────────────
function switchTab(tab) {
  const indicator = document.getElementById('tab-indicator');
  document.getElementById('tab-login').classList.toggle('active',  tab === 'login');
  document.getElementById('tab-signup').classList.toggle('active', tab === 'signup');
  document.getElementById('form-login').classList.toggle('hidden', tab !== 'login');
  document.getElementById('form-signup').classList.toggle('hidden', tab !== 'signup');
  indicator.classList.toggle('right', tab === 'signup');
  clearAlert();
}

// ── Show alert ────────────────────────────────────────────────────────────────
function showAlert(msg, type = 'error') {
  const el = document.getElementById('alert');
  el.textContent = msg;
  el.className = `alert ${type}`;
}
function clearAlert() {
  const el = document.getElementById('alert');
  el.className = 'alert';
  el.textContent = '';
}

// ── Toggle password visibility ────────────────────────────────────────────────
function togglePwd(id, btn) {
  const input = document.getElementById(id);
  const isText = input.type === 'text';
  input.type = isText ? 'password' : 'text';
  btn.innerHTML = isText
    ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
    : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
}

// ── Set button loading state ──────────────────────────────────────────────────
function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  btn.disabled = loading;
  btn.querySelector('.btn-text').style.display   = loading ? 'none' : '';
  btn.querySelector('.btn-loader').classList.toggle('hidden', !loading);
}

// ── Login ─────────────────────────────────────────────────────────────────────
async function handleLogin(e) {
  e.preventDefault();
  clearAlert();
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  setLoading('btn-login', true);
  try {
    const res  = await fetch(`${API}/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    localStorage.setItem('token', data.token);
    localStorage.setItem('user',  JSON.stringify(data.user));
    showAlert('Login successful! Redirecting…', 'success');
    setTimeout(() => { window.location.href = '../chatBot/chatBot.html'; }, 900);
  } catch (err) {
    showAlert(err.message || 'Login failed');
  } finally {
    setLoading('btn-login', false);
  }
}

// ── Signup ────────────────────────────────────────────────────────────────────
async function handleSignup(e) {
  e.preventDefault();
  clearAlert();
  const name     = document.getElementById('signup-name').value.trim();
  const email    = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  setLoading('btn-signup', true);
  try {
    const res  = await fetch(`${API}/auth/register`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, email, password })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    localStorage.setItem('token', data.token);
    localStorage.setItem('user',  JSON.stringify(data.user));
    showAlert('Account created! Redirecting…', 'success');
    setTimeout(() => { window.location.href = '../chatBot/chatBot.html'; }, 900);
  } catch (err) {
    showAlert(err.message || 'Registration failed');
  } finally {
    setLoading('btn-signup', false);
  }
}
