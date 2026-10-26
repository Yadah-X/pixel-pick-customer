
/* =========================================================
   PIXEL PICK — CUSTOMER WEBSITE
   Accounts, password reset, navigation, competitions,
   challenge verification and Sandbox checkout.
   ========================================================= */

const SUPABASE_URL = 'https://cxhclxtbtrsyfigqleeg.supabase.co';
const SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_N4pRAlpCzjTEoKR7TCYOEA_Irj7mCrv';

const SITE_URL = 'https://pixel-pick-customer.onrender.com';

const VERIFY_CHALLENGE_URL =
  `${SUPABASE_URL}/functions/v1/verify-skill-challenge`;

const CREATE_PAYMENT_ORDER_URL =
  `${SUPABASE_URL}/functions/v1/create-payment-order`;

const ACCOUNT_HISTORY_URL =
  `${SUPABASE_URL}/functions/v1/my-account-history`;

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

const modal = document.getElementById('modal');
const accountModal = document.getElementById('accountModal');

let accountMode = 'signin';
let selectedCompetitionId = null;
let selectedCompetitionName = 'Competition';
let activeChallengeId = null;
let challengeBusy = false;
let historyRequestNumber = 0;

function element(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const node = element(id);
  if (node) node.textContent = value;
}

function setHidden(id, hidden) {
  const node = element(id);
  if (node) node.classList.toggle('hidden', hidden);
}

function makeParagraph(message) {
  const p = document.createElement('p');
  p.textContent = message;
  return p;
}

function showAccountMessage(message) {
  setText('accountMessage', message);
}

function setChallengeMessage(message) {
  setText('challengeMessage', message);
  setText('competitionMessage', message);
}

function formatDate(value) {
  if (!value) return 'Date unavailable';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';

  return date.toLocaleString('en-ZA', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

function formatRand(cents) {
  const amount = Number(cents);
  if (!Number.isFinite(amount)) return 'Price unavailable';

  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR'
  }).format(amount / 100);
}

async function getAccessToken() {
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) throw error;

  const token = data.session?.access_token;
  if (!token) {
    throw new Error('Please sign in before continuing.');
  }

  return token;
}

async function callEdgeFunction(url, body) {
  const token = await getAccessToken();

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_PUBLISHABLE_KEY
    },
    body: JSON.stringify(body)
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      typeof result.error === 'string'
        ? result.error
        : `The server request failed (${response.status}).`
    );
  }

  return result;
}

/* -------------------------
   Navigation menu
------------------------- */

function setupMenu() {
  const toggle = element('menuToggle');
  const panel = element('menuPanel');

  if (!toggle || !panel) return;

  function closeMenu() {
    panel.classList.add('hidden');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open navigation menu');
  }

  toggle.addEventListener('click', (event) => {
    event.stopPropagation();

    const open = panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute(
      'aria-label',
      open ? 'Close navigation menu' : 'Open navigation menu'
    );
  });

  panel.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', closeMenu);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
  });

  document.addEventListener('click', (event) => {
    if (!panel.contains(event.target) && !toggle.contains(event.target)) {
      closeMenu();
    }
  });
}

/* -------------------------
   Competitions
------------------------- */

async function loadCompetitions() {
  const grid = element('competitionGrid');
  const message = element('competitionMessage');
  if (!grid) return;

  grid.replaceChildren(makeParagraph('Loading competitions…'));
  if (message) message.textContent = '';

  try {
    const { data, error } = await supabaseClient
      .from('competitions')
      .select('id, name, prize_description, entry_price_cents, closes_at')
      .eq('status', 'open')
      .order('created_at', { ascending: false });

    if (error) throw error;

    grid.replaceChildren();

    if (!data?.length) {
      grid.appendChild(
        makeParagraph(
          'There are no open competitions at the moment. Please check back soon.'
        )
      );
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
        'See the competition rules for details.';

      const row = document.createElement('div');
      row.className = 'row';

      const price = document.createElement('b');
      price.textContent = formatRand(competition.entry_price_cents);

      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Start skill challenge';
      button.addEventListener('click', () => {
        openChallenge(competition.id, competition.name);
      });

      row.append(price, button);
      pad.append(pill, title, description, row);
      card.append(visual, pad);
      grid.appendChild(card);
    });
  } catch (error) {
    console.error('Could not load competitions:', error);
    grid.replaceChildren(
      makeParagraph(
        'We could not load competitions. Please refresh the page and try again.'
      )
    );
  }
}

/* -------------------------
   Account and password reset
------------------------- */

function openAccount() {
  if (accountModal) accountModal.classList.remove('hidden');
  refreshAccount();
}

function closeAccount() {
  if (accountModal) accountModal.classList.add('hidden');
}

function setupForgotPassword() {
  const form = element('accountForm');
  const passwordInput = element('accountPassword');

  if (!form || !passwordInput || element('forgotPasswordButton')) return;

  const button = document.createElement('button');
  button.id = 'forgotPasswordButton';
  button.type = 'button';
  button.textContent = 'Forgot password?';
  button.className = 'forgot-password-button';

  passwordInput.insertAdjacentElement('afterend', button);

  button.addEventListener('click', async () => {
    const email = element('accountEmail')?.value.trim();

    if (!email) {
      showAccountMessage(
        'Enter your email address first, then select Forgot password?'
      );
      element('accountEmail')?.focus();
      return;
    }

    button.disabled = true;
    showAccountMessage('Sending password-reset email…');

    try {
      const { error } = await supabaseClient.auth.resetPasswordForEmail(
        email,
        {
          redirectTo: `${SITE_URL}/?reset-password=true`
        }
      );

      if (error) throw error;

      showAccountMessage(
        'If an account exists for that email, a password-reset email will be sent. Check your inbox and spam folder.'
      );
    } catch (error) {
      console.error('Password reset request failed:', error);
      showAccountMessage(
        error.message || 'Could not request a password reset. Please try again.'
      );
    } finally {
      button.disabled = false;
    }
  });
}

function toggleAccountMode() {
  accountMode = accountMode === 'signin' ? 'signup' : 'signin';

  setText(
    'accountTitle',
    accountMode === 'signup' ? 'Create your account' : 'Sign in'
  );

  const submit = document.querySelector(
    '#accountForm button[type="submit"]'
  );

  if (submit) {
    submit.textContent = accountMode === 'signup' ? 'Register' : 'Sign in';
  }

  setText(
    'accountModeButton',
    accountMode === 'signup'
      ? 'Already have an account? Sign in'
      : 'Need an account? Register'
  );

  const password = element('accountPassword');
  if (password) {
    password.autocomplete =
      accountMode === 'signup' ? 'new-password' : 'current-password';
  }

  setHidden('forgotPasswordButton', accountMode !== 'signin');
  showAccountMessage('');
}

function updateAccountInterface(session) {
  const signedIn = Boolean(session?.user);
  const email = session?.user?.email || '';

  // Header: show Sign in when signed out, Sign out when signed in.
  setHidden('accountHeaderButton', signedIn);
  setHidden('headerSignOutButton', !signedIn);

  // My Account: keep the button visible in BOTH states.
  // This fixes the blank/missing account button.
  setHidden('accountSectionButton', false);
  setHidden('accountSectionSignOutButton', !signedIn);

  setText(
    'accountSectionButton',
    signedIn ? 'Account settings' : 'Sign in / Register'
  );

  setText(
    'accountHeaderButton',
    'Sign in / Register'
  );

  setText('headerSignOutButton', 'Sign out');
  setText('accountSectionSignOutButton', 'Sign out');
  setText('signOutButton', 'Sign out');

  // Modal account controls.
  setHidden('signOutButton', !signedIn);
  setHidden('accountModeButton', signedIn);
  setHidden('forgotPasswordButton', signedIn || accountMode !== 'signin');

  const submit = document.querySelector(
    '#accountForm button[type="submit"]'
  );
  const emailInput = element('accountEmail');
  const passwordInput = element('accountPassword');

  if (submit) submit.disabled = signedIn;
  if (emailInput) emailInput.disabled = signedIn;
  if (passwordInput) passwordInput.disabled = signedIn;

  setText(
    'accountStatus',
    signedIn
      ? `Signed in as ${email}.`
      : 'You are currently signed out.'
  );

  setText(
    'entryText',
    signedIn
      ? 'Your challenge and entry history will appear below.'
      : 'Sign in to view your challenge and entry history.'
  );

  setHidden('historySignInButton', signedIn);

  if (!signedIn && submit) {
    submit.textContent =
      accountMode === 'signup' ? 'Register' : 'Sign in';
  }
}

async function refreshAccount() {
  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;

    updateAccountInterface(data.session);

    if (data.session) {
      await loadMyHistory();
    } else {
      const history = element('entryHistory');
      if (history) {
        history.replaceChildren(
          makeParagraph('Sign in to view your history.')
        );
      }
    }
  } catch (error) {
    console.error('Could not refresh account:', error);
    setText('accountStatus', 'Could not check your account. Please refresh.');
  }
}

element('accountForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const email = element('accountEmail')?.value.trim();
  const password = element('accountPassword')?.value;
  const submit = document.querySelector(
    '#accountForm button[type="submit"]'
  );

  if (!email || !password) {
    showAccountMessage('Enter your email address and password.');
    return;
  }

  if (submit) submit.disabled = true;
  showAccountMessage('Please wait…');

  try {
    if (accountMode === 'signup') {
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: SITE_URL }
      });

      if (error) throw error;

      if (data.session) {
        showAccountMessage('Account created successfully.');
        await refreshAccount();
      } else {
        showAccountMessage(
          'Registration submitted. Check your email to confirm your account, then sign in.'
        );
      }
    } else {
      const { error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      showAccountMessage('Signed in successfully.');
      await refreshAccount();
    }
  } catch (error) {
    showAccountMessage(error.message || 'Could not complete the request.');
  } finally {
    const { data } = await supabaseClient.auth.getSession();
    if (submit) submit.disabled = Boolean(data.session);
  }
});

async function signOutAccount() {
  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    showAccountMessage('Could not sign out. Please try again.');
    return;
  }

  accountMode = 'signin';
  element('accountForm')?.reset();

  setText('accountTitle', 'Sign in');
  setText('accountModeButton', 'Need an account? Register');

  const submit = document.querySelector(
    '#accountForm button[type="submit"]'
  );
  if (submit) {
    submit.textContent = 'Sign in';
    submit.disabled = false;
  }

  if (element('accountEmail')) element('accountEmail').disabled = false;
  if (element('accountPassword')) {
    element('accountPassword').disabled = false;
  }

  updateAccountInterface(null);
  showAccountMessage('You have signed out.');
  closeAccount();

  const history = element('entryHistory');
  if (history) {
    history.replaceChildren(makeParagraph('Sign in to view your history.'));
  }
}

/* -------------------------
   Account history
------------------------- */

async function loadMyHistory() {
  const history = element('entryHistory');
  if (!history) return;

  const requestNumber = ++historyRequestNumber;
  history.replaceChildren(makeParagraph('Loading your history…'));

  try {
    const result = await callEdgeFunction(ACCOUNT_HISTORY_URL, {
      action: 'list'
    });

    if (requestNumber !== historyRequestNumber) return;

    if (!result.ok || !Array.isArray(result.items)) {
      throw new Error('The account history service is not ready yet.');
    }

    history.replaceChildren();

    if (result.items.length === 0) {
      history.appendChild(
        makeParagraph(
          'No challenge attempts or competition entries were found for your account.'
        )
      );
      return;
    }

    result.items.forEach((item) => {
      const card = document.createElement('article');
      card.className = 'history-card';

      const title = document.createElement('h3');
      title.textContent = item.competition_name || 'Competition';

      const kind = document.createElement('p');
      kind.textContent =
        item.record_type === 'entry'
          ? 'Competition entry'
          : 'Skill challenge';

      const status = document.createElement('p');
      status.textContent = `Status: ${item.status || 'Unavailable'}`;

      const date = document.createElement('p');
      date.textContent = `Date: ${formatDate(item.created_at)}`;

      card.append(title, kind, status, date);

      if (item.entry_number != null) {
        const number = document.createElement('p');
        number.textContent = `Entry number: ${item.entry_number}`;
        card.appendChild(number);
      }

      history.appendChild(card);
    });
  } catch (error) {
    if (requestNumber !== historyRequestNumber) return;

    console.info('Account history is not available yet:', error.message);
    history.replaceChildren(
      makeParagraph(
        'Your history is temporarily unavailable. Please try again later.'
      )
    );
  }
}

/* -------------------------
   Skill challenge and checkout
------------------------- */

function setChallengeBusy(busy) {
  challengeBusy = busy;
  const button = element('submitChallengeButton');
  if (button) button.disabled = busy;
}

async function openChallenge(competitionId, competitionName = 'Competition') {
  selectedCompetitionId = competitionId;
  selectedCompetitionName = competitionName || 'Competition';
  activeChallengeId = null;

  const { data, error } = await supabaseClient.auth.getSession();

  if (error || !data.session) {
    openAccount();
    showAccountMessage(
      'Please sign in or register before starting a skill challenge.'
    );
    return;
  }

  setText('challengeTitle', `Skill challenge: ${selectedCompetitionName}`);
  setChallengeMessage('Preparing your challenge…');

  if (element('x')) element('x').value = '';
  if (element('y')) element('y').value = '';

  if (modal) modal.classList.remove('hidden');

  const target = document.querySelector('#board .target');
  if (target) {
    target.style.left = '50%';
    target.style.top = '50%';
    target.style.transform = 'translate(-50%, -50%)';
  }

  try {
    setChallengeBusy(true);

    const result = await callEdgeFunction(VERIFY_CHALLENGE_URL, {
      action: 'create',
      competition_id: selectedCompetitionId
    });

    const challenge = result.challenge || result;

    if (
      !challenge.id ||
      !Number.isInteger(challenge.target_x) ||
      !Number.isInteger(challenge.target_y)
    ) {
      throw new Error('The challenge service returned an invalid challenge.');
    }

    activeChallengeId = challenge.id;

    if (target) {
      target.style.left = `${challenge.target_x}%`;
      target.style.top = `${challenge.target_y}%`;
      target.style.transform = 'translate(-50%, -50%)';
    }

    setChallengeMessage(
      'Prototype challenge: the target is currently visible. Do not use this as a production skill test or enable real payments.'
    );
  } catch (error) {
    console.error('Could not create challenge:', error);
    setText('challengeTitle', 'Could not start challenge');
    setChallengeMessage(error.message || 'Please try again.');
  } finally {
    setChallengeBusy(false);
  }
}

function closeChallenge() {
  if (modal) modal.classList.add('hidden');
  activeChallengeId = null;
  challengeBusy = false;
}

async function submitEntry() {
  if (challengeBusy) return;

  const xInput = element('x');
  const yInput = element('y');
  const x = Number(xInput?.value);
  const y = Number(yInput?.value);

  if (!activeChallengeId || !selectedCompetitionId) {
    setChallengeMessage('Please start a new challenge first.');
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
    setChallengeMessage(
      'Choose whole-number X and Y coordinates from 0 to 100.'
    );
    return;
  }

  try {
    setChallengeBusy(true);
    setChallengeMessage('Checking your answer…');

    const verification = await callEdgeFunction(VERIFY_CHALLENGE_URL, {
      action: 'verify',
      challenge_id: activeChallengeId,
      x,
      y
    });

    if (!verification.solved) {
      setChallengeMessage(
        verification.message || 'That answer was not accepted. Please try again.'
      );
      return;
    }

    setChallengeMessage('Challenge solved. Preparing Sandbox checkout…');

    const orderResult = await callEdgeFunction(CREATE_PAYMENT_ORDER_URL, {
      competition_id: selectedCompetitionId,
      challenge_id: activeChallengeId
    });

    if (
      !orderResult.ok ||
      !orderResult.checkout?.url ||
      !orderResult.checkout?.fields ||
      orderResult.sandbox !== true
    ) {
      throw new Error(
        'Sandbox checkout was not confirmed as ready. No payment was submitted.'
      );
    }

    const form = document.createElement('form');
    form.method = 'POST';
    form.action = orderResult.checkout.url;
    form.acceptCharset = 'UTF-8';
    form.style.display = 'none';

    Object.entries(orderResult.checkout.fields).forEach(([name, value]) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = String(value);
      form.appendChild(input);
    });

    document.body.appendChild(form);
    form.submit();
  } catch (error) {
    console.error('Challenge or checkout failed:', error);
    setChallengeMessage(
      `${error.message || 'Something went wrong.'} Payment is not confirmed unless the server verifies it.`
    );
  } finally {
    setChallengeBusy(false);
  }
}

/* -------------------------
   Board coordinates
------------------------- */

element('board')?.addEventListener('click', (event) => {
  const board = event.currentTarget;
  const rect = board.getBoundingClientRect();

  if (!rect.width || !rect.height) return;

  const x = Math.max(
    0,
    Math.min(100, Math.round(((event.clientX - rect.left) / rect.width) * 100))
  );

  const y = Math.max(
    0,
    Math.min(100, Math.round(((event.clientY - rect.top) / rect.height) * 100))
  );

  if (element('x')) element('x').value = x;
  if (element('y')) element('y').value = y;
});

/* -------------------------
   Payment return message
------------------------- */

(function handlePaymentReturn() {
  const params = new URLSearchParams(window.location.search);
  const payment = params.get('payment');

  if (payment === 'returned') {
    setText(
      'competitionMessage',
      'You returned from PayFast. This page alone cannot confirm payment.'
    );
  } else if (payment === 'cancelled') {
    setText(
      'competitionMessage',
      'Checkout was cancelled. No entry is confirmed by this page.'
    );
  }

  if (payment) {
    params.delete('payment');
    params.delete('order_id');

    const query = params.toString();
    const cleanUrl =
      window.location.pathname +
      (query ? `?${query}` : '') +
      window.location.hash;

    window.history.replaceState({}, document.title, cleanUrl);
  }
})();

/* -------------------------
   Start the page
------------------------- */

setupMenu();
setupForgotPassword();

supabaseClient.auth.onAuthStateChange((_event, session) => {
  updateAccountInterface(session);

  if (session?.user) {
    loadMyHistory();
  } else {
    const history = element('entryHistory');
    if (history) {
      history.replaceChildren(makeParagraph('Sign in to view your history.'));
    }
  }
});

loadCompetitions();
refreshAccount();

// Wire up existing account buttons if the HTML does not already do so.
element('accountHeaderButton')?.addEventListener('click', openAccount);
element('accountSectionButton')?.addEventListener('click', openAccount);
element('historySignInButton')?.addEventListener('click', openAccount);


element('headerSignOutButton')?.addEventListener('click', signOutAccount);
element('accountSectionSignOutButton')?.addEventListener('click', signOutAccount);
element('signOutButton')?.addEventListener('click', signOutAccount);

// Keep the account modal easy to close when its close control exists.
element('closeAccountButton')?.addEventListener('click', closeAccount);
