/* =========================================================
   PIXEL PICK — CUSTOMER WEBSITE
   Accounts, personal details, navigation, competitions,
   ten-task visual game, Sandbox PayFast checkout,
   account history, referrals and customer support.
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

const START_COMPETITION_ATTEMPT_URL =
  `${SUPABASE_URL}/functions/v1/start-competition-attempt`;

const SUBMIT_COMPETITION_ANSWER_URL =
  `${SUPABASE_URL}/functions/v1/submit-competition-answer`;

const PENDING_REFERRAL_STORAGE_KEY = 'pixelPickPendingReferralCode';
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const ACTIVITY_STORAGE_KEY = 'pixelPickLastActivity';
const CHECKOUT_STORAGE_KEY = 'pixelPickCheckoutInProgress';

const GAME_PAYMENT_WINDOW_MS = 30 * 60 * 1000;

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

const modal = document.getElementById('modal');
const accountModal = document.getElementById('accountModal');

let accountMode = 'signin';

let historyRequestNumber = 0;
let referralRequestNumber = 0;

let activeGameAttempt = null;
let activeGameTasks = [];
let activeGameCompletedTaskIds = [];
let activeGameEntryId = null;
let activeGameCompetitionId = null;
let activeGameNeedsPayment = false;

let gameSubmitting = false;
let gamePaymentBusy = false;
let gameCountdownInterval = null;

let idleLogoutTimer = null;
let lastActivityAt = 0;
let lastActivitySavedAt = 0;
let idleLogoutInProgress = false;

let selectedCompetitionId = null;
let selectedCompetitionName = 'Competition';
let activeChallengeId = null;
let challengeBusy = false;

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

function showAccountMessage(message) {
  setText('accountMessage', message);
}

function setChallengeMessage(message) {
  setText('challengeMessage', message);
  setText('competitionMessage', message);
}

async function getAccessToken() {
  const { data, error } =
    await supabaseClient.auth.getSession();

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

/* =========================================================
   CAPTURE REFERRAL CODE
   ========================================================= */

function captureReferralCodeFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const referralCode = params.get('ref');

    if (!referralCode) return;

    const cleanCode = referralCode.trim().toUpperCase();

    if (!/^PP-[A-Z0-9]{12}$/.test(cleanCode)) {
      console.warn('Invalid referral code in URL.');
      return;
    }

    sessionStorage.setItem(
      PENDING_REFERRAL_STORAGE_KEY,
      cleanCode
    );

  } catch (error) {
    console.error('Unable to capture referral code:', error);
  }
}

captureReferralCodeFromUrl();

/* =========================================================
   AUTOMATIC LOGOUT AFTER 15 MINUTES
   ========================================================= */

function isPayFastCheckoutInProgress() {
  return sessionStorage.getItem(CHECKOUT_STORAGE_KEY) === 'true';
}

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

  if (force || now - lastActivitySavedAt >= 5000) {
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
  if (
    idleLogoutInProgress ||
    isPayFastCheckoutInProgress()
  ) {
    return;
  }

  if (idleLogoutTimer) {
    clearTimeout(idleLogoutTimer);
  }

  const elapsed = Date.now() - lastActivityAt;
  const remaining = IDLE_TIMEOUT_MS - elapsed;

  idleLogoutTimer = setTimeout(
    checkIdleLogout,
    Math.max(remaining, 0)
  );
}

async function checkIdleLogout() {
  if (
    idleLogoutInProgress ||
    isPayFastCheckoutInProgress()
  ) {
    return;
  }

  lastActivityAt = getLastActivityTime();

  if (Date.now() - lastActivityAt < IDLE_TIMEOUT_MS) {
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
  [
    'pointerdown',
    'pointermove',
    'keydown',
    'scroll',
    'touchstart',
    'click'
  ].forEach((eventName) => {
    document.addEventListener(
      eventName,
      () => {
        if (idleLogoutInProgress) return;
        if (isPayFastCheckoutInProgress()) return;
        saveActivityTime();
      },
      { passive: true }
    );
  });

  window.addEventListener('storage', (event) => {
    if (
      event.key !== ACTIVITY_STORAGE_KEY ||
      !event.newValue
    ) {
      return;
    }

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
    homePage.insertAdjacentElement('afterend', competitions);
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
        window.history.pushState({ page }, '', newHash);
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
    showPage(
      window.location.hash.replace('#', '') || 'home',
      false
    );
  });

  showPage(
    window.location.hash.replace('#', '') || 'home',
    false
  );
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
  toggle.setAttribute('aria-label', 'Open navigation menu');
}

function setupMenu() {
  const toggle = element('menuToggle');
  const panel = element('menuPanel');

  if (!toggle || !panel) return;

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

      populateReferralCompetitionSelect([]);
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
        startCompetitionGame(
          String(competition.id),
          competition.name || 'Competition',
          'competition'
        );
      });

      row.append(price, button);
      pad.append(pill, title, description, row);
      card.append(visual, pad);
      grid.appendChild(card);
    });

    populateReferralCompetitionSelect(data);

  } catch (error) {
    console.error('Could not load competitions:', error);

    grid.replaceChildren(
      makeParagraph(
        'We could not load competitions. Please refresh the page and try again.'
      )
    );
  }
}

/* =========================================================
   ACCOUNT MODAL AND PASSWORD RESET
   ========================================================= */

function openAccount() {
  accountModal?.classList.remove('hidden');
  refreshAccount();
}

function closeAccount() {
  accountModal?.classList.add('hidden');
}

function finishSuccessfulAuthentication() {
  closeAccount();
  closeNavigationMenu();

  const homeLink = document.querySelector('a[href="#home"]');

  if (homeLink) {
    homeLink.click();
  } else {
    window.location.hash = 'home';
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  }
}

function setupForgotPassword() {
  const passwordInput = element('accountPassword');

  if (
    !element('accountForm') ||
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
      console.error('Password reset request failed:', error);

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
  const confirmPassword = element('accountConfirmPassword');
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
      accountMode === 'signup' ? 'Register' : 'Sign in';
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
   PERSONAL DETAILS
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
    element('profileEmail').value = user.email || '';
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

    if (firstName.length > 80 || lastName.length > 80) {
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
      const { data: userData, error: userError } =
        await supabaseClient.auth.getUser();

      if (userError) throw userError;

      const user = userData.user;

      if (!user) {
        throw new Error('Please sign in again.');
      }

      const { error: detailsError } =
        await supabaseClient.auth.updateUser({
          data: {
            first_name: firstName,
            last_name: lastName,
            phone_number: phone
          }
        });

      if (detailsError) throw detailsError;

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

      } else if (message) {
        message.textContent =
          'Your personal details have been saved successfully.';
      }

      await refreshAccount();

    } catch (error) {
      console.error('Could not update personal details:', error);

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
      console.error('Could not update password:', error);

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
   REFERRAL DASHBOARD
   ========================================================= */

function setReferralMessage(message) {
  setText('referralMessage', message);
}

function clearReferralDashboard(
  message = 'Sign in to access your personal referral link.'
) {
  const linkInput = element('referralLink');

  if (linkInput) {
    linkInput.value = '';
    linkInput.placeholder =
      'Sign in to generate your referral link';
  }

  if (element('copyReferralLinkButton')) {
    element('copyReferralLinkButton').disabled = true;
  }

  if (element('shareReferralLinkButton')) {
    element('shareReferralLinkButton').disabled = true;
  }

  setText('successfulReferralCount', '0');
  setText('referralRewardCount', '0');
  setText('availableReferralRewardCount', '0');

  setReferralMessage(message);

  const rewardsList = element('referralRewardsList');

  if (rewardsList) {
    rewardsList.replaceChildren(
      makeParagraph('Sign in to view your free entries and rewards.')
    );
  }

  setHidden('referralRewardSelect', false);

  if (element('referralRewardSelect')) {
    element('referralRewardSelect').replaceChildren(
      new Option('No available rewards', '')
    );
    element('referralRewardSelect').disabled = true;
  }

  if (element('referralCompetitionSelect')) {
    element('referralCompetitionSelect').replaceChildren(
      new Option('Sign in to continue', '')
    );
    element('referralCompetitionSelect').disabled = true;
  }

  if (element('claimReferralRewardButton')) {
    element('claimReferralRewardButton').disabled = true;
  }

  setText(
    'referralClaimMessage',
    'Sign in to claim a free entry.'
  );
}

function populateReferralCompetitionSelect(competitions) {
  const select = element('referralCompetitionSelect');

  if (!select) return;

  const previousValue = select.value;

  select.replaceChildren(
    new Option(
      competitions.length
        ? 'Choose a competition'
        : 'No open competitions',
      ''
    )
  );

  competitions.forEach((competition) => {
    select.add(
      new Option(
        competition.name,
        competition.id
      )
    );
  });

  if (
    previousValue &&
    competitions.some(
      item => String(item.id) === previousValue
    )
  ) {
    select.value = previousValue;
  }

  select.disabled = competitions.length === 0;
}

async function loadMyReferralDashboard(user) {
  const requestNumber = ++referralRequestNumber;

  if (!user) {
    clearReferralDashboard();
    return;
  }

  setReferralMessage('Loading your referral details…');

  try {
    const {
      data: referralCode,
      error: codeError
    } = await supabaseClient.rpc('get_my_referral_code');

    if (codeError) throw codeError;

    if (
      typeof referralCode !== 'string' ||
      !/^PP-[A-Z0-9]{12}$/.test(referralCode)
    ) {
      throw new Error(
        'The referral code returned by the server is invalid.'
      );
    }

    const referralUrl = new URL(SITE_URL);
    referralUrl.searchParams.set('ref', referralCode);

    const linkInput = element('referralLink');

    if (linkInput) {
      linkInput.value = referralUrl.toString();
      linkInput.placeholder = '';
    }

    if (element('copyReferralLinkButton')) {
      element('copyReferralLinkButton').disabled = false;
    }

    if (element('shareReferralLinkButton')) {
      element('shareReferralLinkButton').disabled = false;
    }

    const {
      data: referrals,
      error: referralsError
    } = await supabaseClient
      .from('referrals')
      .select('id, status')
      .eq('referrer_user_id', user.id);

    if (referralsError) throw referralsError;

    const {
      data: rewards,
      error: rewardsError
    } = await supabaseClient
      .from('referral_rewards')
      .select('id, status, expires_at, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (rewardsError) throw rewardsError;

    if (requestNumber !== referralRequestNumber) return;

    const successfulCount = (referrals || []).filter(
      referral => referral.status === 'qualified'
    ).length;

    const availableRewards = (rewards || []).filter((reward) => {
      return (
        reward.status === 'available' &&
        reward.expires_at &&
        new Date(reward.expires_at).getTime() > Date.now()
      );
    });

    setText(
      'successfulReferralCount',
      String(successfulCount)
    );

    setText(
      'referralRewardCount',
      String((rewards || []).length)
    );

    setText(
      'availableReferralRewardCount',
      String(availableRewards.length)
    );

    const rewardsList = element('referralRewardsList');

    if (rewardsList) {
      rewardsList.replaceChildren();

      if (!rewards?.length) {
        rewardsList.appendChild(
          makeParagraph('You have not earned a referral reward yet.')
        );
      } else {
        rewards.forEach((reward) => {
          const item = document.createElement('article');
          item.className = 'history-card';

          const status = document.createElement('p');
          status.textContent =
            `Reward status: ${reward.status || 'Unavailable'}`;

          const expiry = document.createElement('p');
          expiry.textContent =
            `Expires: ${formatDate(reward.expires_at)}`;

          item.append(status, expiry);
          rewardsList.appendChild(item);
        });
      }
    }

    const rewardSelect = element('referralRewardSelect');

    if (rewardSelect) {
      rewardSelect.replaceChildren(
        new Option(
          availableRewards.length
            ? 'Choose an available reward'
            : 'No available rewards',
          ''
        )
      );

      availableRewards.forEach((reward) => {
        rewardSelect.add(
          new Option(
            `Free entry — expires ${formatDate(reward.expires_at)}`,
            reward.id
          )
        );
      });

      rewardSelect.disabled = availableRewards.length === 0;
    }

    setReferralMessage(
      'Your personal referral link is ready to share.'
    );

    updateReferralClaimButton();

  } catch (error) {
    if (requestNumber !== referralRequestNumber) return;

    console.error('Could not load referral dashboard:', error);

    setReferralMessage(
      error.message ||
      'We could not load your referral details. Please try again.'
    );
  }
}

function updateReferralClaimButton() {
  const reward = element('referralRewardSelect')?.value;
  const competition =
    element('referralCompetitionSelect')?.value;

  const button = element('claimReferralRewardButton');

  if (button) {
    button.disabled = !(reward && competition);
  }
}

element('referralRewardSelect')
  ?.addEventListener('change', updateReferralClaimButton);

element('referralCompetitionSelect')
  ?.addEventListener('change', updateReferralClaimButton);

async function copyReferralLink() {
  const link = element('referralLink')?.value.trim();

  if (!link) {
    setReferralMessage(
      'Your referral link is not ready yet. Please try again.'
    );
    return;
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(link);
    } else {
      const input = element('referralLink');

      input.focus();
      input.select();

      if (!document.execCommand('copy')) {
        throw new Error('Copy was not successful.');
      }
    }

    setReferralMessage(
      'Your referral link has been copied. You can now share it with friends.'
    );

  } catch (error) {
    console.error('Could not copy referral link:', error);

    setReferralMessage(
      'We could not copy the link automatically. Please select and copy the link from the box.'
    );

    element('referralLink')?.focus();
    element('referralLink')?.select();
  }
}

async function shareReferralLink() {
  const link = element('referralLink')?.value.trim();

  if (!link) {
    setReferralMessage(
      'Your referral link is not ready yet. Please try again.'
    );
    return;
  }

  try {
    if (navigator.share) {
      await navigator.share({
        title: 'Join Pixel Pick',
        text: 'Join me on Pixel Pick and take part in skill competitions.',
        url: link
      });

      setReferralMessage(
        'Your referral link is ready to share.'
      );

    } else {
      await copyReferralLink();
    }

  } catch (error) {
    if (error.name === 'AbortError') return;

    console.error('Could not share referral link:', error);

    setReferralMessage(
      'Sharing is unavailable on this device. Please use the Copy referral link button instead.'
    );
  }
}

element('copyReferralLinkButton')
  ?.addEventListener('click', copyReferralLink);

element('shareReferralLinkButton')
  ?.addEventListener('click', shareReferralLink);

/*
 * Referral reward redemption is intentionally not connected here yet.
 * The existing backend requires a verified challenge ID as well as
 * a reward ID. We must connect the exact challenge-verification
 * sequence before enabling this button.
 */

element('claimReferralRewardButton')
  ?.addEventListener('click', () => {
    setText(
      'referralClaimMessage',
      'Free reward claims are not available yet. Your reward remains in your account; no payment has been taken.'
    );
  });

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
    signedIn ? 'Account settings' : 'Sign in / Register'
  );

  setText('accountHeaderButton', 'Sign in / Register');
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
      accountMode === 'signup' ? 'Register' : 'Sign in';
  }

  renderPersonalDetails(session?.user || null);
}

/* =========================================================
   REFRESH ACCOUNT AND HISTORY
   ========================================================= */

async function refreshAccount() {
  try {
    const { data, error } =
      await supabaseClient.auth.getSession();

    if (error) throw error;

    updateAccountInterface(data.session);

    if (data.session) {
      await Promise.all([
        loadMyHistory(),
        loadMyReferralDashboard(data.session.user)
      ]);

    } else {
      const history = element('entryHistory');

      if (history) {
        history.replaceChildren(
          makeParagraph('Sign in to view your history.')
        );
      }

      clearReferralDashboard();
    }

  } catch (error) {
    console.error('Could not refresh account:', error);

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

    const email = element('accountEmail')?.value.trim();
    const password = element('accountPassword')?.value;

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

        if (firstName.length > 80 || lastName.length > 80) {
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
          throw new Error('Please confirm your password.');
        }

        if (password !== confirmPassword) {
          throw new Error(
            'Your passwords do not match. Please check and try again.'
          );
        }

        const pendingReferralCode =
          sessionStorage.getItem(PENDING_REFERRAL_STORAGE_KEY);

        const signupMetadata = {
          first_name: firstName,
          last_name: lastName,
          phone_number: phone
        };

        if (
          pendingReferralCode &&
          /^PP-[A-Z0-9]{12}$/.test(pendingReferralCode)
        ) {
          signupMetadata.referral_code =
            pendingReferralCode;
        }

        const { data, error } =
          await supabaseClient.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: SITE_URL,
              data: signupMetadata
            }
          });

        if (error) throw error;

        sessionStorage.removeItem(
          PENDING_REFERRAL_STORAGE_KEY
        );

        if (data.session) {
          showAccountMessage(
            'Your account has been created successfully.'
          );

          await refreshAccount();
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

        showAccountMessage('Signed in successfully.');

        await refreshAccount();
        finishSuccessfulAuthentication();
      }

    } catch (error) {
      console.error(
        'Account registration or sign-in failed:',
        error
      );

      showAccountMessage(
        error.message || 'Could not complete the request.'
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
  sessionStorage.removeItem(CHECKOUT_STORAGE_KEY);

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
  clearReferralDashboard();

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
   ACCOUNT HISTORY
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

    if (!result.ok || !Array.isArray(result.items)) {
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

      if (item.monthly_entry_number != null) {
  const number = document.createElement('p');
  number.textContent =
    `Entry number: ${item.monthly_entry_number}`;

  card.appendChild(number);
}

      const entryId = item.entry_id || item.id;
      const isEntry = item.record_type === 'entry';

      const entryStatus =
        String(item.status || '').toLowerCase();

      const isEligibleEntry =
        isEntry &&
        entryId &&
        (
          entryStatus === 'paid' ||
          entryStatus === 'completed' ||
          entryStatus === 'success' ||
          item.entry_type === 'referral' ||
          item.payment_status === 'paid'
        );

      if (isEligibleEntry) {
        const playButton = document.createElement('button');

        playButton.type = 'button';
        playButton.className = 'cta';
        playButton.textContent = 'Play competition';

        playButton.addEventListener('click', () => {
          startCompetitionGame(
            String(entryId),
            item.competition_name || 'Competition',
            'entry'
          );
        });

        card.appendChild(playButton);
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
   CLEAR HISTORY
   ========================================================= */

function openClearHistoryModal() {
  const historyModal = element('clearHistoryModal');

  if (!historyModal) return;

  setText('clearHistoryMessage', '');
  historyModal.classList.remove('hidden');
}

function closeClearHistoryModal() {
  element('clearHistoryModal')?.classList.add('hidden');
  setText('clearHistoryMessage', '');
}

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
        result.error || 'Could not clear your history.'
      );
    }

    closeClearHistoryModal();
    await loadMyHistory();

    setText(
      'entryText',
      'Your account history has been cleared from your account view. Your original entry and payment records remain securely retained.'
    );

  } catch (error) {
    console.error('Could not clear account history:', error);

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

element('clearHistoryButton')
  ?.addEventListener('click', openClearHistoryModal);

element('cancelClearHistoryButton')
  ?.addEventListener('click', closeClearHistoryModal);

element('closeClearHistoryModal')
  ?.addEventListener('click', closeClearHistoryModal);

element('confirmClearHistoryButton')
  ?.addEventListener('click', confirmClearHistory);

element('clearHistoryModal')
  ?.addEventListener('click', (event) => {
    if (event.target === element('clearHistoryModal')) {
      closeClearHistoryModal();
    }
  });

document.addEventListener('keydown', (event) => {
  if (
    event.key === 'Escape' &&
    !element('clearHistoryModal')?.classList.contains('hidden')
  ) {
    closeClearHistoryModal();
  }
});

/* =========================================================
   TEN-TASK VISUAL GAME
   ========================================================= */

const GAME_OBJECT_ICONS = {
  sneaker: '👟',
  shoe: '👟',
  cap: '🧢',
  ball: '⚽',
  watch: '⌚',
  bag: '👜',
  sunglasses: '🕶️',
  hat: '🎩',
  backpack: '🎒'
};

const GAME_COLOUR_NAMES = {
  red: 'Red',
  blue: 'Blue',
  green: 'Green',
  yellow: 'Yellow'
};

function gameElement(id) {
  return document.getElementById(id);
}

function setGameStatus(message) {
  const node = gameElement('gameStatus');

  if (node) node.textContent = message;
}

function clearGameCountdown() {
  if (gameCountdownInterval) {
    clearInterval(gameCountdownInterval);
    gameCountdownInterval = null;
  }
}

function closeCompetitionGame() {
  gameElement('competitionGame')?.classList.add('hidden');

  clearGameCountdown();

  gameSubmitting = false;
  gamePaymentBusy = false;

  activeGameAttempt = null;
  activeGameTasks = [];
  activeGameCompletedTaskIds = [];
  activeGameEntryId = null;
  activeGameCompetitionId = null;
  activeGameNeedsPayment = false;

  const payButton = gameElement('gamePayButton');

  if (payButton) {
    payButton.disabled = false;
    payButton.textContent = 'Continue to PayFast';
  }

  loadMyHistory();
}

function normaliseOptions(options) {
  if (!Array.isArray(options)) return [];

  return options.map((option, index) => {
    if (
      typeof option === 'string' ||
      typeof option === 'number'
    ) {
      return {
        key: ['A', 'B', 'C', 'D'][index],
        label: String(option)
      };
    }

    const key = String(
      option.key ||
      option.answer_key ||
      option.id ||
      option.label ||
      ['A', 'B', 'C', 'D'][index]
    ).toUpperCase();

    const label = String(
      option.text ??
      option.value ??
      option.answer ??
      option.label ??
      option.key ??
      ''
    );

    return { key, label };
  }).filter(option => option.key && option.label);
}

function renderGameGrid(grid) {
  const host = gameElement('gameObjectGrid');

  if (!host) {
    setGameStatus(
      'The game board is unavailable. Please contact support.'
    );
    return false;
  }

  host.replaceChildren();

  if (!Array.isArray(grid) || !grid.length) {
    host.appendChild(
      makeParagraph(
        'This task has no visual board data. Please contact support before continuing.'
      )
    );

    return false;
  }

  grid.forEach((item) => {
    const tile = document.createElement('div');
    tile.className = 'game-object-tile';

    const colour = String(
      item.colour || item.color || 'grey'
    ).toLowerCase();

    const object = String(
      item.object || 'item'
    ).toLowerCase();

    const icon = document.createElement('span');
    icon.className = 'game-object-icon';
    icon.textContent =
      GAME_OBJECT_ICONS[object] || '◆';

    const caption = document.createElement('span');
    caption.className = 'game-object-caption';

    caption.textContent =
      `${GAME_COLOUR_NAMES[colour] || colour} ${object}`;

    tile.dataset.colour = colour;

    tile.append(icon, caption);
    host.appendChild(tile);
  });

  return true;
}

function currentUnansweredTask() {
  return activeGameTasks.find(task =>
    !activeGameCompletedTaskIds.includes(task.id)
  );
}

function showGamePaymentPanel() {
  setHidden('gameTaskCard', true);
  setHidden('gameCompletePanel', false);
  setHidden('gamePaymentPanel', !activeGameNeedsPayment);

  setText('gameProgressText', '10 of 10 complete');
  setText('gameTimerText', 'Challenge completed');

  const progressBar = gameElement('gameProgressBar');

  if (progressBar) {
    progressBar.style.width = '100%';
  }

  const progressTrack = document.querySelector(
    '.game-progress-track'
  );

  if (progressTrack) {
    progressTrack.setAttribute('aria-valuenow', '10');
  }

  setText(
    'gameFinalSummary',
    'All ten answers have been saved. Your score and answers will remain hidden while the competition is in progress.'
  );

  if (activeGameNeedsPayment) {
    setGameStatus(
      'Your challenge is complete. Complete payment within the time shown to confirm this entry.'
    );

    startPaymentCountdown();

  } else {
    setHidden('gamePaymentPanel', true);

    setGameStatus(
      'This entry is already paid. Your saved result is ready for competition review.'
    );
  }
}

/* =========================================================
   GAMEPLAY COUNTDOWN — 30 MINUTES
   ========================================================= */

function startGameplayCountdown() {
  clearGameCountdown();

  const timerNode = gameElement('gameTimerText');

  const deadline = new Date(
    activeGameAttempt?.gameplay_expires_at || ''
  ).getTime();

  if (!Number.isFinite(deadline)) {
    if (timerNode) {
      timerNode.textContent = 'Challenge timer unavailable';
    }

    return;
  }

  function updateTimer() {
    const remaining = deadline - Date.now();

    if (remaining <= 0) {
      if (timerNode) {
        timerNode.textContent = '00:00 remaining';
      }

      clearGameCountdown();

      setGameStatus(
        'Your 30-minute challenge period has expired. This attempt can no longer be continued.'
      );

      const optionsHost = gameElement('gameAnswerOptions');

      optionsHost
        ?.querySelectorAll('button')
        .forEach(button => {
          button.disabled = true;
        });

      return;
    }

    const totalSeconds = Math.floor(remaining / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    if (timerNode) {
      timerNode.textContent =
        `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')} remaining`;
    }
  }

  updateTimer();

  gameCountdownInterval = setInterval(
    updateTimer,
    1000
  );
}

/* =========================================================
   RENDER CURRENT GAME TASK
   ========================================================= */

function renderCurrentGameTask() {
  const task = currentUnansweredTask();

  const completedCount =
    activeGameCompletedTaskIds.length;

  const progress = Math.min(
    100,
    completedCount * 10
  );

  setText(
    'gameProgressText',
    `Task ${Math.min(completedCount + 1, 10)} of 10`
  );

  const progressBar = gameElement('gameProgressBar');

  if (progressBar) {
    progressBar.style.width = `${progress}%`;
  }

  const progressTrack = document.querySelector(
    '.game-progress-track'
  );

  if (progressTrack) {
    progressTrack.setAttribute(
      'aria-valuenow',
      String(completedCount)
    );
  }

  if (!task) {
    showGamePaymentPanel();
    return;
  }

  setHidden('gameTaskCard', false);
  setHidden('gameCompletePanel', true);
  setHidden('gamePaymentPanel', true);

  const data = task.puzzle_data || {};

  setText(
    'gameTaskNumber',
    `TASK ${task.task_number || completedCount + 1}`
  );

  setText(
    'gameInstruction',
    task.instruction ||
    data.question ||
    'Study the objects and choose the correct answer.'
  );

  // Never display answer correctness, score or accuracy.
  setText('gameAnswerFeedback', '');

  if (!renderGameGrid(data.grid)) {
    setGameStatus(
      'This task could not be displayed safely. Please contact support.'
    );
    return;
  }

  const optionsHost = gameElement('gameAnswerOptions');

  if (!optionsHost) {
    setGameStatus('The answer choices are unavailable.');
    return;
  }

  optionsHost.replaceChildren();

  const options = normaliseOptions(data.options);

  if (options.length !== 4) {
    setGameStatus(
      'This task does not contain four valid answer choices. Please contact support.'
    );
    return;
  }

  options.forEach((option) => {
    const button = document.createElement('button');

    button.type = 'button';
    button.className = 'game-answer-button';
    button.textContent =
      `${option.key}. ${option.label}`;

    button.addEventListener('click', () => {
      submitGameAnswer(task, option.key, button);
    });

    optionsHost.appendChild(button);
  });

  setGameStatus(
    'Choose carefully. You can answer this task only once.'
  );

  startGameplayCountdown();
}

/* =========================================================
   START OR RESUME A GAME
   ========================================================= */

async function startCompetitionGame(
  id,
  competitionName = 'Competition',
  mode = 'entry'
) {
  const { data, error } =
    await supabaseClient.auth.getSession();

  if (error || !data.session) {
    openAccount();

    showAccountMessage(
      'Please sign in to play your competition entry.'
    );

    return;
  }

  clearGameCountdown();

  activeGameEntryId = null;
  activeGameCompetitionId = null;
  activeGameAttempt = null;
  activeGameTasks = [];
  activeGameCompletedTaskIds = [];

  activeGameNeedsPayment = mode === 'competition';

  gameSubmitting = false;
  gamePaymentBusy = false;

  gameElement('competitionGame')?.classList.remove('hidden');

  setText(
    'gameCompetitionTitle',
    competitionName
  );

  setHidden('gameTaskCard', true);
  setHidden('gameCompletePanel', true);
  setHidden('gamePaymentPanel', true);

  setText('gameTimerText', '30:00 remaining');

  const payButton = gameElement('gamePayButton');

  if (payButton) {
    payButton.disabled = false;
    payButton.textContent = 'Continue to PayFast';
  }

  setGameStatus(
    'Loading your saved competition attempt…'
  );

  try {
    const requestBody =
      mode === 'competition'
        ? { competition_id: id }
        : { entry_id: id };

    const result = await callEdgeFunction(
      START_COMPETITION_ATTEMPT_URL,
      requestBody
    );

    if (
      result.ok === false ||
      !result.attempt ||
      !result.entry ||
      !Array.isArray(result.tasks) ||
      result.tasks.length !== 10
    ) {
      throw new Error(
        result.error ||
        'The competition did not return all ten tasks.'
      );
    }

    activeGameEntryId = String(result.entry.id);

    activeGameCompetitionId =
      mode === 'competition' ? String(id) : null;

    activeGameAttempt = result.attempt;
    activeGameTasks = result.tasks;

    activeGameCompletedTaskIds =
      Array.isArray(result.completed_task_ids)
        ? result.completed_task_ids
        : [];

    if (
      activeGameAttempt.status === 'submitted' ||
      activeGameCompletedTaskIds.length === 10
    ) {
      activeGameNeedsPayment =
        mode === 'competition';

      showGamePaymentPanel();
      return;
    }

    if (activeGameAttempt.status !== 'in_progress') {
      throw new Error(
        'This attempt is no longer available. Please refresh your history.'
      );
    }

    setHidden('gamePaymentPanel', true);

    renderCurrentGameTask();

  } catch (error) {
    console.error(
      'Could not start competition attempt:',
      error
    );

    setGameStatus(
      error.message ||
      'Could not start this competition. Please try again.'
    );
  }
}

/* =========================================================
   SUBMIT ONE ANSWER
   ========================================================= */

async function submitGameAnswer(
  task,
  answerKey,
  clickedButton
) {
  if (
    gameSubmitting ||
    !activeGameAttempt ||
    activeGameCompletedTaskIds.includes(task.id)
  ) {
    return;
  }

  gameSubmitting = true;

  const optionsHost = gameElement('gameAnswerOptions');

  const buttons = optionsHost
    ? [...optionsHost.querySelectorAll('button')]
    : [];

  buttons.forEach(button => {
    button.disabled = true;
  });

  if (clickedButton) {
    clickedButton.textContent += ' — submitting…';
  }

  setGameStatus('Saving your answer…');

  try {
    const result = await callEdgeFunction(
      SUBMIT_COMPETITION_ANSWER_URL,
      {
        attempt_id: activeGameAttempt.id,
        task_id: task.id,
        selected_answer_key: answerKey
      }
    );

    if (result.ok === false || result.error) {
      throw new Error(
        result.error || 'Your answer was not saved.'
      );
    }

    if (!activeGameCompletedTaskIds.includes(task.id)) {
      activeGameCompletedTaskIds.push(task.id);
    }

    // The server response contains no score or correctness data.
    // The customer is never shown whether this answer was correct.

    if (
      result.completed ||
      activeGameCompletedTaskIds.length === 10
    ) {
      setGameStatus(
        'All ten answers have been submitted. Loading your payment details…'
      );

      clearGameCountdown();

      if (activeGameCompetitionId) {
        const refreshed = await callEdgeFunction(
          START_COMPETITION_ATTEMPT_URL,
          {
            competition_id: activeGameCompetitionId
          }
        );

        if (
          !refreshed.attempt ||
          refreshed.attempt.status !== 'submitted' ||
          !refreshed.entry
        ) {
          throw new Error(
            'Your answers were saved, but the payment details could not be loaded. Please reopen this competition from the competitions page.'
          );
        }

        activeGameAttempt = refreshed.attempt;

        activeGameEntryId =
          String(refreshed.entry.id);

        activeGameCompletedTaskIds =
          Array.isArray(refreshed.completed_task_ids)
            ? refreshed.completed_task_ids
            : activeGameCompletedTaskIds;

        activeGameNeedsPayment = true;

      } else {
        activeGameNeedsPayment = false;
        activeGameAttempt.status = 'submitted';
      }

      showGamePaymentPanel();

    } else {
      renderCurrentGameTask();
    }

  } catch (error) {
    console.error(
      'Could not submit competition answer:',
      error
    );

    setGameStatus(
      error.message ||
      'Your answer could not be saved. Please try again.'
    );

    buttons.forEach(button => {
      button.disabled = false;
    });

  } finally {
    gameSubmitting = false;
  }
}

/* =========================================================
   PAYMENT COUNTDOWN — 30 MINUTES AFTER COMPLETION
   ========================================================= */

function startPaymentCountdown() {
  clearGameCountdown();

  const timerNode =
    gameElement('gamePaymentTimerText');

  const payButton =
    gameElement('gamePayButton');

  if (!activeGameAttempt?.payment_expires_at) {
    if (timerNode) {
      timerNode.textContent =
        'Payment deadline could not be loaded. Please reopen the competition.';
    }

    if (payButton) payButton.disabled = true;

    return;
  }

  const deadline = new Date(
    activeGameAttempt.payment_expires_at
  ).getTime();

  if (!Number.isFinite(deadline)) {
    if (timerNode) {
      timerNode.textContent =
        'Payment deadline unavailable.';
    }

    if (payButton) payButton.disabled = true;

    return;
  }

  function updateCountdown() {
    const remaining = deadline - Date.now();

    if (remaining <= 0) {
      if (timerNode) {
        timerNode.textContent =
          'Your payment window has expired.';
      }

      if (payButton) {
        payButton.disabled = true;
      }

      clearGameCountdown();

      setGameStatus(
        'The payment period has expired. This attempt cannot be used as a competition entry.'
      );

      return;
    }

    const totalSeconds =
      Math.floor(remaining / 1000);

    const minutes =
      Math.floor(totalSeconds / 60);

    const seconds =
      totalSeconds % 60;

    if (timerNode) {
      timerNode.textContent =
        `Time remaining to pay: ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    if (payButton) {
      payButton.disabled = gamePaymentBusy;
    }
  }

  updateCountdown();

  gameCountdownInterval = setInterval(
    updateCountdown,
    1000
  );
}

/* =========================================================
   PAYFAST SANDBOX CHECKOUT
   ========================================================= */

async function beginGamePayment() {
  if (gamePaymentBusy) return;

  if (!activeGameEntryId || !activeGameAttempt?.id) {
    setGameStatus(
      'Your saved entry details are missing. Please reopen the competition.'
    );
    return;
  }

  if (!activeGameNeedsPayment) {
    setGameStatus(
      'This entry does not require another payment.'
    );
    return;
  }

  const deadline = new Date(
    activeGameAttempt.payment_expires_at || ''
  ).getTime();

  if (
    !Number.isFinite(deadline) ||
    deadline <= Date.now()
  ) {
    setGameStatus(
      'Your payment window has expired. This attempt cannot be paid.'
    );

    return;
  }

  gamePaymentBusy = true;

  const payButton = gameElement('gamePayButton');

  if (payButton) {
    payButton.disabled = true;
    payButton.textContent =
      'Preparing secure checkout…';
  }

  setGameStatus(
    'Preparing your PayFast Sandbox checkout…'
  );

  setText(
    'gamePaymentMessage',
    'Connecting to PayFast Sandbox…'
  );

  try {
    const orderResult = await callEdgeFunction(
      CREATE_PAYMENT_ORDER_URL,
      {
        entry_id: activeGameEntryId,
        attempt_id: activeGameAttempt.id
      }
    );

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

    // Prevent the 15-minute inactivity logout from interrupting checkout.
    sessionStorage.setItem(
      CHECKOUT_STORAGE_KEY,
      'true'
    );

    setText(
      'gamePaymentMessage',
      'Redirecting to PayFast Sandbox…'
    );

    form.submit();

  } catch (error) {
    console.error(
      'Could not create PayFast checkout:',
      error
    );

    setGameStatus(
      `${error.message || 'Could not prepare checkout.'} Your payment has not been confirmed.`
    );

    setText(
      'gamePaymentMessage',
      error.message ||
      'Could not prepare checkout. Please try again.'
    );

    gamePaymentBusy = false;

    if (payButton) {
      payButton.disabled = false;
      payButton.textContent = 'Continue to PayFast';
    }
  }
}

gameElement('gamePayButton')
  ?.addEventListener('click', beginGamePayment);

gameElement('gameCloseButton')
  ?.addEventListener('click', closeCompetitionGame);

/* =========================================================
   LEGACY X/Y SKILL CHALLENGE
   Kept for the existing referral reward process.
   It is not used for paid competition entries.
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

  setChallengeMessage('Preparing your challenge…');

  if (element('x')) element('x').value = '';
  if (element('y')) element('y').value = '';

  modal?.classList.remove('hidden');

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
      'This older X/Y challenge is not used for paid competition entries. Please use the ten-task visual game for paid competitions.'
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
  modal?.classList.add('hidden');

  activeChallengeId = null;
  challengeBusy = false;
}

/*
 * The old X/Y payment flow is disabled.
 * Paid competitions must use the ten-task game first.
 */
async function submitEntry() {
  setChallengeMessage(
    'The old X/Y checkout is no longer used for paid competitions. Please close this window and start the visual competition game.'
  );
}

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

    if (element('x')) {
      element('x').value = x;
    }

    if (element('y')) {
      element('y').value = y;
    }
  }
);

/* =========================================================
   PAYMENT RETURN MESSAGE
   ========================================================= */

(function handlePaymentReturn() {
  const params =
    new URLSearchParams(window.location.search);

  const payment = params.get('payment');

  if (!payment) return;

  // PayFast has returned the customer to the website.
  // Only the verified PayFast ITN confirms a payment.
  sessionStorage.removeItem(CHECKOUT_STORAGE_KEY);

  gamePaymentBusy = false;

  if (payment === 'returned') {
    setText(
      'competitionMessage',
      'You returned from PayFast. Your payment is not confirmed until Pixel Pick verifies it.'
    );

  } else if (payment === 'cancelled') {
    setText(
      'competitionMessage',
      'Checkout was cancelled. Your entry is not confirmed. If your payment window is still open, you may continue checkout.'
    );
  }

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

      const { data, error: authError } =
        await supabaseClient.auth.getUser();

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

      loadMyHistory();
      loadMyReferralDashboard(session.user);

    } else {
      stopIdleLogout();

      const history = element('entryHistory');

      if (history) {
        history.replaceChildren(
          makeParagraph('Sign in to view your history.')
        );
      }

      clearReferralDashboard();
    }
  }
);

loadCompetitions();
refreshAccount();

/* =========================================================
   ACCOUNT BUTTONS
   ========================================================= */

element('accountHeaderButton')
  ?.addEventListener('click', () => {
    closeNavigationMenu();
    openAccount();
  });

element('accountSectionButton')
  ?.addEventListener('click', () => {
    closeNavigationMenu();
    openAccount();
  });

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

/* =========================================================
   END OF PIXEL PICK CUSTOMER SCRIPT
   ========================================================= */
