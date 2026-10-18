
const SUPABASE_URL = 'https://cxhclxtbtrsyfigqleeg.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_N4pRAlpCzjTEoKR7TCYOEA_Irj7mCrv';

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

const modal = document.getElementById('modal');
let accountMode = 'signin';

function openChallenge() {
  modal.classList.remove('hidden');
}

function closeChallenge() {
  modal.classList.add('hidden');
}

function openAccount() {
  document.getElementById('accountModal').classList.remove('hidden');
  showAccountMessage('');
  refreshAccount();
}

function closeAccount() {
  document.getElementById('accountModal').classList.add('hidden');
}

function showAccountMessage(message) {
  document.getElementById('accountMessage').textContent = message;
}


function toggleAccountMode() {
  accountMode = accountMode === 'signin' ? 'signup' : 'signin';

  document.getElementById('accountTitle').textContent =
    accountMode === 'signup' ? 'Create your account' : 'Sign in';

  document.querySelector('#accountForm button[type="submit"]').textContent =
    accountMode === 'signup' ? 'Register' : 'Sign in';

  document.getElementById('accountModeButton').textContent =
    accountMode === 'signup'
      ? 'Already have an account? Sign in'
      : 'Need an account? Register';

  document.getElementById('accountPassword').autocomplete =
    accountMode === 'signup' ? 'new-password' : 'current-password';

  showAccountMessage('');
} {
  accountMode = accountMode === 'signin' ? 'signup' : 'signin';

  document.getElementById('accountTitle').textContent =
    accountMode === 'signup' ? 'Create your account' : 'Sign in';

  document.querySelector('#accountForm button[type="submit"]').textContent =
    accountMode === 'signup' ? 'Register' : 'Sign in';

  document.querySelector('#accountModal button.outline[type="button"]').textContent =
    accountMode === 'signup' ? 'Already have an account? Sign in' : 'Need an account? Register';

  document.getElementById('accountPassword').autocomplete =
    accountMode === 'signup' ? 'new-password' : 'current-password';

  showAccountMessage('');
}

async function refreshAccount() {
  const { data, error } = await supabaseClient.auth.getSession();

  if (error) {
    showAccountMessage('Could not check your session. Please try again.');
    return;
  }

  const signedIn = Boolean(data.session);

  document.getElementById('signOutButton').classList.toggle('hidden',document.getElementById('accountForm').reset();
document.querySelector('#accountForm button[type="submit"]').textContent = 'Sign in'; !signedIn);document.getElementById('signOutButton').textContent = 'Sign out';
  document.querySelector('#accountForm button[type="submit"]').disabled = signedIn;

  if (signedIn) {
    showAccountMessage('You are signed in. Your competition entries are not yet connected.');
  }
}

document.getElementById('accountForm').addEventListener('submit', async (event) => {
  event.preventDefault();

  const email = document.getElementById('accountEmail').value.trim();
  const password = document.getElementById('accountPassword').value;
  const submitButton = document.querySelector('#accountForm button[type="submit"]');

  submitButton.disabled = true;
  showAccountMessage('Please wait...');

  try {
    if (accountMode === 'signup') {
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin
        }
      });

      if (error) throw error;

      if (data.session) {
        showAccountMessage('Account created and signed in successfully.');
      } else {
        showAccountMessage('Registration submitted. Check your email to confirm your account before signing in.');
      }
    } else {
      const { error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      showAccountMessage('Signed in successfully.');
    }

    await refreshAccount();
  } catch (error) {
    showAccountMessage(error.message || 'Something went wrong. Please try again.');
  } finally {
    submitButton.disabled = false;
  }
});

async function signOutAccount() {
  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    showAccountMessage('Could not sign out. Please try again.');
    return;
  }

  showAccountMessage('You have signed out.');
  document.querySelector('#accountForm button[type="submit"]').disabled = false;
  document.getElementById('signOutButton').classList.add('hidden');
  accountMode = 'signin';
}

async function submitEntry() {
  showAccountMessage('');

  const { data } = await supabaseClient.auth.getSession();

  if (!data.session) {
    alert('Please sign in before proceeding. Entries are still in demo mode.');
    openAccount();
    return;
  }

  const x = document.getElementById('x').value;
  const y = document.getElementById('y').value;
  const msg = `Demo answer — X: ${x}, Y: ${y}. No real entry or payment was created.`;

  localStorage.setItem('pixelPickEntry', msg);
  document.getElementById('entryText').textContent = msg;
  closeChallenge();
  alert('Demo answer saved locally. No competition entry or payment was created.');
}

if (localStorage.getItem('pixelPickEntry')) {
  document.getElementById('entryText').textContent =
    localStorage.getItem('pixelPickEntry');
}

document.getElementById('board').addEventListener('click', (event) => {
  const board = event.currentTarget;
  const rect = board.getBoundingClientRect();

  document.getElementById('x').value =
    Math.max(0, Math.min(100, Math.round((event.clientX - rect.left) / rect.width * 100)));

  document.getElementById('y').value =
    Math.max(0, Math.min(100, Math.round((event.clientY - rect.top) / rect.height * 100)));
});

supabaseClient.auth.onAuthStateChange(() => {
  refreshAccount();
});
