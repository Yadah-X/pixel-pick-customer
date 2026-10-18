
const SUPABASE_URL = 'https://cxhclxtbtrsyfigqleeg.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_N4pRAlpCzjTEoKR7TCYOEA_Irj7mCrv';

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

const modal = document.getElementById('modal');
let accountMode = 'signin';

// Competition challenge modal
function openChallenge() {
  modal.classList.remove('hidden');
}

function closeChallenge() {
  modal.classList.add('hidden');
}

// Account modal
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

// Switch between sign-in and registration
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
}

// Check the current sign-in status
async function refreshAccount() {
  const { data, error } = await supabaseClient.auth.getSession();

  if (error) {
    showAccountMessage('Could not check your session. Please try again.');
    return;
  }

  const signedIn = Boolean(data.session);

  document.getElementById('signOutButton').classList.toggle(
    'hidden',
    !signedIn
  );

  document.getElementById('signOutButton').textContent = 'Sign out';

  document.querySelector('#accountForm button[type="submit"]').disabled =
    signedIn;

  if (signedIn) {
    showAccountMessage(
      'You are signed in. Your competition entries are not yet connected.'
    );
  }
}

// Sign in or register
document.getElementById('accountForm').addEventListener(
  'submit',
  async (event) => {
    event.preventDefault();

    const email = document.getElementById('accountEmail').value.trim();
    const password = document.getElementById('accountPassword').value;
    const submitButton = document.querySelector(
      '#accountForm button[type="submit"]'
    );

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
          showAccountMessage(
            'Registration submitted. Check your email to confirm your account before signing in.'
          );
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
      showAccountMessage(
        error.message || 'Something went wrong. Please try again.'
      );
    } finally {
      const { data } = await supabaseClient.auth.getSession();

      submitButton.disabled = Boolean(data.session);
    }
  }
);

// Sign out
async function signOutAccount() {
  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    showAccountMessage('Could not sign out. Please try again.');
    return;
  }

  accountMode = 'signin';

  document.getElementById('accountForm').reset();

  document.querySelector('#accountForm button[type="submit"]').textContent =
    'Sign in';

  document.getElementById('accountModeButton').textContent =
    'Need an account? Register';

  document.getElementById('signOutButton').classList.add('hidden');

  document.querySelector('#accountForm button[type="submit"]').disabled =
    false;

  showAccountMessage('You have signed out.');
}

// Display a previously saved demo answer
const savedEntry = localStorage.getItem('pixelPickEntry');

if (savedEntry) {
  document.getElementById('entryText').textContent = savedEntry;
}

// Handle clicks on the challenge board
document.getElementById('board').addEventListener('click', (event) => {
  const board = event.currentTarget;
  const rect = board.getBoundingClientRect();

  document.getElementById('x').value = Math.max(
    0,
    Math.min(100, Math.round(((event.clientX - rect.left) / rect.width) * 100))
  );

  document.getElementById('y').value = Math.max(
    0,
    Math.min(100, Math.round(((event.clientY - rect.top) / rect.height) * 100))
  );
});

// Update the account interface when sign-in status changes
supabaseClient.auth.onAuthStateChange(() => {
  refreshAccount();
});
