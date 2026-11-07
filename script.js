
/* =========================================================
   PIXEL PICK — CUSTOMER WEBSITE
   Accounts, personal details, password management,
   password reset, navigation, competitions,
   challenge verification, Sandbox checkout and support.
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

/* =========================================================
   15-MINUTE AUTOMATIC INACTIVITY LOGOUT
   ========================================================= */

const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const ACTIVITY_STORAGE_KEY = 'pixelPickLastActivity';

let idleLogoutTimer = null;
let lastActivityAt = 0;
let lastActivitySavedAt = 0;
let idleLogoutInProgress = false;

/* =========================================================
   GENERAL HELPERS
   ========================================================= */

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

  if (Number.isNaN(date.getTime())) {
    return 'Date unavailable';
  }

  return date.toLocaleString('en-ZA', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

function formatRand(cents) {
  const amount = Number(cents);

  if (!Number.isFinite(amount)) {
    return 'Price unavailable';
  }

  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR'
  }).format(amount / 100);
}

async function getAccessToken() {
  const { data, error } =
    await supabaseClient.auth.getSession();

  if (error) throw error;

  const token = data.session?.access_token;

  if (!token) {
    throw new Error(
      'Please sign in before continuing.'
    );
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

/* =========================================================
   AUTOMATIC LOGOUT AFTER 15 MINUTES
   ========================================================= */

function getLastActivityTime() {
  const stored = Number(
    localStorage.getItem(ACTIVITY_STORAGE_KEY)
  );

  return Number.isFinite(stored) && stored > 0
    ? stored
    : Date.now();
}

function saveActivityTime(force = false) {
  const now = Date.now();

  lastActivityAt = now;

  if (
    force ||
    now - lastActivitySavedAt >= 5000
  ) {
    localStorage.setItem(
      ACTIVITY_STORAGE_KEY,
      String(now)
    );

    lastActivitySavedAt = now;
  }

  scheduleIdleLogout();
}

function stopIdleLogout() {
  if (idleLogoutTimer) {
    clearTimeout(idleLogoutTimer);
    idleLogoutTimer = null;
  }

  idleLogoutInProgress = false;
}

function scheduleIdleLogout() {
  if (idleLogoutInProgress) return;

  if (idleLogoutTimer) {
    clearTimeout(idleLogoutTimer);
  }

  const elapsed = Date.now() - lastActivityAt;
  const remaining = IDLE_TIMEOUT_MS - elapsed;

  idleLogoutTimer = setTimeout(() => {
    checkIdleLogout();
  }, Math.max(remaining, 0));
}

async function checkIdleLogout() {
  if (idleLogoutInProgress) return;

  const lastActivity = getLastActivityTime();

  lastActivityAt = lastActivity;

  const elapsed = Date.now() - lastActivity;

  if (elapsed < IDLE_TIMEOUT_MS) {
    scheduleIdleLogout();
    return;
  }

  idleLogoutInProgress = true;

  try {
    await signOutAccount('inactivity');
  } finally {
    idleLogoutInProgress = false;
  }
}

function startIdleLogout(event) {
  if (event === 'SIGNED_IN') {
    saveActivityTime(true);
    return;
  }

  if (!localStorage.getItem(ACTIVITY_STORAGE_KEY)) {
    saveActivityTime(true);
    return;
  }

  lastActivityAt = getLastActivityTime();
  scheduleIdleLogout();
}

function setupInactivityLogout() {
  const activityEvents = [
    'pointerdown',
    'pointermove',
    'keydown',
    'scroll',
    'touchstart',
    'click'
  ];

  activityEvents.forEach((eventName) => {
    document.addEventListener(
      eventName,
      () => {
        if (idleLogoutInProgress) return;

        saveActivityTime();
      },
      { passive: true }
    );
  });

  window.addEventListener('storage', (event) => {
    if (event.key !== ACTIVITY_STORAGE_KEY) return;
    if (!event.newValue) return;

    const timestamp = Number(event.newValue);

    if (Number.isFinite(timestamp)) {
      lastActivityAt = timestamp;
      scheduleIdleLogout();
    }
  });
}

/* =========================================================
   PAGE NAVIGATION
   ========================================================= */

function setupPageNavigation() {
  const homePage = element('homePage');
  const competitions = element('competitions');
  const main = document.querySelector('main');

  if (!homePage || !competitions || !main) return;

  if (competitions.parentElement !== main) {
    homePage.insertAdjacentElement(
      'afterend',
      competitions
    );
  }

  const pages = [
    'entries',
    'referral',
    'accountArea',
    'support'
  ];

  function showPage(page, updateAddress = true) {
    const validPages = [
      'home',
      'competitions',
      ...pages
    ];

    if (!validPages.includes(page)) {
      page = 'home';
    }

    homePage.classList.add('page-hidden');
    competitions.classList.add('page-hidden');

    pages.forEach((id) => {
      element(id)?.classList.add('page-hidden');
    });

    if (page === 'home') {
      homePage.classList.remove('page-hidden');
      competitions.classList.remove('page-hidden');

    } else if (page === 'competitions') {
      competitions.classList.remove('page-hidden');

    } else {
      element(page)?.classList.remove('page-hidden');
    }

    if (updateAddress) {
      const newHash = `#${page}`;

      if (window.location.hash !== newHash) {
        window.history.pushState(
          { page },
          '',
          newHash
        );
      }
    }

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  }

  document.querySelectorAll('a[data-page]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();

      showPage(link.dataset.page);
      closeNavigationMenu();
    });
  });

  document.querySelectorAll('a[href="#home"]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();

      showPage('home');
      closeNavigationMenu();
    });
  });

  window.addEventListener('popstate', () => {
    const page =
      window.location.hash.replace('#', '') || 'home';

    showPage(page, false);
  });

  const initialPage =
    window.location.hash.replace('#', '') || 'home';

  showPage(initialPage, false);
}

/* =========================================================
   NAVIGATION MENU
   ========================================================= */

function closeNavigationMenu() {
  const toggle = element('menuToggle');
  const panel = element('menuPanel');

  if (!toggle || !panel) return;

  panel.classList.add('hidden');

  toggle.setAttribute('aria-expanded', 'false');

  toggle.setAttribute(
    'aria-label',
    'Open navigation menu'
  );
}

function setupMenu() {
  const toggle = element('menuToggle');
  const panel = element('menuPanel');

  if (!toggle || !panel) return;

  toggle.addEventListener('click', (event) => {
    event.stopPropagation();

    const open = panel.classList.contains('hidden');

    panel.classList.toggle('hidden', !open);

    toggle.setAttribute(
      'aria-expanded',
      String(open)
    );

    toggle.setAttribute(
      'aria-label',
      open
        ? 'Close navigation menu'
        : 'Open navigation menu'
    );
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeNavigationMenu();
    }
  });

  document.addEventListener('click', (event) => {
    if (
      !panel.contains(event.target) &&
      !toggle.contains(event.target)
    ) {
      closeNavigationMenu();
    }
  });
}

/* =========================================================
   COMPETITIONS
   ========================================================= */

async function loadCompetitions() {
  const grid = element('competitionGrid');
  const message = element('competitionMessage');

  if (!grid) return;

  grid.replaceChildren(
    makeParagraph('Loading competitions…')
  );

  if (message) message.textContent = '';

  try {
    const { data, error } = await supabaseClient
      .from('competitions')
      .select(
        'id, name, prize_description, entry_price_cents, closes_at'
      )
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

      price.textContent = formatRand(
        competition.entry_price_cents
      );

      const button = document.createElement('button');

      button.type = 'button';
      button.textContent = 'Start skill challenge';

      button.addEventListener('click', () => {
        openChallenge(
          competition.id,
          competition.name
        );
      });

      row.append(price, button);
      pad.append(pill, title, description, row);
      card.append(visual, pad);

      grid.appendChild(card);
    });

  } catch (error) {
    console.error(
      'Could not load competitions:',
      error
    );

    grid.replaceChildren(
      makeParagraph(
        'We could not load competitions. Please refresh the page and try again.'
      )
    );
  }
}

/* =========================================================
   ACCOUNT AND PASSWORD RESET
   ========================================================= */

function openAccount() {
  if (accountModal) {
    accountModal.classList.remove('hidden');
  }

  refreshAccount();
}

function closeAccount() {
  if (accountModal) {
    accountModal.classList.add('hidden');
  }
}

/* =========================================================
   AUTOMATIC HOME REDIRECT AFTER SIGN-IN / REGISTRATION
   ========================================================= */

function finishSuccessfulAuthentication() {
  // Close the sign-in or registration window.
  closeAccount();

  // Close the navigation menu if it is open.
  closeNavigationMenu();

  // Navigate to Home using the existing navigation handler.
  const homeLink = document.querySelector('a[href="#home"]');

  if (homeLink) {
    homeLink.click();
  } else {
    // Fallback in case the Home link is unavailable.
    window.location.hash = 'home';
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  }
}

function setupForgotPassword() {
  const form = element('accountForm');
  const passwordInput = element('accountPassword');

  if (
    !form ||
    !passwordInput ||
    element('forgotPasswordButton')
  ) {
    return;
  }

  const button = document.createElement('button');

  button.id = 'forgotPasswordButton';
  button.type = 'button';
  button.textContent = 'Forgot password?';
  button.className = 'forgot-password-button';

  passwordInput.insertAdjacentElement(
    'afterend',
    button
  );

  button.addEventListener('click', async () => {
    const email =
      element('accountEmail')?.value.trim();

    if (!email) {
      showAccountMessage(
        'Enter your email address first, then select Forgot password?'
      );

      element('accountEmail')?.focus();
      return;
    }

    button.disabled = true;

    showAccountMessage(
      'Sending password-reset email…'
    );

    try {
      const { error } =
        await supabaseClient.auth.resetPasswordForEmail(
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
      console.error(
        'Password reset request failed:',
        error
      );

      showAccountMessage(
        error.message ||
        'Could not request a password reset. Please try again.'
      );

    } finally {
      button.disabled = false;
    }
  });
}

function updateRegistrationFields(signedIn = false) {
  const registering =
    accountMode === 'signup' && !signedIn;

  setHidden('registrationFields', !registering);
  setHidden('confirmPasswordField', !registering);

  const firstName = element('accountFirstName');
  const lastName = element('accountLastName');
  const confirmPassword =
    element('accountConfirmPassword');

  const phone = element('accountPhone');

  if (firstName) {
    firstName.required = registering;
    firstName.disabled = signedIn;
  }

  if (lastName) {
    lastName.required = registering;
    lastName.disabled = signedIn;
  }

  if (confirmPassword) {
    confirmPassword.required = registering;
    confirmPassword.disabled = signedIn;
  }

  // Phone number is optional. No SMS verification is used.
  if (phone) {
    phone.required = false;
    phone.disabled = signedIn;
  }
}

function toggleAccountMode() {
  accountMode =
    accountMode === 'signin' ? 'signup' : 'signin';

  setText(
    'accountTitle',
    accountMode === 'signup'
      ? 'Create your account'
      : 'Sign in'
  );

  const submit = document.querySelector(
    '#accountForm button[type="submit"]'
  );

  if (submit) {
    submit.textContent =
      accountMode === 'signup'
        ? 'Register'
        : 'Sign in';
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
      accountMode === 'signup'
        ? 'new-password'
        : 'current-password';
  }

  updateRegistrationFields(false);

  setHidden(
    'forgotPasswordButton',
    accountMode !== 'signin'
  );

  showAccountMessage('');
}

/* =========================================================
   PERSONAL DETAILS DISPLAY
   ========================================================= */

function renderPersonalDetails(user) {
  const panel = element('personalDetailsPanel');

  if (!panel) return;

  if (!user) {
    panel.classList.add('hidden');
    return;
  }

  panel.classList.remove('hidden');

  const metadata = user.user_metadata || {};

  if (element('profileFirstName')) {
    element('profileFirstName').value =
      metadata.first_name || '';
  }

  if (element('profileLastName')) {
    element('profileLastName').value =
      metadata.last_name || '';
  }

  if (element('profilePhone')) {
    element('profilePhone').value =
      metadata.phone_number || '';
  }

  if (element('profileEmail')) {
    element('profileEmail').value =
      user.email || '';
  }

  const verified = Boolean(
    user.email_confirmed_at || user.confirmed_at
  );

  setText(
    'emailVerificationStatus',
    verified
      ? 'Email address: Verified'
      : 'Email address: Not yet verified'
  );

  setText(
    'accountCreatedDate',
    formatDate(user.created_at)
  );
}

/* =========================================================
   ACCOUNT INTERFACE
   ========================================================= */

function updateAccountInterface(session) {
  const signedIn = Boolean(session?.user);
  const email = session?.user?.email || '';

  setHidden('accountHeaderButton', signedIn);
  setHidden('headerSignOutButton', !signedIn);

  setHidden('accountSectionButton', false);
  setHidden('accountSectionSignOutButton', !signedIn);

  setText(
    'accountSectionButton',
    signedIn
      ? 'Account settings'
      : 'Sign in / Register'
  );

  setText(
    'accountHeaderButton',
    'Sign in / Register'
  );

  setText('headerSignOutButton', 'Sign out');
  setText('accountSectionSignOutButton', 'Sign out');
  setText('signOutButton', 'Sign out');

  setHidden('signOutButton', !signedIn);
  setHidden('accountModeButton', signedIn);

  setHidden(
    'forgotPasswordButton',
    signedIn || accountMode !== 'signin'
  );

  const submit = document.querySelector(
    '#accountForm button[type="submit"]'
  );

  const emailInput = element('accountEmail');
  const passwordInput = element('accountPassword');

  if (submit) submit.disabled = signedIn;
  if (emailInput) emailInput.disabled = signedIn;
  if (passwordInput) passwordInput.disabled = signedIn;

  updateRegistrationFields(signedIn);

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
  setHidden('clearHistoryButton', !signedIn);

  if (!signedIn && submit) {
    submit.textContent =
      accountMode === 'signup'
        ? 'Register'
        : 'Sign in';
  }

  // Show personal details only for signed-in customers.
  renderPersonalDetails(session?.user || null);
}

/* =========================================================
   SAVE PERSONAL DETAILS
   ========================================================= */

element('personalDetailsForm')?.addEventListener(
  'submit',
  async (event) => {
    event.preventDefault();

    const button = element('savePersonalDetailsButton');
    const message = element('personalDetailsMessage');

    const firstName =
      element('profileFirstName')?.value.trim();

    const lastName =
      element('profileLastName')?.value.trim();

    const phone =
      element('profilePhone')?.value.trim() || '';

    const newEmail =
      element('profileEmail')?.value.trim();

    if (message) message.textContent = '';

    if (!firstName || !lastName || !newEmail) {
      if (message) {
        message.textContent =
          'Please enter your first name, surname and email address.';
      }

      return;
    }

    if (
      firstName.length > 80 ||
      lastName.length > 80
    ) {
      if (message) {
        message.textContent =
          'Your first name and surname must each be no longer than 80 characters.';
      }

      return;
    }

    if (phone.length > 30) {
      if (message) {
        message.textContent =
          'Your phone number must be no longer than 30 characters.';
      }

      return;
    }

    if (button) button.disabled = true;

    if (message) {
      message.textContent = 'Saving your details…';
    }

    try {
      const {
        data: userData,
        error: userError
      } = await supabaseClient.auth.getUser();

      if (userError) throw userError;

      const user = userData.user;

      if (!user) {
        throw new Error('Please sign in again.');
      }

      // Save first name, surname and optional phone number.
      const { error: detailsError } =
        await supabaseClient.auth.updateUser({
          data: {
            first_name: firstName,
            last_name: lastName,
            phone_number: phone
          }
        });

      if (detailsError) throw detailsError;

      // Change email separately if the customer entered a new one.
      if (
        newEmail.toLowerCase() !==
        (user.email || '').toLowerCase()
      ) {
        const { error: emailError } =
          await supabaseClient.auth.updateUser({
            email: newEmail
          });

        if (emailError) throw emailError;

        if (message) {
          message.textContent =
            'Your personal details have been saved. Please check your email for confirmation instructions to complete your email address change.';
        }

      } else {
        if (message) {
          message.textContent =
            'Your personal details have been saved successfully.';
        }
      }

      await refreshAccount();

    } catch (error) {
      console.error(
        'Could not update personal details:',
        error
      );

      if (message) {
        message.textContent =
          error.message ||
          'Could not save your details. Please try again.';
      }

    } finally {
      if (button) button.disabled = false;
    }
  }
);

/* =========================================================
   CHANGE ACCOUNT PASSWORD
   ========================================================= */

element('changePasswordForm')?.addEventListener(
  'submit',
  async (event) => {
    event.preventDefault();

    const button = element('changePasswordButton');
    const message = element('changePasswordMessage');

    const password =
      element('newAccountPassword')?.value || '';

    const confirmation =
      element('confirmNewAccountPassword')?.value || '';

    if (message) message.textContent = '';

    if (password.length < 8) {
      if (message) {
        message.textContent =
          'Your new password must contain at least 8 characters.';
      }

      return;
    }

    if (password !== confirmation) {
      if (message) {
        message.textContent =
          'Your new passwords do not match.';
      }

      return;
    }

    if (button) button.disabled = true;

    if (message) {
      message.textContent = 'Updating your password…';
    }

    try {
      const { data } =
        await supabaseClient.auth.getSession();

      if (!data.session) {
        throw new Error('Please sign in again.');
      }

      const { error } =
        await supabaseClient.auth.updateUser({
          password
        });

      if (error) throw error;

      element('changePasswordForm')?.reset();

      if (message) {
        message.textContent =
          'Your password has been updated successfully.';
      }

    } catch (error) {
      console.error(
        'Could not update password:',
        error
      );

      if (message) {
        message.textContent =
          error.message ||
          'Could not update your password. Please try again.';
      }

    } finally {
      if (button) button.disabled = false;
    }
  }
);

/* =========================================================
   REFRESH ACCOUNT AND ACCOUNT HISTORY
   ========================================================= */

async function refreshAccount() {
  try {
    const { data, error } =
      await supabaseClient.auth.getSession();

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
    console.error(
      'Could not refresh account:',
      error
    );

    setText(
      'accountStatus',
      'Could not check your account. Please refresh.'
    );
  }
}

/* =========================================================
   REGISTRATION AND SIGN-IN
   ========================================================= */

element('accountForm')?.addEventListener(
  'submit',
  async (event) => {
    event.preventDefault();

    const email =
      element('accountEmail')?.value.trim();

    const password =
      element('accountPassword')?.value;

    const firstName =
      element('accountFirstName')?.value.trim();

    const lastName =
      element('accountLastName')?.value.trim();

    const phone =
      element('accountPhone')?.value.trim() || '';

    const confirmPassword =
      element('accountConfirmPassword')?.value;

    const submit = document.querySelector(
      '#accountForm button[type="submit"]'
    );

    if (!email || !password) {
      showAccountMessage(
        'Enter your email address and password.'
      );

      return;
    }

    if (submit) submit.disabled = true;

    showAccountMessage('Please wait…');

    try {
      if (accountMode === 'signup') {

        if (!firstName || !lastName) {
          throw new Error(
            'Please enter your first name and surname.'
          );
        }

        if (
          firstName.length > 80 ||
          lastName.length > 80
        ) {
          throw new Error(
            'Your first name and surname must each be no longer than 80 characters.'
          );
        }

        if (phone.length > 30) {
          throw new Error(
            'Your phone number must be no longer than 30 characters.'
          );
        }

        if (password.length < 8) {
          throw new Error(
            'Your password must contain at least 8 characters.'
          );
        }

        if (!confirmPassword) {
          throw new Error(
            'Please confirm your password.'
          );
        }

        if (password !== confirmPassword) {
          throw new Error(
            'Your passwords do not match. Please check and try again.'
          );
        }

        const { data, error } =
          await supabaseClient.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: SITE_URL,
              data: {
                first_name: firstName,
                last_name: lastName,
                phone_number: phone
              }
            }
          });

        if (error) throw error;

        if (data.session) {
          showAccountMessage(
            'Your account has been created successfully.'
          );

          await refreshAccount();

          // Automatically close the account window and go Home.
          finishSuccessfulAuthentication();

        } else {
          if (element('accountPassword')) {
            element('accountPassword').value = '';
          }

          if (element('accountConfirmPassword')) {
            element('accountConfirmPassword').value = '';
          }

          showAccountMessage(
            'Registration successful! Please check your email and click the confirmation link before signing in. Also check your spam folder.'
          );
        }

      } else {

        const { error } =
          await supabaseClient.auth.signInWithPassword({
            email,
            password
          });

        if (error) throw error;

        showAccountMessage(
          'Signed in successfully.'
        );

        await refreshAccount();

        // Automatically close the account window and go Home.
        finishSuccessfulAuthentication();
      }

    } catch (error) {
      console.error(
        'Account registration or sign-in failed:',
        error
      );

      showAccountMessage(
        error.message ||
        'Could not complete the request.'
      );

    } finally {
      const { data } =
        await supabaseClient.auth.getSession();

      if (submit) {
        submit.disabled = Boolean(data.session);
      }
    }
  }
);

/* =========================================================
   SIGN OUT
   ========================================================= */

async function signOutAccount(reason = 'manual') {
  stopIdleLogout();

  const { error } =
    await supabaseClient.auth.signOut();

  if (error) {
    showAccountMessage(
      'Could not sign out. Please try again.'
    );

    return;
  }

  localStorage.removeItem(ACTIVITY_STORAGE_KEY);

  accountMode = 'signin';

  element('accountForm')?.reset();

  setText('accountTitle', 'Sign in');

  setText(
    'accountModeButton',
    'Need an account? Register'
  );

  const submit = document.querySelector(
    '#accountForm button[type="submit"]'
  );

  if (submit) {
    submit.textContent = 'Sign in';
    submit.disabled = false;
  }

  if (element('accountEmail')) {
    element('accountEmail').disabled = false;
  }

  if (element('accountPassword')) {
    element('accountPassword').disabled = false;
  }

  updateAccountInterface(null);

  showAccountMessage(
    reason === 'inactivity'
      ? 'You have been signed out because your account was inactive for 15 minutes. Please sign in again.'
      : 'You have signed out.'
  );

  closeAccount();
  closeNavigationMenu();

  const history = element('entryHistory');

  if (history) {
    history.replaceChildren(
      makeParagraph('Sign in to view your history.')
    );
  }
}

/* =========================================================
   ACCOUNT HISTORY — LOAD AND CLEAR HISTORY
   ========================================================= */

async function loadMyHistory() {
  const history = element('entryHistory');

  if (!history) return;

  const requestNumber = ++historyRequestNumber;

  history.replaceChildren(
    makeParagraph('Loading your history…')
  );

  try {
    const result = await callEdgeFunction(
      ACCOUNT_HISTORY_URL,
      { action: 'list' }
    );

    if (requestNumber !== historyRequestNumber) return;

    if (
      !result.ok ||
      !Array.isArray(result.items)
    ) {
      throw new Error(
        'The account history service is not ready yet.'
      );
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

      title.textContent =
        item.competition_name || 'Competition';

      const kind = document.createElement('p');

      kind.textContent =
        item.record_type === 'entry'
          ? 'Competition entry'
          : 'Skill challenge';

      const status = document.createElement('p');

      status.textContent =
        `Status: ${item.status || 'Unavailable'}`;

      const date = document.createElement('p');

      date.textContent =
        `Date: ${formatDate(item.created_at)}`;

      card.append(title, kind, status, date);

      if (item.entry_number != null) {
        const number = document.createElement('p');

        number.textContent =
          `Entry number: ${item.entry_number}`;

        card.appendChild(number);
      }

      history.appendChild(card);
    });

  } catch (error) {
    if (requestNumber !== historyRequestNumber) return;

    console.info(
      'Account history is not available yet:',
      error.message
    );

    history.replaceChildren(
      makeParagraph(
        'Your history is temporarily unavailable. Please try again later.'
      )
    );
  }
}

/* =========================================================
   CLEAR HISTORY — CONFIRMATION POP-UP
   ========================================================= */

function openClearHistoryModal() {
  const modal = element('clearHistoryModal');
  const message = element('clearHistoryMessage');

  if (!modal) return;

  if (message) {
    message.textContent = '';
  }

  modal.classList.remove('hidden');
}

function closeClearHistoryModal() {
  const modal = element('clearHistoryModal');

  if (modal) {
    modal.classList.add('hidden');
  }

  const message = element('clearHistoryMessage');

  if (message) {
    message.textContent = '';
  }
}

/* =========================================================
   CONFIRM CLEAR HISTORY
   ========================================================= */

async function confirmClearHistory() {
  const button = element('confirmClearHistoryButton');
  const message = element('clearHistoryMessage');

  if (button) {
    button.disabled = true;
    button.textContent = 'Clearing history…';
  }

  if (message) {
    message.textContent =
      'Please wait while your history is cleared…';
  }

  try {
    const result = await callEdgeFunction(
      ACCOUNT_HISTORY_URL,
      { action: 'clear' }
    );

    if (!result.ok) {
      throw new Error(
        result.error ||
        'Could not clear your history.'
      );
    }

    closeClearHistoryModal();

    await loadMyHistory();

    setText(
      'entryText',
      'Your account history has been cleared from your account view. Your original entry and payment records remain securely retained.'
    );

  } catch (error) {
    console.error(
      'Could not clear account history:',
      error
    );

    if (message) {
      message.textContent =
        error.message ||
        'Could not clear your history. Please try again.';
    }

  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'Yes, Clear History';
    }
  }
}

/* =========================================================
   CLEAR HISTORY BUTTON EVENTS
   ========================================================= */

element('clearHistoryButton')
  ?.addEventListener(
    'click',
    openClearHistoryModal
  );

element('cancelClearHistoryButton')
  ?.addEventListener(
    'click',
    closeClearHistoryModal
  );

element('closeClearHistoryModal')
  ?.addEventListener(
    'click',
    closeClearHistoryModal
  );

element('confirmClearHistoryButton')
  ?.addEventListener(
    'click',
    confirmClearHistory
  );

/* Close the confirmation window when clicking outside it. */

element('clearHistoryModal')
  ?.addEventListener(
    'click',
    (event) => {
      if (
        event.target ===
        element('clearHistoryModal')
      ) {
        closeClearHistoryModal();
      }
    }
  );

/* Close the confirmation window with Escape. */

document.addEventListener(
  'keydown',
  (event) => {
    if (
      event.key === 'Escape' &&
      !element('clearHistoryModal')?.classList.contains('hidden')
    ) {
      closeClearHistoryModal();
    }
  }
);

/* =========================================================
   SKILL CHALLENGE AND CHECKOUT
   ========================================================= */

function setChallengeBusy(busy) {
  challengeBusy = busy;

  const button = element('submitChallengeButton');

  if (button) button.disabled = busy;
}

async function openChallenge(
  competitionId,
  competitionName = 'Competition'
) {
  selectedCompetitionId = competitionId;

  selectedCompetitionName =
    competitionName || 'Competition';

  activeChallengeId = null;

  const { data, error } =
    await supabaseClient.auth.getSession();

  if (error || !data.session) {
    openAccount();

    showAccountMessage(
      'Please sign in or register before starting a skill challenge.'
    );

    return;
  }

  setText(
    'challengeTitle',
    `Skill challenge: ${selectedCompetitionName}`
  );

  setChallengeMessage(
    'Preparing your challenge…'
  );

  if (element('x')) element('x').value = '';
  if (element('y')) element('y').value = '';

  if (modal) modal.classList.remove('hidden');

  const target = document.querySelector(
    '#board .target'
  );

  if (target) {
    target.style.left = '50%';
    target.style.top = '50%';

    target.style.transform =
      'translate(-50%, -50%)';
  }

  try {
    setChallengeBusy(true);

    const result = await callEdgeFunction(
      VERIFY_CHALLENGE_URL,
      {
        action: 'create',
        competition_id: selectedCompetitionId
      }
    );

    const challenge =
      result.challenge || result;

    if (
      !challenge.id ||
      !Number.isInteger(challenge.target_x) ||
      !Number.isInteger(challenge.target_y)
    ) {
      throw new Error(
        'The challenge service returned an invalid challenge.'
      );
    }

    activeChallengeId = challenge.id;

    if (target) {
      target.style.left =
        `${challenge.target_x}%`;

      target.style.top =
        `${challenge.target_y}%`;

      target.style.transform =
        'translate(-50%, -50%)';
    }

    setChallengeMessage(
      'Prototype challenge: the target is currently visible. Do not use this as a production skill test or enable real payments.'
    );

  } catch (error) {
    console.error(
      'Could not create challenge:',
      error
    );

    setText(
      'challengeTitle',
      'Could not start challenge'
    );

    setChallengeMessage(
      error.message || 'Please try again.'
    );

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
    setChallengeMessage(
      'Please start a new challenge first.'
    );

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

    setChallengeMessage(
      'Checking your answer…'
    );

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
      setChallengeMessage(
        verification.message ||
        'That answer was not accepted. Please try again.'
      );

      return;
    }

    setChallengeMessage(
      'Challenge solved. Preparing Sandbox checkout…'
    );

    const orderResult = await callEdgeFunction(
      CREATE_PAYMENT_ORDER_URL,
      {
        competition_id: selectedCompetitionId,
        challenge_id: activeChallengeId
      }
    );

    // Keep the Sandbox-only protection.
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
    console.error(
      'Challenge or checkout failed:',
      error
    );

    setChallengeMessage(
      `${error.message || 'Something went wrong.'} Payment is not confirmed unless the server verifies it.`
    );

  } finally {
    setChallengeBusy(false);
  }
}

/* =========================================================
   BOARD COORDINATES
   ========================================================= */

element('board')?.addEventListener(
  'click',
  (event) => {
    const board = event.currentTarget;
    const rect = board.getBoundingClientRect();

    if (!rect.width || !rect.height) return;

    const x = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          ((event.clientX - rect.left) / rect.width) * 100
        )
      )
    );

    const y = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          ((event.clientY - rect.top) / rect.height) * 100
        )
      )
    );

    if (element('x')) element('x').value = x;
    if (element('y')) element('y').value = y;
  }
);

/* =========================================================
   PAYMENT RETURN MESSAGE
   ========================================================= */

(function handlePaymentReturn() {
  const params = new URLSearchParams(
    window.location.search
  );

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

    window.history.replaceState(
      {},
      document.title,
      cleanUrl
    );
  }
})();

/* =========================================================
   CUSTOMER SUPPORT
   ========================================================= */

element('supportForm')?.addEventListener(
  'submit',
  async (event) => {
    event.preventDefault();

    const form = event.currentTarget;
    const button = element('supportSubmitButton');
    const status = element('supportMessageStatus');

    const topic =
      element('supportTopic')?.value.trim();

    const message =
      element('supportMessage')?.value.trim();

    if (status) status.textContent = '';

    try {
      if (button) button.disabled = true;

      const {
        data,
        error: authError
      } = await supabaseClient.auth.getUser();

      if (authError) throw authError;

      const user = data.user;

      if (!user || !user.email) {
        throw new Error(
          'Please sign in before submitting a support enquiry.'
        );
      }

      if (
        !topic ||
        !message ||
        message.length < 10
      ) {
        throw new Error(
          'Please select a topic and enter a message of at least 10 characters.'
        );
      }

      const { error } = await supabaseClient
        .from('support_requests')
        .insert({
          user_id: user.id,
          email: user.email,
          topic,
          message
        });

      if (error) throw error;

      if (status) {
        status.textContent =
          'Thank you! Your support enquiry has been received.';
      }

      form.reset();

    } catch (error) {
      console.error(
        'Support enquiry failed:',
        error
      );

      if (status) {
        status.textContent =
          error.message ||
          'Could not submit your enquiry. Please try again.';
      }

    } finally {
      if (button) button.disabled = false;
    }
  }
);

/* =========================================================
   START THE WEBSITE
   ========================================================= */

setupPageNavigation();
setupMenu();
setupInactivityLogout();

setupForgotPassword();

supabaseClient.auth.onAuthStateChange(
  (event, session) => {
    updateAccountInterface(session);

    if (session?.user) {
      startIdleLogout(event);
    } else {
      stopIdleLogout();
    }

    if (session?.user) {
      loadMyHistory();

    } else {
      const history = element('entryHistory');

      if (history) {
        history.replaceChildren(
          makeParagraph('Sign in to view your history.')
        );
      }
    }
  }
);

loadCompetitions();
refreshAccount();

/* =========================================================
   ACCOUNT BUTTONS
   ========================================================= */

element('accountHeaderButton')
  ?.addEventListener('click', openAccount);

element('accountSectionButton')
  ?.addEventListener('click', openAccount);

element('historySignInButton')
  ?.addEventListener('click', openAccount);

element('headerSignOutButton')
  ?.addEventListener('click', signOutAccount);

element('accountSectionSignOutButton')
  ?.addEventListener('click', signOutAccount);

element('signOutButton')
  ?.addEventListener('click', signOutAccount);

element('closeAccountButton')
  ?.addEventListener('click', closeAccount);
