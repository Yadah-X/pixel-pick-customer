
const SUPABASE_URL = 'https://cxhclxtbtrsyfigqleeg.supabase.co';
const SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_N4pRAlpCzjTEoKR7TCYOEA_Irj7mCrv';

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

const modal = document.getElementById('modal');
const accountModal = document.getElementById('accountModal');

let accountMode = 'signin';

// ------------------------------------------
// Competition loading — READ ONLY
// ------------------------------------------

async function loadCompetitions() {
  const grid = document.getElementById('competitionGrid');
  const message = document.getElementById('competitionMessage');

  if (!grid) return;

  grid.replaceChildren();

  const loading = document.createElement('p');
  loading.textContent = 'Loading available competitions...';
  grid.appendChild(loading);

  if (message) message.textContent = '';

  try {
    const { data, error } = await supabaseClient
      .from('competitions')
      .select('id, name, prize_description, entry_price_cents, closes_at')
      .eq('status', 'open')
      .order('created_at', { ascending: false });

    if (error) throw error;

    grid.replaceChildren();

    if (!data || data.length === 0) {
      const empty = document.createElement('p');
      empty.textContent =
        'There are no open competitions at the moment. Please check back soon.';
      grid.appendChild(empty);
      return;
    }

    data.forEach((competition) => {
      const card = document.createElement('article');
      card.className = 'card';

      const visual = document.createElement('div');
      visual.className = 'visual';
      visual.textContent = '🎁';
      visual.setAttribute('aria-hidden', 'true');

      const pad = document.createElement('div');
      pad.className = 'pad';

      const pill = document.createElement('span');
      pill.className = 'pill';
      pill.textContent = 'OPEN COMPETITION';

      const title = document.createElement('h3');
      title.textContent = competition.name;

      const description = document.createElement('p');
      description.textContent =
        competition.prize_description || 'See competition rules for details.';

      const row = document.createElement('div');
      row.className = 'row';

      const price = document.createElement('b');
      const cents = Number(competition.entry_price_cents);

      price.textContent = Number.isFinite(cents) && cents >= 0
        ? `R${(cents / 100).toFixed(2)}`
        : 'Price unavailable';

      const enterButton = document.createElement('button');
      enterButton.type = 'button';
      enterButton.textContent = 'View challenge';

      // This is a demonstration only. It does not create an entry.
      enterButton.addEventListener('click', () => {
        openChallenge(competition.id, competition.name);
      });

      row.append(price, enterButton);
      pad.append(pill, title, description, row);
      card.append(visual, pad);
      grid.appendChild(card);
    });
  } catch (error) {
    console.error('Could not load competitions:', error);

    grid.replaceChildren();

    const problem = document.createElement('p');
    problem.textContent =
      'We could not load competitions. Please refresh the page and try again.';
    grid.appendChild(problem);

    if (message) {
      message.textContent =
        'Competition data could not be loaded. Your account has not been affected.';
    }
  }
}

// ------------------------------------------
// Challenge modal — DEMO ONLY
// ------------------------------------------

let selectedCompetitionId = null;
let selectedCompetitionName = 'Demo challenge';

function openChallenge(competitionId = null, competitionName = 'Demo challenge') {
  selectedCompetitionId = competitionId;
  selectedCompetitionName = competitionName;

  const title = document.getElementById('challengeTitle');

  if (title) {
    title.textContent = competitionId
      ? `Demo challenge: ${competitionName}`
      : 'Pick the target pixel';
  }

  modal.classList.remove('hidden');
}

function closeChallenge() {
  modal.classList.add('hidden');
}

// This function deliberately does not create or charge for an entry.
function submitEntry() {
  const xInput = document.getElementById('x');
  const yInput = document.getElementById('y');

  const x = Number(xInput.value);
  const y = Number(yInput.value);

  if (
    xInput.value.trim() === '' ||
    yInput.value.trim() === '' ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    x < 0 || x > 100 ||
    y < 0 || y > 100
  ) {
    alert('Please enter valid X and Y coordinates between 0 and 100.');
    return;
  }

  const answer =
    `Demo answer for ${selectedCompetitionName}: X=${x}, Y=${y}. ` +
    'This is saved only in this browser. No real entry was created.';

  localStorage.setItem('pixelPickEntry', answer);

  const entryText = document.getElementById('entryText');
  if (entryText) entryText.textContent = answer;

  alert(
    'Demo answer saved. This is not a paid entry and does not enter you into a competition.'
  );

  closeChallenge();
}

// ------------------------------------------
// Account modal
// ------------------------------------------

function openAccount() {
  accountModal.classList.remove('hidden');
  showAccountMessage('');
  refreshAccount();
}

function closeAccount() {
  accountModal.classList.add('hidden');
}

function showAccountMessage(message) {
  const element = document.getElementById('accountMessage');
  if (element) element.textContent = message;
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
}

// ------------------------------------------
// Check sign-in status
// ------------------------------------------

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

  document.getElementById('accountModeButton').classList.toggle(
    'hidden',
    signedIn
  );

  document.querySelector('#accountForm button[type="submit"]').disabled =
    signedIn;

  document.getElementById('accountEmail').disabled = signedIn;
  document.getElementById('accountPassword').disabled = signedIn;

  if (signedIn) {
    showAccountMessage(
      'You are signed in. Real competition entries and payments are not enabled yet.'
    );
  }
}

// ------------------------------------------
// Register or sign in with Supabase Auth
// ------------------------------------------

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

// ------------------------------------------
// Sign out
// ------------------------------------------

async function signOutAccount() {
  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    showAccountMessage('Could not sign out. Please try again.');
    return;
  }

  accountMode = 'signin';

  document.getElementById('accountForm').reset();

  document.getElementById('accountTitle').textContent = 'Sign in';

  document.querySelector('#accountForm button[type="submit"]').textContent =
    'Sign in';

  document.getElementById('accountModeButton').textContent =
    'Need an account? Register';

  document.getElementById('accountModeButton').classList.remove('hidden');
  document.getElementById('signOutButton').classList.add('hidden');

  document.getElementById('accountEmail').disabled = false;
  document.getElementById('accountPassword').disabled = false;

  document.querySelector('#accountForm button[type="submit"]').disabled =
    false;

  showAccountMessage('You have signed out.');
}

// ------------------------------------------
// Restore the local demo answer
// ------------------------------------------

const savedEntry = localStorage.getItem('pixelPickEntry');

if (savedEntry) {
  document.getElementById('entryText').textContent = savedEntry;
}

// ------------------------------------------
// Click the challenge board to set coordinates
// ------------------------------------------

document.getElementById('board').addEventListener('click', (event) => {
  const board = event.currentTarget;
  const rect = board.getBoundingClientRect();

  if (!rect.width || !rect.height) return;

  document.getElementById('x').value = Math.max(
    0,
    Math.min(100, Math.round(((event.clientX - rect.left) / rect.width) * 100))
  );

  document.getElementById('y').value = Math.max(
    0,
    Math.min(100, Math.round(((event.clientY - rect.top) / rect.height) * 100))
  );
});

// ------------------------------------------
// Keep the interface updated after auth changes
// ------------------------------------------

supabaseClient.auth.onAuthStateChange(() => {
  refreshAccount();
});

// ------------------------------------------
// Load open competitions when the page starts
// ------------------------------------------

loadCompetitions();
// TEST ONLY: checks the Edge Function without creating an entry.
async function testCreateEntryFunction() {
  const { data, error } = await supabaseClient.auth.getSession();

  if (error || !data.session) {
    console.log("TEST RESULT: Please sign in first.");
    return;
  }

  const { data: competitions, error: competitionError } =
    await supabaseClient
      .from("competitions")
      .select("id")
      .eq("name", "iPhone 17 Pro Max Demo")
      .limit(1);

  if (competitionError || !competitions?.length) {
    console.log("TEST RESULT: Demo competition not found.");
    return;
  }

  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/create-entry`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_PUBLISHABLE_KEY,
          "Authorization": `Bearer ${data.session.access_token}`
        },
        body: JSON.stringify({
          competition_id: competitions[0].id
        })
      }
    );

    const result = await response.json();
    console.log("TEST HTTP STATUS:", response.status);
    console.log("TEST RESULT:", result);
  } catch (error) {
    console.log("TEST FAILED:", error.message);
  }
}
