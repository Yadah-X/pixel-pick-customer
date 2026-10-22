
const SUPABASE_URL = 'https://cxhclxtbtrsyfigqleeg.supabase.co';
const SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_N4pRAlpCzjTEoKR7TCYOEA_Irj7mCrv';

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

const SITE_URL = 'https://pixel-pick-customer.onrender.com';
const VERIFY_CHALLENGE_URL =
  `${SUPABASE_URL}/functions/v1/verify-skill-challenge`;
const CREATE_PAYMENT_ORDER_URL =
  `${SUPABASE_URL}/functions/v1/create-payment-order`;

const modal = document.getElementById('modal');
const accountModal = document.getElementById('accountModal');

let accountMode = 'signin';
let selectedCompetitionId = null;
let selectedCompetitionName = 'Competition';
let activeChallengeId = null;
let challengeBusy = false;

// Shared helpers

function setText(id, text) {
  const element = document.getElementById(id);
  if (element) element.textContent = text;
}

function setChallengeMessage(message) {
  setText('competitionMessage', message);
}

async function getAccessToken() {
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) throw error;

  const token = data.session?.access_token;
  if (!token) {
    throw new Error('Please sign in before entering a competition.');
  }

  return token;
}

async function callEdgeFunction(url, body) {
  const token = await getAccessToken();

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'apikey': SUPABASE_PUBLISHABLE_KEY
    },
    body: JSON.stringify(body)
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      typeof result.error === 'string'
        ? result.error
        : 'The request could not be completed. Please try again.'
    );
  }

  return result;
}

// Load available competitions

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
        competition.prize_description ||
        'See competition rules for details.';

      const row = document.createElement('div');
      row.className = 'row';

      const price = document.createElement('b');
      const cents = Number(competition.entry_price_cents);

      price.textContent = Number.isFinite(cents) && cents > 0
        ? `R${(cents / 100).toFixed(2)}`
        : 'Price unavailable';

      const enterButton = document.createElement('button');
      enterButton.type = 'button';
      enterButton.textContent = 'Start skill challenge';
      enterButton.disabled = !Number.isFinite(cents) || cents <= 0;

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
async function openChallenge(
  competitionId,
  competitionName = 'Competition'
) {
  selectedCompetitionId = competitionId;
  selectedCompetitionName = competitionName || 'Competition';
  activeChallengeId = null;

  const { data } = await supabaseClient.auth.getSession();

  if (!data.session) {
    openAccount();
    showAccountMessage(
      'Please sign in or register before starting a skill challenge.'
    );
    return;
  }

  const title = document.getElementById('challengeTitle');
  if (title) {
    title.textContent = `Skill challenge: ${selectedCompetitionName}`;
  }

  const xInput = document.getElementById('x');
  const yInput = document.getElementById('y');

  if (xInput) xInput.value = '';
  if (yInput) yInput.value = '';

  const target = document.querySelector('#board .target');

  if (target) {
    target.textContent = '●';
    target.style.left = '50%';
    target.style.top = '50%';
    target.style.transform = 'translate(-50%, -50%)';
  }

  if (modal) modal.classList.remove('hidden');

  setChallengeMessage('');

  try {
    setChallengeBusy(true);
    setText('challengeTitle', 'Preparing your skill challenge…');

    const result = await callEdgeFunction(VERIFY_CHALLENGE_URL, {
      action: 'create',
      competition_id: selectedCompetitionId
    });

    if (
      !result.id ||
      !Number.isInteger(result.target_x) ||
      !Number.isInteger(result.target_y)
    ) {
      throw new Error(
        'The challenge service returned an invalid challenge.'
      );
    }

    activeChallengeId = result.id;

    if (target) {
      target.style.left = `${result.target_x}%`;
      target.style.top = `${result.target_y}%`;
      target.style.transform = 'translate(-50%, -50%)';
      target.setAttribute('aria-label', 'Target pixel');
    }

    setText(
      'challengeTitle',
      `Skill challenge: ${selectedCompetitionName}`
    );

    setChallengeMessage(
      'Click the target on the board, then submit your coordinates.'
    );
  } catch (error) {
    console.error('Could not create skill challenge:', error);

    setText('challengeTitle', 'Could not start challenge');

    setChallengeMessage(
      error.message || 'Please try again.'
    );
  } finally {
    setChallengeBusy(false);
  }
}

function setChallengeBusy(busy) {
  challengeBusy = busy;

  const button = document.querySelector(
    '#modal button[onclick="submitEntry()"]'
  );

  if (button) button.disabled = busy;
}

function closeChallenge() {
  if (modal) modal.classList.add('hidden');

  activeChallengeId = null;
  challengeBusy = false;
}
async function submitEntry() {
  if (challengeBusy) return;

  const xInput = document.getElementById('x');
  const yInput = document.getElementById('y');

  const x = Number(xInput?.value);
  const y = Number(yInput?.value);

  if (!activeChallengeId || !selectedCompetitionId) {
    alert('Please start a new skill challenge first.');
    return;
  }

  if (
    !xInput?.value.trim() ||
    !yInput?.value.trim() ||
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    x < 0 || x > 100 ||
    y < 0 || y > 100
  ) {
    alert(
      'Please select a point on the board or enter whole-number X and Y coordinates from 0 to 100.'
    );
    return;
  }

  try {
    setChallengeBusy(true);
    setChallengeMessage('Checking your answer…');

    const verification = await callEdgeFunction(
      VERIFY_CHALLENGE_URL,
      {
        action: 'verify',
        challenge_id: activeChallengeId,
        x,
        y
      }
    );

    if (!verification.solved) {
      const remaining = verification.attempts_remaining;

      setChallengeMessage(
        verification.message ||
        (
          Number.isInteger(remaining)
            ? `Not quite. ${remaining} attempts remaining.`
            : 'Not quite. Please try again.'
        )
      );

      return;
    }

    setChallengeMessage(
      'Challenge solved. Preparing secure Sandbox checkout…'
    );

    const orderResult = await callEdgeFunction(
      CREATE_PAYMENT_ORDER_URL,
      {
        competition_id: selectedCompetitionId,
        challenge_id: activeChallengeId
      }
    );

    if (
      !orderResult.ok ||
      !orderResult.checkout?.url ||
      !orderResult.checkout?.fields ||
      orderResult.sandbox !== true
    ) {
      throw new Error(
        'Sandbox checkout could not be prepared. No payment was submitted.'
      );
    }

    // PayFast requires a POST form with signed checkout fields.
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = orderResult.checkout.url;
    form.acceptCharset = 'UTF-8';
    form.style.display = 'none';

    Object.entries(orderResult.checkout.fields).forEach(
      ([name, value]) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = String(value);
        form.appendChild(input);
      }
    );

    document.body.appendChild(form);
    form.submit();

  } catch (error) {
    console.error('Challenge or checkout failed:', error);

    setChallengeMessage(
      `${error.message || 'Something went wrong.'} ` +
      'No entry is confirmed unless PayFast payment is verified by the server.'
    );

  } finally {
    setChallengeBusy(false);
  }
}
function openAccount() {
  if (accountModal) accountModal.classList.remove('hidden');

  showAccountMessage('');
  refreshAccount();
}

function closeAccount() {
  if (accountModal) accountModal.classList.add('hidden');
}

function showAccountMessage(message) {
  const element = document.getElementById('accountMessage');
  if (element) element.textContent = message;
}

function toggleAccountMode() {
  accountMode = accountMode === 'signin' ? 'signup' : 'signin';

  setText(
    'accountTitle',
    accountMode === 'signup' ? 'Create your account' : 'Sign in'
  );

  const submitButton = document.querySelector(
    '#accountForm button[type="submit"]'
  );

  if (submitButton) {
    submitButton.textContent =
      accountMode === 'signup' ? 'Register' : 'Sign in';
  }

  setText(
    'accountModeButton',
    accountMode === 'signup'
      ? 'Already have an account? Sign in'
      : 'Need an account? Register'
  );

  const password = document.getElementById('accountPassword');

  if (password) {
    password.autocomplete =
      accountMode === 'signup' ? 'new-password' : 'current-password';
  }

  showAccountMessage('');
}

async function refreshAccount() {
  const { data, error } = await supabaseClient.auth.getSession();

  if (error) {
    showAccountMessage(
      'Could not check your session. Please try again.'
    );
    return;
  }

  const signedIn = Boolean(data.session);

  const signOutButton = document.getElementById('signOutButton');
  const modeButton = document.getElementById('accountModeButton');
  const submitButton = document.querySelector(
    '#accountForm button[type="submit"]'
  );
  const email = document.getElementById('accountEmail');
  const password = document.getElementById('accountPassword');

  if (signOutButton) {
    signOutButton.classList.toggle('hidden', !signedIn);
  }

  if (modeButton) {
    modeButton.classList.toggle('hidden', signedIn);
  }

  if (submitButton) submitButton.disabled = signedIn;
  if (email) email.disabled = signedIn;
  if (password) password.disabled = signedIn;

  if (signedIn) {
    showAccountMessage(
      'You are signed in. Use an available competition to start its skill challenge. Payments remain in Sandbox.'
    );
  }
}

document.getElementById('accountForm')?.addEventListener(
  'submit',
  async (event) => {
    event.preventDefault();

    const email = document.getElementById('accountEmail').value.trim();
    const password = document.getElementById('accountPassword').value;

    const submitButton = document.querySelector(
      '#accountForm button[type="submit"]'
    );

    if (submitButton) submitButton.disabled = true;

    showAccountMessage('Please wait…');

    try {
      if (accountMode === 'signup') {
        const { data, error } = await supabaseClient.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: SITE_URL
          }
        });

        if (error) throw error;

        if (data.session) {
          showAccountMessage(
            'Account created and signed in successfully.'
          );
        } else {
          showAccountMessage(
            'Registration submitted. Check your email to confirm your account before signing in.'
          );
        }
      } else {
        const { error } =
          await supabaseClient.auth.signInWithPassword({
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

      if (submitButton) {
        submitButton.disabled = Boolean(data.session);
      }
    }
  }
);
async function signOutAccount() {
  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    showAccountMessage('Could not sign out. Please try again.');
    return;
  }

  accountMode = 'signin';

  document.getElementById('accountForm')?.reset();
  setText('accountTitle', 'Sign in');

  const submitButton = document.querySelector(
    '#accountForm button[type="submit"]'
  );

  if (submitButton) {
    submitButton.textContent = 'Sign in';
    submitButton.disabled = false;
  }

  const modeButton = document.getElementById('accountModeButton');

  if (modeButton) {
    modeButton.textContent = 'Need an account? Register';
    modeButton.classList.remove('hidden');
  }

  const signOutButton = document.getElementById('signOutButton');

  if (signOutButton) {
    signOutButton.classList.add('hidden');
  }

  const email = document.getElementById('accountEmail');
  const password = document.getElementById('accountPassword');

  if (email) email.disabled = false;
  if (password) password.disabled = false;

  showAccountMessage('You have signed out.');
}

// Click the challenge board to set coordinates

document.getElementById('board')?.addEventListener('click', (event) => {
  const board = event.currentTarget;
  const rect = board.getBoundingClientRect();

  if (!rect.width || !rect.height) return;

  const x = Math.max(
    0,
    Math.min(
      100,
      Math.round(((event.clientX - rect.left) / rect.width) * 100)
    )
  );

  const y = Math.max(
    0,
    Math.min(
      100,
      Math.round(((event.clientY - rect.top) / rect.height) * 100)
    )
  );

  const xInput = document.getElementById('x');
  const yInput = document.getElementById('y');

  if (xInput) xInput.value = x;
  if (yInput) yInput.value = y;
});

// Handle PayFast return safely.
// A return to the site does NOT prove payment succeeded.

(function handlePaymentReturn() {
  const params = new URLSearchParams(window.location.search);
  const payment = params.get('payment');

  if (payment === 'returned') {
    setChallengeMessage(
      'You returned from PayFast. Payment is not confirmed by this page; the server must verify it before an entry is counted.'
    );
  } else if (payment === 'cancelled') {
    setChallengeMessage(
      'Checkout was cancelled. No entry is confirmed unless the server verifies a successful payment.'
    );
  }

  if (payment) {
    params.delete('payment');
    params.delete('order_id');

    const query = params.toString();

    const cleanUrl =
      `${window.location.pathname}` +
      `${query ? `?${query}` : ''}` +
      `${window.location.hash}`;

    window.history.replaceState({}, document.title, cleanUrl);
  }
})();

// Keep the interface updated after authentication changes

supabaseClient.auth.onAuthStateChange(() => {
  refreshAccount();
});

// Load competitions when the page starts

loadCompetitions();
refreshAccount();
