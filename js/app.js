    const API_BASE = (() => {
      const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const defaultApi = isLocal ? 'http://localhost:4000' : 'https://famitube-api.gamantha.my.id';
      const param = new URLSearchParams(window.location.search).get('api');
      if (param) {
        const cleaned = param.replace(/\/+$/, '');
        localStorage.setItem('kidstube_api_url', cleaned);
        return cleaned;
      }
      const saved = localStorage.getItem('kidstube_api_url');
      if (saved && (isLocal || (!saved.includes('localhost') && !saved.includes('kidstube-api.gamantha.my.id')))) {
        return saved.replace(/\/+$/, '');
      }
      return defaultApi;
    })();
    const apiUrl = (path) => `${API_BASE}${path}`;
    document.getElementById('linkChannelsJson').href = apiUrl('/api/channels');

    // Development stage flag: keep App Preview menu always enabled across all modes
    const IS_DEV_STAGE = true;

    const AUTH_TOKEN_KEY = 'FamiTube_auth_token';
    const AUTH_USER_KEY = 'FamiTube_auth_user';
    let authToken = localStorage.getItem(AUTH_TOKEN_KEY) || '';
    let pendingVerifyEmail = '';

    function showAuthAlert(message, isError = true) {
      const el = document.getElementById('authAlert');
      el.textContent = message;
      el.style.display = 'block';
      el.style.background = isError ? 'rgba(255, 51, 102, 0.15)' : 'rgba(6, 214, 160, 0.15)';
      el.style.color = isError ? '#FF6B8B' : '#06D6A0';
      el.style.border = `1px solid ${isError ? 'rgba(255, 51, 102, 0.35)' : 'rgba(6, 214, 160, 0.35)'}`;
    }

    function togglePasswordVisibility(inputId, btn) {
      const input = document.getElementById(inputId);
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      const icon = btn?.querySelector('.material-symbols-rounded');
      if (icon) icon.textContent = show ? 'visibility_off' : 'visibility';
      if (btn) btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    }

    function switchAuthTab(tab) {
      document.getElementById('authAlert').style.display = 'none';
      document.getElementById('resendVerifyBtn').style.display = 'none';
      const isLogin = tab === 'login';
      document.getElementById('loginForm').style.display = isLogin ? 'flex' : 'none';
      document.getElementById('registerForm').style.display = isLogin ? 'none' : 'flex';
      document.getElementById('tabAuthLogin').className = isLogin ? 'btn btn-primary' : 'btn btn-secondary';
      document.getElementById('tabAuthRegister').className = isLogin ? 'btn btn-secondary' : 'btn btn-primary';
    }

    function setModeButtons(mode) {
      const homeBtn = document.getElementById('btnNavHome');
      const channelsBtn = document.getElementById('btnNavChannels');
      const parentBtn = document.getElementById('btnModeParent');
      const studioBtn = document.getElementById('btnModeStudio');
      if (homeBtn) homeBtn.className = mode === 'showcase' ? 'nav-link active' : 'nav-link';
      if (channelsBtn) channelsBtn.className = (mode === 'channels' || mode === 'channel_detail') ? 'nav-link active' : 'nav-link';
      if (parentBtn) parentBtn.className = mode === 'parent' ? 'nav-link active' : 'nav-link';
      if (studioBtn) studioBtn.className = mode === 'studio' ? 'nav-link active' : 'nav-link';
    }

    function openHome(useKidsFeed = false) {
      if (currentUser?.role === 'PARENT' && !parentPreviewChild) {
        openParentMode();
        return;
      }
      setModeButtons('showcase');
      if (window.location.hash === '#channels' || window.location.hash.startsWith('#channel/')) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
      document.getElementById('linkChannelsJson').style.display = 'none';
      document.getElementById('showcaseApp').style.display = 'block';
      document.getElementById('channelsSearchApp').style.display = 'none';
      const chanPage = document.getElementById('channelDetailPage');
      if (chanPage) chanPage.style.display = 'none';
      document.getElementById('authGate').style.display = 'none';
      document.getElementById('parentModeApp').style.display = 'none';
      document.getElementById('studioApp').style.display = 'none';
      if (!authToken || !currentUser) {
        if (showcaseAutoRotateTimer) clearInterval(showcaseAutoRotateTimer);
        const guestEntryEl = document.getElementById('guestEntryView');
        if (guestEntryEl) guestEntryEl.style.display = 'flex';
        const heroEl = document.getElementById('showcaseHeroCard');
        if (heroEl) heroEl.style.display = 'none';
        const curatedEl = document.getElementById('showcaseCuratedPanel');
        if (curatedEl) curatedEl.style.display = 'none';
        return;
      }
      const guestEntryEl = document.getElementById('guestEntryView');
      if (guestEntryEl) guestEntryEl.style.display = 'none';
      if (currentUser?.role === 'CHILD' && !kidViewingSelectedChannel) {
        activeKidTab = 'curated';
        switchKidShowcaseTab('curated');
      }
      loadShowcase(useKidsFeed || (currentUser && currentUser.role === 'CHILD'));
    }

    function openChannelsNav() {
      if (currentUser?.role === 'PARENT') {
        openParentMode();
        return;
      }
      setModeButtons('channels');
      ['kidTabBtnCurated', 'kidTabBtnSearch', 'kidTabBtnAchievements', 'kidTabBtnFavorites']
        .forEach(id => document.getElementById(id)?.classList.remove('active'));
      document.getElementById('kidTabBtnChannels')?.classList.add('active');
      if (window.location.hash !== '#channels') {
        history.replaceState(null, '', '#channels');
      }
      document.getElementById('linkChannelsJson').style.display = 'none';
      document.getElementById('showcaseApp').style.display = 'none';
      document.getElementById('channelsSearchApp').style.display = 'block';
      const chanPage = document.getElementById('channelDetailPage');
      if (chanPage) chanPage.style.display = 'none';
      document.getElementById('authGate').style.display = 'none';
      document.getElementById('parentModeApp').style.display = 'none';
      document.getElementById('studioApp').style.display = 'none';
      loadChannelSearchPage(currentUser && currentUser.role === 'CHILD');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    let activeLoginRole = 'PARENT';
    let currentUser = null;

    function formatChildEmailSubtitle(email) {
      if (!email || String(email).toLowerCase().endsWith('@profiles.famitube.local')) {
        return 'Passwordless Child Profile';
      }
      return email;
    }

    function toggleLegacyKidEmailLogin(showEmailForm) {
      const pairForm = document.getElementById('pairDeviceForm');
      const loginForm = document.getElementById('loginForm');
      if (pairForm) pairForm.style.display = showEmailForm ? 'none' : 'flex';
      if (loginForm) loginForm.style.display = showEmailForm ? 'flex' : 'none';
    }

    function setLoginRole(role) {
      activeLoginRole = role === 'CHILD' ? 'CHILD' : 'PARENT';
      const isChild = activeLoginRole === 'CHILD';
      const roleBtnParent = document.getElementById('roleBtnParent');
      const roleBtnChild = document.getElementById('roleBtnChild');
      if (roleBtnParent) roleBtnParent.className = isChild ? 'btn btn-secondary' : 'btn btn-primary';
      if (roleBtnChild) roleBtnChild.className = isChild ? 'btn btn-primary' : 'btn btn-secondary';
      const authModeTabs = document.getElementById('authModeTabs');
      if (authModeTabs) authModeTabs.style.display = isChild ? 'none' : 'flex';
      const kidNotice = document.getElementById('kidLoginNotice');
      if (kidNotice) kidNotice.style.display = isChild ? 'block' : 'none';
      const pairForm = document.getElementById('pairDeviceForm');
      const loginForm = document.getElementById('loginForm');
      const registerForm = document.getElementById('registerForm');
      if (isChild) {
        if (pairForm) pairForm.style.display = 'flex';
        if (loginForm) loginForm.style.display = 'none';
        if (registerForm) registerForm.style.display = 'none';
      } else {
        if (pairForm) pairForm.style.display = 'none';
        switchAuthTab('login');
      }
      const loginEmail = document.getElementById('loginEmail');
      if (loginEmail) loginEmail.placeholder = isChild ? 'kid@example.com' : 'curator@example.com';
      const authSubtitle = document.getElementById('authSubtitle');
      if (authSubtitle) {
        authSubtitle.textContent = isChild
          ? 'Enter a 6-digit pairing code from Parent Mode to link this device.'
          : 'Sign in to manage child profiles, channels, and family controls.';
      }
      const googleBtnLabel = document.getElementById('googleAuthBtnLabel');
      if (googleBtnLabel) {
        googleBtnLabel.textContent = isChild
          ? 'Sign in with Google (Kid)'
          : 'Continue with Google';
      }
    }

    async function openStudio() {
      if (currentUser?.role === 'CHILD') {
        openHome(true);
        return;
      }
      setModeButtons('studio');
      document.getElementById('showcaseApp').style.display = 'none';
      document.getElementById('channelsSearchApp').style.display = 'none';
      const chanPageStudio = document.getElementById('channelDetailPage');
      if (chanPageStudio) chanPageStudio.style.display = 'none';
      if (!authToken) {
        showAuthGate();
        return;
      }
      try {
        const res = await fetch(apiUrl('/api/auth/me'), {
          headers: { Authorization: `Bearer ${authToken}` }
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          handleLogout();
          return;
        }
        if (json.user?.role === 'CHILD') {
          handleAuthenticatedUser(json.user);
          return;
        }
        currentUser = json.user;
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(json.user));
        showStudioApp(json.user);
        loadStats();
        loadVideos();
        loadChannels();
        if (pendingInviteToken) checkInviteQueryParam();
      } catch {
        showAuthGate();
        showAuthAlert('Unable to reach API server at ' + API_BASE, true);
      }
    }

    function toggleGuestProfileMenu(e) {
      if (e) e.preventDefault();
      const menu = document.getElementById('guestProfileDropdown');
      if (!menu) return;
      menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
    }

    function toggleProfileMenu(e) {
      if (e) e.preventDefault();
      const notifMenu = document.getElementById('notifDropdownMenu');
      if (notifMenu) notifMenu.style.display = 'none';
      const menu = document.getElementById('profileDropdownMenu');
      if (!menu) return;
      menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
    }

    function toggleNotifMenu(e) {
      if (e) e.preventDefault();
      const profileMenu = document.getElementById('profileDropdownMenu');
      if (profileMenu) profileMenu.style.display = 'none';
      const menu = document.getElementById('notifDropdownMenu');
      if (!menu) return;
      const isOpening = menu.style.display !== 'block';
      menu.style.display = isOpening ? 'block' : 'none';
      if (isOpening) {
        const badge = document.getElementById('notifBadge');
        if (badge) badge.style.display = 'none';
      }
    }

    document.addEventListener('click', (e) => {
      const userBar = document.getElementById('userBar');
      const profileMenu = document.getElementById('profileDropdownMenu');
      const notifMenu = document.getElementById('notifDropdownMenu');
      if (userBar && !userBar.contains(e.target)) {
        if (profileMenu) profileMenu.style.display = 'none';
        if (notifMenu) notifMenu.style.display = 'none';
      }
      const guestMenuWrap = document.getElementById('guestProfileMenu');
      const guestDropdown = document.getElementById('guestProfileDropdown');
      if (guestMenuWrap && !guestMenuWrap.contains(e.target)) {
        if (guestDropdown) guestDropdown.style.display = 'none';
      }
    });

    function getUserInitials(nameOrEmail) {
      const parts = String(nameOrEmail || 'U').trim().split(/\s+/);
      if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
      return String(nameOrEmail || 'U').slice(0, 2).toUpperCase();
    }

    async function renderNotifications(user) {
      const listEl = document.getElementById('notifList');
      const badgeEl = document.getElementById('notifBadge');
      if (!listEl) return;
      const items = [];
      if (user?.role === 'CHILD') {
        items.push({
          icon: 'verified_user',
          color: 'var(--success)',
          title: `Welcome, ${user.name || user.email}!`,
          sub: 'Your parent-approved FamiTube feed is active.'
        });
        if (user.youtubeSearchEnabled) {
          items.push({
            icon: 'youtube_searched_for',
            color: 'var(--accent)',
            title: 'YouTube Search Enabled',
            sub: `Limit: ${user.searchViewLimit > 0 ? `${user.searchViewsUsed || 0}/${user.searchViewLimit} videos` : 'Unlimited'}.`
          });
        }
      } else {
        let pendingReqs = [];
        if (authToken) {
          try {
            const res = await authFetch('/api/parent/video-requests');
            const json = await res.json();
            if (json.success && Array.isArray(json.data)) {
              pendingReqs = json.data.filter(r => r.status === 'PENDING');
            }
          } catch {}
        }
        if (pendingReqs.length) {
          pendingReqs.forEach(r => {
            items.push({
              isVideoReq: true,
              req: r
            });
          });
        } else {
          items.push({
            icon: 'admin_panel_settings',
            color: 'var(--accent)',
            title: `Signed in as ${user?.name || user?.email}`,
            sub: 'No pending kid video approval requests.'
          });
        }
      }
      listEl.innerHTML = items.map(n => {
        if (n.isVideoReq) {
          const r = n.req;
          return `
            <div style="display:flex; flex-direction:column; gap:0.45rem; padding:0.75rem 1rem; border-bottom:1px solid var(--border);">
              <div style="display:flex; gap:0.55rem; align-items:flex-start;">
                <img src="${r.thumbnailUrl}" style="width:52px; height:36px; object-fit:cover; border-radius:4px; flex-shrink:0;">
                <div style="min-width:0;">
                  <div style="font-size:0.8rem; font-weight:700; line-height:1.25;">${r.kidName || 'Child'} wants to watch:</div>
                  <div style="font-size:0.78rem; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${r.title}</div>
                </div>
              </div>
              <div style="display:flex; gap:0.4rem;">
                <button type="button" class="btn btn-primary btn-sm" style="padding:0.25rem 0.6rem; font-size:0.75rem;" onclick="decideParentVideoRequest('${r.id}', 'APPROVED')">Approve</button>
                <button type="button" class="btn btn-secondary btn-sm" style="padding:0.25rem 0.6rem; font-size:0.75rem;" onclick="decideParentVideoRequest('${r.id}', 'REJECTED')">Decline</button>
              </div>
            </div>
          `;
        }
        return `
          <div style="display:flex; gap:0.65rem; padding:0.75rem 1rem; border-bottom:1px solid var(--border); align-items:flex-start;">
            <span class="material-symbols-rounded" style="color:${n.color}; font-size:1.15rem; margin-top:2px;">${n.icon}</span>
            <div>
              <div style="font-size:0.84rem; font-weight:600;">${n.title}</div>
              <div style="font-size:0.76rem; color:var(--text-muted); margin-top:0.15rem;">${n.sub}</div>
            </div>
          </div>
        `;
      }).join('');
      if (badgeEl) {
        badgeEl.textContent = String(items.length);
        badgeEl.style.display = 'inline-flex';
      }
    }

    function applyUserHeaderUI(user) {
      document.getElementById('guestProfileMenu').style.display = 'none';
      document.getElementById('guestProfileDropdown').style.display = 'none';
      document.getElementById('userBar').style.display = 'flex';
      document.getElementById('profileDropdownMenu').style.display = 'none';
      document.getElementById('notifDropdownMenu').style.display = 'none';
      const displayName = user?.name || user?.email || 'User';
      document.getElementById('profileAvatar').textContent = getUserInitials(displayName);
      document.getElementById('userEmailLabel').textContent = displayName;
      document.getElementById('profileMenuName').textContent = displayName;
      const banner = document.getElementById('loggedInWelcomeBanner');
      const bannerText = document.getElementById('loggedInBannerText');
      const bannerBadge = document.getElementById('loggedInBannerBadge');
      if (banner && bannerText && bannerBadge) {
        const userKey = String(user?.id || user?.email || '');
        const alreadySeen = userKey && localStorage.getItem('famitube_welcome_seen') === userKey;
        if (alreadySeen) {
          banner.style.display = 'none';
        } else {
          if (userKey) localStorage.setItem('famitube_welcome_seen', userKey);
          banner.style.display = 'flex';
          bannerText.textContent = `Signed in as ${displayName}`;
          bannerBadge.textContent = user?.role === 'CHILD'
            ? `Kid Mode • Age Filter: ${user.ageRating || 'ALL'}`
            : 'Parent Account';
          setTimeout(() => {
            if (banner) banner.style.display = 'none';
          }, 5000);
        }
      }
      if (user?.role === 'CHILD') {
        document.getElementById('btnNavHome').style.display = 'none';
        document.getElementById('btnNavChannels').style.display = 'none';
        const btnWho = document.getElementById('btnWhoIsWatching');
        if (btnWho) btnWho.style.display = 'none';
        document.getElementById('btnModeParent').style.display = 'none';
        document.getElementById('btnModeStudio').style.display = 'none';
        const appPreviewEl = document.getElementById('navAppPreview');
        const familyPassEl = document.getElementById('navFamilyPass');
        const faqEl = document.getElementById('navFaq');
        if (appPreviewEl) appPreviewEl.style.display = IS_DEV_STAGE ? 'inline-flex' : 'none';
        if (familyPassEl) familyPassEl.style.display = 'none';
        if (faqEl) faqEl.style.display = 'none';
        document.getElementById('profileMenuMeta').textContent = `${formatChildEmailSubtitle(user.email)} • Kid Mode`;
      } else {
        document.getElementById('btnNavHome').style.display = 'none';
        document.getElementById('btnNavChannels').style.display = 'none';
        const btnWho = document.getElementById('btnWhoIsWatching');
        if (btnWho) btnWho.style.display = 'inline-flex';
        document.getElementById('btnModeParent').style.display = 'inline-flex';
        document.getElementById('btnModeStudio').style.display = 'inline-flex';
        const appPreviewEl = document.getElementById('navAppPreview');
        const familyPassEl = document.getElementById('navFamilyPass');
        const faqEl = document.getElementById('navFaq');
        if (appPreviewEl) appPreviewEl.style.display = 'inline-flex';
        if (familyPassEl) familyPassEl.style.display = 'inline-flex';
        if (faqEl) faqEl.style.display = 'inline-flex';
        document.getElementById('profileMenuMeta').textContent = `${user?.email || ''} • Parent`;
      }
      const logoutLabel = document.getElementById('logoutMenuBtnLabel');
      const hasParentBackup = Boolean(localStorage.getItem('FamiTube_parent_backup_token'));
      if (logoutLabel) {
        logoutLabel.textContent = (user?.role === 'CHILD' && hasParentBackup)
          ? 'Logout (Back to Parent)'
          : 'Logout';
      }
      renderNotifications(user);
      updateKidToolsVisibility(user);
    }

    function handleAuthenticatedUser(user) {
      currentUser = user;
      if (user) localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
      applyUserHeaderUI(user);
      if (user?.role === 'CHILD') {
        document.getElementById('authGate').style.display = 'none';
        document.getElementById('parentModeApp').style.display = 'none';
        document.getElementById('studioApp').style.display = 'none';
        openHome(true);
        return;
      }
      openParentMode();
      loadStats();
      loadVideos();
      loadChannels();
      if (pendingInviteToken) checkInviteQueryParam();
    }

    function showAuthGate(role = 'PARENT', tab = 'login') {
      setModeButtons('studio');
      setLoginRole(role);
      if (role !== 'CHILD' && tab === 'register') switchAuthTab('register');
      document.getElementById('linkChannelsJson').style.display = 'none';
      document.getElementById('showcaseApp').style.display = 'none';
      document.getElementById('channelsSearchApp').style.display = 'none';
      const chanPageAuth = document.getElementById('channelDetailPage');
      if (chanPageAuth) chanPageAuth.style.display = 'none';
      document.getElementById('authGate').style.display = 'flex';
      document.getElementById('parentModeApp').style.display = 'none';
      document.getElementById('studioApp').style.display = 'none';
      document.getElementById('userBar').style.display = 'none';
      document.getElementById('guestProfileMenu').style.display = 'flex';
    }

    function showStudioApp(user) {
      setModeButtons('studio');
      document.getElementById('linkChannelsJson').style.display = 'none';
      document.getElementById('showcaseApp').style.display = 'none';
      document.getElementById('channelsSearchApp').style.display = 'none';
      const chanPageStu = document.getElementById('channelDetailPage');
      if (chanPageStu) chanPageStu.style.display = 'none';
      document.getElementById('authGate').style.display = 'none';
      document.getElementById('parentModeApp').style.display = 'none';
      document.getElementById('studioApp').style.display = 'block';
      applyUserHeaderUI(user);
    }

    function handleLogout() {
      const parentBackupToken = localStorage.getItem('FamiTube_parent_backup_token');
      const parentBackupUserRaw = localStorage.getItem('FamiTube_parent_backup_user');
      if (currentUser?.role === 'CHILD' && parentBackupToken && parentBackupUserRaw) {
        try {
          const parentUser = JSON.parse(parentBackupUserRaw);
          if (typeof stopKidWatchTimer === 'function') stopKidWatchTimer();
          localStorage.removeItem('FamiTube_parent_backup_token');
          localStorage.removeItem('FamiTube_parent_backup_user');
          parentPreviewChild = null;
          kidHomeSelectedTopic = null;
          activeKidTab = 'curated';
          authToken = parentBackupToken;
          localStorage.setItem(AUTH_TOKEN_KEY, authToken);
          localStorage.setItem(AUTH_USER_KEY, JSON.stringify(parentUser));
          document.getElementById('profileDropdownMenu').style.display = 'none';
          document.getElementById('notifDropdownMenu').style.display = 'none';
          handleAuthenticatedUser(parentUser);
          return;
        } catch {
          localStorage.removeItem('FamiTube_parent_backup_token');
          localStorage.removeItem('FamiTube_parent_backup_user');
        }
      }

      const wasChild = currentUser?.role === 'CHILD';
      if (typeof stopKidWatchTimer === 'function') stopKidWatchTimer();
      parentPreviewChild = null;
      const previewBanner = document.getElementById('parentPreviewBanner');
      if (previewBanner) previewBanner.style.display = 'none';
      authToken = '';
      currentUser = null;
      updateKidToolsVisibility(null);
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(AUTH_USER_KEY);
      localStorage.removeItem('FamiTube_parent_backup_token');
      localStorage.removeItem('FamiTube_parent_backup_user');
      localStorage.removeItem('famitube_welcome_seen');
      document.getElementById('profileDropdownMenu').style.display = 'none';
      document.getElementById('notifDropdownMenu').style.display = 'none';
      document.getElementById('loggedInWelcomeBanner').style.display = 'none';
      document.getElementById('userBar').style.display = 'none';
      document.getElementById('guestProfileMenu').style.display = 'flex';
      document.getElementById('btnNavHome').style.display = 'inline-flex';
      document.getElementById('btnNavChannels').style.display = 'inline-flex';
      const btnWhoLogout = document.getElementById('btnWhoIsWatching');
      if (btnWhoLogout) btnWhoLogout.style.display = 'none';
      document.getElementById('btnModeParent').style.display = 'none';
      document.getElementById('btnModeStudio').style.display = 'none';
      const appPreviewEl = document.getElementById('navAppPreview');
      const familyPassEl = document.getElementById('navFamilyPass');
      const faqEl = document.getElementById('navFaq');
      if (appPreviewEl) appPreviewEl.style.display = 'inline-flex';
      if (familyPassEl) familyPassEl.style.display = 'inline-flex';
      if (faqEl) faqEl.style.display = 'inline-flex';
      document.getElementById('parentModeApp').style.display = 'none';
      if (wasChild) {
        openHome(false);
      } else {
        showAuthGate();
      }
    }

    async function authFetch(path, options = {}) {
      const headers = new Headers(options.headers || {});
      if (authToken) {
        headers.set('Authorization', `Bearer ${authToken}`);
      }
      const res = await fetch(apiUrl(path), { ...options, headers });
      if (res.status === 401) {
        handleLogout();
        showAuthAlert('Your session expired. Please sign in again.', true);
        throw new Error('Unauthorized');
      }
      if (res.status === 403) {
        const cloned = res.clone();
        try {
          const data = await cloned.json();
          if (data && data.needsVerification) {
            handleLogout();
            showAuthAlert('Email verification required. Please verify your account.', true);
            throw new Error('Needs verification');
          }
        } catch (err) {
          if (err && err.message === 'Needs verification') throw err;
        }
      }
      return res;
    }

    async function handlePairDeviceLogin(e) {
      e.preventDefault();
      document.getElementById('authAlert').style.display = 'none';
      const code = String(document.getElementById('pairCodeInput')?.value || '').replace(/\D/g, '');
      if (code.length !== 6) {
        return showAuthAlert('Please enter the 6-digit pairing code.', true);
      }
      try {
        const res = await fetch(apiUrl('/api/auth/pair-device'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code })
        });
        const json = await res.json();
        if (!res.ok || !json.success || !json.token || !json.user) {
          return showAuthAlert(json.message || 'Invalid or expired pairing code.', true);
        }
        localStorage.removeItem('FamiTube_parent_backup_token');
        localStorage.removeItem('FamiTube_parent_backup_user');
        authToken = json.token;
        localStorage.setItem(AUTH_TOKEN_KEY, authToken);
        handleAuthenticatedUser(json.user);
      } catch {
        showAuthAlert('Unable to reach API server at ' + API_BASE, true);
      }
    }

    async function handleLogin(e) {
      e.preventDefault();
      document.getElementById('authAlert').style.display = 'none';
      document.getElementById('resendVerifyBtn').style.display = 'none';
      const email = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPassword').value;

      try {
        const res = await fetch(apiUrl('/api/auth/login'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, loginType: activeLoginRole })
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          showAuthAlert(json.message || 'Login failed', true);
          if (json.needsVerification) {
            pendingVerifyEmail = email;
            document.getElementById('resendVerifyBtn').style.display = 'inline-flex';
          }
          return;
        }
        authToken = json.token;
        localStorage.setItem(AUTH_TOKEN_KEY, authToken);
        handleAuthenticatedUser(json.user);
      } catch (err) {
        showAuthAlert('Unable to reach API server at ' + API_BASE, true);
      }
    }

    async function handleRegister(e) {
      e.preventDefault();
      document.getElementById('authAlert').style.display = 'none';
      const name = document.getElementById('regName').value.trim();
      const email = document.getElementById('regEmail').value.trim();
      const password = document.getElementById('regPassword').value;
      const referralCode = (document.getElementById('regReferralCode')?.value || '').trim().toUpperCase();

      try {
        const res = await fetch(apiUrl('/api/auth/register'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password, ...(referralCode ? { referralCode } : {}) })
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          showAuthAlert(json.message || 'Registration failed', true);
          return;
        }
        pendingVerifyEmail = email;
        switchAuthTab('login');
        document.getElementById('loginEmail').value = email;
        showAuthAlert(json.message || 'Check your email to verify your account before signing in.', false);
      } catch (err) {
        showAuthAlert('Unable to reach API server at ' + API_BASE, true);
      }
    }

    async function handleResendVerification() {
      const email = pendingVerifyEmail || document.getElementById('loginEmail').value.trim();
      if (!email) return;
      try {
        const res = await fetch(apiUrl('/api/auth/resend-verification'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const json = await res.json();
        showAuthAlert(json.message || 'Verification email sent.', res.ok && json.success ? false : true);
      } catch {
        showAuthAlert('Unable to reach API server at ' + API_BASE, true);
      }
    }

    const GOOGLE_CLIENT_ID = '69894868320-jis5bocnh9mul5g053so02op5evl2rfd.apps.googleusercontent.com';

    async function completeGoogleAuth(payload) {
      document.getElementById('authAlert').style.display = 'none';
      document.getElementById('resendVerifyBtn').style.display = 'none';
      const btn = document.getElementById('btnGoogleAuth');
      if (btn) btn.disabled = true;

      try {
        const res = await fetch(apiUrl('/api/auth/google'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...payload,
            loginType: activeLoginRole
          })
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          showAuthAlert(json.message || 'Google sign-in failed', true);
          return;
        }
        authToken = json.token;
        localStorage.setItem(AUTH_TOKEN_KEY, authToken);
        handleAuthenticatedUser(json.user);
      } catch {
        showAuthAlert('Unable to reach API server at ' + API_BASE, true);
      } finally {
        if (btn) btn.disabled = false;
      }
    }

    function startGoogleSignIn() {
      document.getElementById('authAlert').style.display = 'none';
      if (window.google && window.google.accounts && window.google.accounts.oauth2) {
        try {
          const tokenClient = window.google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: 'openid email profile',
            callback: (response) => {
              if (response && response.access_token) {
                completeGoogleAuth({ accessToken: response.access_token });
              } else if (response && response.error && response.error !== 'popup_closed_by_user') {
                showAuthAlert('Google sign-in failed: ' + (response.error_description || response.error), true);
              }
            }
          });
          tokenClient.requestAccessToken({ prompt: 'select_account' });
          return;
        } catch {
          // fall back to server-side OAuth redirect below
        }
      }

      const redirectUrl = apiUrl(
        `/api/auth/google?loginType=${encodeURIComponent(activeLoginRole)}&redirectOrigin=${encodeURIComponent(window.location.origin)}`
      );
      window.location.href = redirectUrl;
    }

    let allVideos = [];
    let allChannels = [];
    let curVideoData = null;
    let activeManageChannel = null;

    async function loadStats() {
      const res = await authFetch('/api/admin/stats');
      const json = await res.json();
      if (json.success) {
        document.getElementById('statVideos').textContent = json.data.approvedVideos;
        document.getElementById('statChannels').textContent = json.data.totalChannels;
        document.getElementById('statViews').textContent = json.data.totalViews.toLocaleString();
      }
    }

    async function loadVideos() {
      const res = await authFetch('/api/admin/videos');
      const json = await res.json();
      if (json.success) {
        allVideos = json.data;
        renderVideos(allVideos);
        populateTimelineVideoSelect();
      }
    }

    let activeChannelPerms = { isOwner: false, canAddVideo: false, canSuggestVideo: false, canComment: false };
    let activeCommentsVideoId = null;
    let activeShareChannelId = null;
    let pendingInviteToken = new URLSearchParams(window.location.search).get('invite') || '';

    async function loadChannels() {
      const res = await authFetch('/api/my/channels');
      const json = await res.json();
      if (json.success) {
        allChannels = json.data;
        populateChannelSelect();
        renderChannelsGrid();
      }
    }

    function populateChannelSelect() {
      const sel = document.getElementById('formChannelSelect');
      if (!sel) return;
      const writable = allChannels.filter(c => c.role === 'OWNER' || c.permissions?.canAddVideo);
      sel.innerHTML = writable.map(c =>
        `<option value="${c.id}">${c.channelType === 'LIVE_TV' ? '[LIVE] ' : ''}${c.name}</option>`
      ).join('');
    }

    function formatChannelAgeBadge(ageRating) {
      const normalized = String(ageRating || 'ALL').toUpperCase();
      const map = {
        TODDLER: { label: 'Toddler 1.5–3', bg: 'rgba(255,183,3,0.16)', color: '#d97706' },
        YOUNG_KIDS: { label: 'Young Kids 4–6', bg: 'rgba(6,214,160,0.16)', color: '#059669' },
        OLDER_KIDS: { label: 'Older Kids 7+', bg: 'rgba(76,201,240,0.18)', color: '#0284c7' },
        ALL: { label: 'All Ages', bg: 'rgba(131,56,236,0.15)', color: '#7c3aed' }
      };
      const meta = map[normalized] || map.ALL;
      return `<span style="font-size:0.72rem; padding:3px 8px; border-radius:999px; background:${meta.bg}; color:${meta.color}; font-weight:700;">${meta.label}</span>`;
    }

    function renderChannelsGrid() {
      const grid = document.getElementById('channelsGrid');
      grid.innerHTML = allChannels.map(c => {
        const isLive = c.channelType === 'LIVE_TV';
        const isOwner = c.role === 'OWNER';
        const isPrivate = c.visibility === 'PRIVATE';
        const roleLabel = isOwner
          ? 'Owner'
          : (c.role === 'MEMBER' ? `Member (${c.preset || 'CUSTOM'})` : 'Public Channel');
        const pendingBadge = (isOwner && c.pendingSuggestionsCount > 0)
          ? `<span style="background:var(--warning); color:#000; font-size:0.72rem; font-weight:700; padding:2px 8px; border-radius:999px;">${c.pendingSuggestionsCount} pending</span>`
          : '';
        return `
          <div class="video-card" style="padding:1.5rem; text-align:center;">
            <div style="margin-bottom:0.75rem; display:flex; gap:0.4rem; justify-content:center; flex-wrap:wrap;">
              <span class="${isLive ? 'pill-live' : 'pill-ondemand'}">
                ${isLive ? 'LIVE CHANNEL' : 'ON DEMAND CHANNEL'}
              </span>
              ${formatChannelAgeBadge(c.ageRating)}
              <span style="font-size:0.72rem; padding:3px 8px; border-radius:999px; background:${isPrivate ? 'rgba(255,183,3,0.15)' : 'rgba(6,214,160,0.15)'}; color:${isPrivate ? '#b45309' : '#047857'}; font-weight:700;">
                ${isPrivate ? 'PRIVATE' : 'PUBLIC'}
              </span>
              <span style="font-size:0.72rem; padding:3px 8px; border-radius:999px; background:rgba(67,97,238,0.12); color:var(--secondary); font-weight:700;">
                ${roleLabel}
              </span>
              ${pendingBadge}
            </div>
            <img src="${c.avatarUrl}" style="width:76px; height:76px; border-radius:50%; margin:0 auto 0.75rem; object-fit:cover; border:2px solid ${isLive ? 'var(--primary)' : 'var(--accent)'};">
            <h4 style="font-size:1.1rem; margin-bottom:0.25rem;">${c.name}</h4>
            <div style="color:var(--accent); font-size:0.8rem; margin-bottom:0.25rem;">${c.category} • ${c.videoCount || 0} videos</div>
            <div style="color:var(--text-muted); font-size:0.76rem; margin-bottom:0.6rem;">by ${c.ownerName || 'Team FamiTube'}</div>
            <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:1.25rem; flex:1;">${c.description}</p>
            <div style="display:flex; gap:0.5rem; justify-content:center; flex-wrap:wrap;">
              <button class="btn btn-primary btn-sm" onclick="openChannelModal('${c.id}')">
                <span class="material-symbols-rounded" style="font-size:16px;">playlist_add</span> Open Workspace
              </button>
              ${isOwner ? `
                <button class="btn btn-secondary btn-sm" onclick="openShareModal('${c.id}')" title="Share & Permissions">
                  <span class="material-symbols-rounded" style="font-size:16px;">group_add</span> Share
                </button>
                <button class="btn btn-secondary btn-sm" onclick="deleteChannel('${c.id}')" title="Delete Channel">
                  <span class="material-symbols-rounded" style="font-size:16px;">delete</span>
                </button>
              ` : ''}
            </div>
          </div>
        `;
      }).join('');
    }

    const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    function formatTodayYmd(d = new Date()) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }

    function formatClock24(totalSec) {
      const clamped = Math.max(0, Math.min(86400, Math.floor(totalSec)));
      const h = String(Math.floor(clamped / 3600)).padStart(2, '0');
      const m = String(Math.floor((clamped % 3600) / 60)).padStart(2, '0');
      const s = String(clamped % 60).padStart(2, '0');
      return `${h}:${m}:${s}`;
    }

    function parseTimeInputToSeconds(val) {
      const parts = String(val || '08:00').split(':').map(n => parseInt(n, 10) || 0);
      const h = Math.max(0, Math.min(23, parts[0] || 0));
      const m = Math.max(0, Math.min(59, parts[1] || 0));
      return h * 3600 + m * 60;
    }

    let liveSchedulesDraft = {}; // key -> { id, ruleType, date?, weekday?, slots: [] }
    let timelineCalMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let activeTimelineScope = 'DATE'; // 'DATE' | 'WEEKDAY' | 'DEFAULT'
    let activeTimelineDate = formatTodayYmd();
    let activeTimelineWeekday = new Date().getDay();

    function getActiveScheduleKey() {
      if (activeTimelineScope === 'DATE') return `DATE:${activeTimelineDate}`;
      if (activeTimelineScope === 'WEEKDAY') return `WEEKDAY:${activeTimelineWeekday}`;
      return 'DEFAULT';
    }

    function getOrCreateActiveSchedule() {
      const key = getActiveScheduleKey();
      if (!liveSchedulesDraft[key]) {
        liveSchedulesDraft[key] = {
          id: key,
          ruleType: activeTimelineScope,
          date: activeTimelineScope === 'DATE' ? activeTimelineDate : undefined,
          weekday: activeTimelineScope === 'WEEKDAY' ? activeTimelineWeekday : undefined,
          slots: []
        };
      }
      return liveSchedulesDraft[key];
    }

    function toggleLiveTimelineBuilder() {
      const el = document.getElementById('liveTimelineBuilder');
      const mode = document.getElementById('newChanType')?.value;
      if (el) el.style.display = mode === 'LIVE_TV' ? 'block' : 'none';
      if (mode === 'LIVE_TV') renderLiveTimelineBuilder();
    }

    function setTimelineScope(scope) {
      activeTimelineScope = scope;
      renderLiveTimelineBuilder();
    }

    function selectTimelineCalendarDate(ymd) {
      activeTimelineDate = ymd;
      activeTimelineScope = 'DATE';
      renderLiveTimelineBuilder();
    }

    function selectTimelineWeekday(dayIdx) {
      activeTimelineWeekday = dayIdx;
      activeTimelineScope = 'WEEKDAY';
      renderLiveTimelineBuilder();
    }

    function shiftTimelineCalendarMonth(delta) {
      timelineCalMonth = new Date(timelineCalMonth.getFullYear(), timelineCalMonth.getMonth() + delta, 1);
      renderLiveTimelineBuilder();
    }

    function populateTimelineVideoSelect() {
      const sel = document.getElementById('timelineVideoSelect');
      if (!sel) return;
      sel.innerHTML = allVideos.length
        ? allVideos.map(v => `<option value="${v.id}">${v.title} (${formatTime(v.duration || 180)})</option>`).join('')
        : '<option value="">No curated videos available</option>';
    }

    function addVideoToTimelineDraft() {
      const sel = document.getElementById('timelineVideoSelect');
      const videoId = sel?.value;
      if (!videoId) return;
      const vid = allVideos.find(v => v.id === videoId);
      if (!vid) return;
      const sched = getOrCreateActiveSchedule();
      const startInput = document.getElementById('timelineStartTime');
      const startSec = parseTimeInputToSeconds(startInput?.value);
      const fullDur = Math.max(10, vid.duration || 180);
      sched.slots.push({
        videoId: vid.id,
        startOfDaySeconds: startSec,
        playMode: 'WHOLE',
        clipStartSeconds: 0,
        clipEndSeconds: fullDur
      });
      sched.slots.sort((a, b) => a.startOfDaySeconds - b.startOfDaySeconds);
      // Auto-advance time input to end of added video (capped at 23:59)
      const nextSec = Math.min(86340, startSec + fullDur);
      if (startInput) {
        const nh = String(Math.floor(nextSec / 3600)).padStart(2, '0');
        const nm = String(Math.floor((nextSec % 3600) / 60)).padStart(2, '0');
        startInput.value = `${nh}:${nm}`;
      }
      renderLiveTimelineBuilder();
    }

    function removeTimelineSlot(idx) {
      const sched = getOrCreateActiveSchedule();
      sched.slots.splice(idx, 1);
      renderLiveTimelineBuilder();
    }

    function updateTimelineSlotStartOfDay(idx, timeStr) {
      const sched = getOrCreateActiveSchedule();
      const slot = sched.slots[idx];
      if (!slot) return;
      slot.startOfDaySeconds = parseTimeInputToSeconds(timeStr);
      sched.slots.sort((a, b) => a.startOfDaySeconds - b.startOfDaySeconds);
      renderLiveTimelineBuilder();
    }

    function updateTimelineSlotMode(idx, mode) {
      const sched = getOrCreateActiveSchedule();
      const slot = sched.slots[idx];
      if (!slot) return;
      const vid = allVideos.find(v => v.id === slot.videoId);
      const fullDur = Math.max(10, vid?.duration || 180);
      slot.playMode = mode === 'CLIP' ? 'CLIP' : 'WHOLE';
      if (slot.playMode === 'WHOLE') {
        slot.clipStartSeconds = 0;
        slot.clipEndSeconds = fullDur;
      } else if (!slot.clipEndSeconds || slot.clipEndSeconds <= slot.clipStartSeconds) {
        slot.clipEndSeconds = fullDur;
      }
      renderLiveTimelineBuilder();
    }

    function updateTimelineSlotTime(idx, field, val) {
      const sched = getOrCreateActiveSchedule();
      const slot = sched.slots[idx];
      if (!slot) return;
      const vid = allVideos.find(v => v.id === slot.videoId);
      const fullDur = Math.max(10, vid?.duration || 180);
      const num = Math.max(0, Math.min(fullDur, parseInt(val, 10) || 0));
      if (field === 'start') {
        slot.clipStartSeconds = Math.min(num, fullDur - 1);
        if (slot.clipEndSeconds != null && slot.clipEndSeconds <= slot.clipStartSeconds) {
          slot.clipEndSeconds = fullDur;
        }
      } else {
        slot.clipEndSeconds = num > slot.clipStartSeconds ? num : fullDur;
      }
      renderLiveTimelineBuilder();
    }

    function renderTimelineCalendar() {
      const monthLabel = document.getElementById('timelineCalMonthLabel');
      const grid = document.getElementById('timelineCalendarGrid');
      if (!monthLabel || !grid) return;

      const year = timelineCalMonth.getFullYear();
      const month = timelineCalMonth.getMonth();
      monthLabel.textContent = timelineCalMonth.toLocaleString(undefined, { month: 'long', year: 'numeric' });

      const firstDay = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const hasDefault = Boolean(liveSchedulesDraft['DEFAULT']?.slots?.length);

      let html = '';
      for (let i = 0; i < firstDay; i++) {
        html += '<div></div>';
      }
      for (let day = 1; day <= daysInMonth; day++) {
        const ymd = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const wd = new Date(year, month, day).getDay();
        const isSelected = activeTimelineScope === 'DATE' && activeTimelineDate === ymd;
        const hasDateRule = Boolean(liveSchedulesDraft[`DATE:${ymd}`]?.slots?.length);
        const hasWeekdayRule = Boolean(liveSchedulesDraft[`WEEKDAY:${wd}`]?.slots?.length);
        const dotColor = hasDateRule ? 'var(--primary)' : (hasWeekdayRule ? 'var(--secondary)' : (hasDefault ? 'var(--success)' : 'transparent'));
        html += `
          <button type="button" onclick="selectTimelineCalendarDate('${ymd}')" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:0.32rem 0.1rem; border-radius:6px; border:1px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}; background:${isSelected ? 'rgba(255,51,102,0.14)' : 'var(--surface-light)'}; color:var(--text); font-size:0.76rem; font-weight:${isSelected ? '800' : '600'}; cursor:pointer;">
            <span>${day}</span>
            <span style="width:6px; height:6px; border-radius:50%; margin-top:2px; background:${dotColor};"></span>
          </button>
        `;
      }
      grid.innerHTML = html;
    }

    function renderLiveTimelineBuilder() {
      renderTimelineCalendar();

      const scopeDateBtn = document.getElementById('scopeBtnDate');
      const scopeWdBtn = document.getElementById('scopeBtnWeekday');
      const scopeDefBtn = document.getElementById('scopeBtnDefault');
      if (scopeDateBtn) scopeDateBtn.className = activeTimelineScope === 'DATE' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
      if (scopeWdBtn) scopeWdBtn.className = activeTimelineScope === 'WEEKDAY' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
      if (scopeDefBtn) scopeDefBtn.className = activeTimelineScope === 'DEFAULT' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';

      const wdPicker = document.getElementById('scopeWeekdayPicker');
      if (wdPicker) {
        wdPicker.style.display = activeTimelineScope === 'WEEKDAY' ? 'flex' : 'none';
        wdPicker.innerHTML = WEEKDAY_SHORT.map((lbl, idx) => `
          <button type="button" class="btn btn-sm ${activeTimelineWeekday === idx ? 'btn-primary' : 'btn-secondary'}" onclick="selectTimelineWeekday(${idx})">${lbl}</button>
        `).join('');
      }

      const summaryEl = document.getElementById('scopeActiveSummary');
      if (summaryEl) {
        if (activeTimelineScope === 'DATE') {
          summaryEl.innerHTML = `Editing <strong>Specific Date:</strong> ${activeTimelineDate} (overrides weekday &amp; default)`;
        } else if (activeTimelineScope === 'WEEKDAY') {
          summaryEl.innerHTML = `Editing <strong>Every ${WEEKDAY_NAMES[activeTimelineWeekday]}</strong> (overrides default)`;
        } else {
          summaryEl.innerHTML = `Editing <strong>Default Schedule</strong> (used when no custom date or weekday is set)`;
        }
      }

      const listEl = document.getElementById('timelineSlotsList');
      const barEl = document.getElementById('timelineVisualBar');
      const badgeEl = document.getElementById('timelineTotalBadge');
      if (!listEl || !barEl || !badgeEl) return;

      const sched = liveSchedulesDraft[getActiveScheduleKey()];
      const slots = sched?.slots || [];

      if (!slots.length) {
        badgeEl.textContent = '0 slots';
        barEl.innerHTML = '';
        listEl.innerHTML = '<div style="font-size:0.84rem; color:var(--text-muted); padding:0.65rem; text-align:center; border:1px dashed var(--border); border-radius:var(--radius-sm);">No videos scheduled for this rule yet. Pick a start time and click Add.</div>';
        return;
      }

      const computed = slots.map((slot, idx) => {
        const vid = allVideos.find(v => v.id === slot.videoId) || { title: 'Video', duration: 180, thumbnailUrl: '' };
        const fullDur = Math.max(10, vid.duration || 180);
        const cStart = slot.playMode === 'CLIP' ? Math.max(0, Math.min(slot.clipStartSeconds || 0, fullDur - 1)) : 0;
        const cEnd = slot.playMode === 'CLIP' && slot.clipEndSeconds > cStart ? Math.min(slot.clipEndSeconds, fullDur) : fullDur;
        const rawDur = Math.max(1, cEnd - cStart);
        const nextStart = idx + 1 < slots.length ? slots[idx + 1].startOfDaySeconds : 86400;
        const effectiveEnd = Math.min(86400, nextStart, slot.startOfDaySeconds + rawDur);
        const crossesMidnight = slot.startOfDaySeconds + rawDur > 86400;
        const clippedByNext = !crossesMidnight && slot.startOfDaySeconds + rawDur > nextStart;
        const effectiveDur = Math.max(0, effectiveEnd - slot.startOfDaySeconds);
        return { slot, vid, fullDur, cStart, cEnd, rawDur, effectiveEnd, effectiveDur, crossesMidnight, clippedByNext, idx };
      });

      badgeEl.textContent = `${computed.length} slot${computed.length === 1 ? '' : 's'}`;
      const colors = ['#FF3366', '#4361EE', '#06D6A0', '#FFB703', '#4CC9F0'];
      barEl.innerHTML = computed.map(item => {
        const leftPct = (item.slot.startOfDaySeconds / 86400) * 100;
        const widthPct = Math.max(1.2, (item.effectiveDur / 86400) * 100);
        const bg = colors[item.idx % colors.length];
        return `<div title="#${item.idx + 1} ${item.vid.title} (${formatClock24(item.slot.startOfDaySeconds)} - ${formatClock24(item.effectiveEnd)})" style="position:absolute; top:2px; bottom:2px; left:${leftPct}%; width:${widthPct}%; background:${bg}; color:white; font-size:0.65rem; font-weight:700; display:flex; align-items:center; justify-content:center; white-space:nowrap; overflow:hidden; border-radius:4px;">#${item.idx + 1}</div>`;
      }).join('');

      listEl.innerHTML = computed.map(item => {
        const hh = String(Math.floor(item.slot.startOfDaySeconds / 3600)).padStart(2, '0');
        const mm = String(Math.floor((item.slot.startOfDaySeconds % 3600) / 60)).padStart(2, '0');
        return `
          <div class="schedule-item" style="flex-direction:column; align-items:stretch; gap:0.6rem; background:var(--surface);">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:0.75rem; flex-wrap:wrap;">
              <div style="display:flex; align-items:center; gap:0.65rem; min-width:0;">
                <span style="font-weight:800; color:var(--primary); font-size:0.85rem;">#${item.idx + 1}</span>
                <img src="${item.vid.thumbnailUrl}" style="width:52px; height:32px; object-fit:cover; border-radius:4px;">
                <div style="min-width:0;">
                  <div style="font-weight:600; font-size:0.88rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.vid.title}</div>
                  <div style="font-size:0.74rem; color:var(--text-muted);">
                    ${formatClock24(item.slot.startOfDaySeconds)} &rarr; ${formatClock24(item.effectiveEnd)} (${formatTime(item.effectiveDur)})
                    ${item.crossesMidnight ? '<span style="margin-left:0.4rem; color:#FFB703; font-weight:700;">• Cut off at 24:00 (next day takes over)</span>' : ''}
                    ${item.clippedByNext ? '<span style="margin-left:0.4rem; color:#FFB703; font-weight:700;">• Cut off by next slot</span>' : ''}
                  </div>
                </div>
              </div>
              <button type="button" class="btn-icon delete" onclick="removeTimelineSlot(${item.idx})" title="Remove">
                <span class="material-symbols-rounded" style="font-size:1.1rem;">delete</span>
              </button>
            </div>
            <div style="display:flex; align-items:center; gap:0.65rem; flex-wrap:wrap; padding-top:0.45rem; border-top:1px solid var(--border); font-size:0.8rem;">
              <label style="font-weight:600; color:var(--text-muted);">Air Time:</label>
              <input type="time" value="${hh}:${mm}" onchange="updateTimelineSlotStartOfDay(${item.idx}, this.value)" style="background:var(--surface-light); border:1px solid var(--border); color:var(--text); padding:0.28rem 0.45rem; border-radius:6px; font-size:0.8rem;">
              <label style="font-weight:600; color:var(--text-muted);">Playback:</label>
              <select onchange="updateTimelineSlotMode(${item.idx}, this.value)" style="background:var(--surface-light); border:1px solid var(--border); color:var(--text); padding:0.3rem 0.55rem; border-radius:6px; font-size:0.8rem;">
                <option value="WHOLE" ${item.slot.playMode === 'WHOLE' ? 'selected' : ''}>Play Whole Video (${formatTime(item.fullDur)})</option>
                <option value="CLIP" ${item.slot.playMode === 'CLIP' ? 'selected' : ''}>Play from Timestamp</option>
              </select>
              ${item.slot.playMode === 'CLIP' ? `
                <label style="color:var(--text-muted);">Start (sec):</label>
                <input type="number" min="0" max="${item.fullDur - 1}" value="${item.cStart}" onchange="updateTimelineSlotTime(${item.idx}, 'start', this.value)" style="width:76px; background:var(--surface-light); border:1px solid var(--border); color:var(--text); padding:0.28rem 0.45rem; border-radius:6px;">
                <label style="color:var(--text-muted);">End (sec):</label>
                <input type="number" min="${item.cStart + 1}" max="${item.fullDur}" value="${item.cEnd}" onchange="updateTimelineSlotTime(${item.idx}, 'end', this.value)" style="width:76px; background:var(--surface-light); border:1px solid var(--border); color:var(--text); padding:0.28rem 0.45rem; border-radius:6px;">
              ` : ''}
            </div>
          </div>
        `;
      }).join('');
    }

    
    async function previewYouTubeChannel() {
      const urlInput = document.getElementById('ytImportUrl');
      const previewBox = document.getElementById('ytImportPreviewBox');
      const btn = document.getElementById('btnYtPreview');
      const url = (urlInput?.value || '').trim();
      if (!url) {
        alert('Please enter a YouTube channel handle or URL first.');
        return;
      }
      if (btn) btn.disabled = true;
      if (previewBox) {
        previewBox.style.display = 'block';
        previewBox.innerHTML = '<div style="display:flex; align-items:center; gap:0.5rem; color:var(--text-muted); font-size:0.88rem;"><span class="material-symbols-rounded" style="animation:spin 1s linear infinite;">sync</span> Resolving YouTube channel &amp; latest videos...</div>';
      }

      try {
        const res = await authFetch('/api/channels/parse-youtube', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url })
        });
        const json = await res.json();
        if (json.success && json.data) {
          const info = json.data;
          const videos = info.videos || [];
          previewBox.innerHTML = `
            <div style="display:flex; align-items:flex-start; gap:0.85rem; margin-bottom:0.75rem;">
              <img src="${info.avatarUrl}" alt="${info.title}" style="width:48px; height:48px; border-radius:50%; object-fit:cover; border:2px solid var(--accent); flex-shrink:0;">
              <div style="flex:1; min-width:0;">
                <div style="font-weight:700; font-size:1rem; color:var(--text);">${info.title}</div>
                <div style="font-size:0.78rem; color:var(--text-muted); line-height:1.3; margin-top:0.15rem; max-height:48px; overflow:hidden;">${info.description || 'Safe YouTube creator channel for kids.'}</div>
                <div style="font-size:0.75rem; font-weight:700; color:var(--accent); margin-top:0.3rem;">${videos.length} videos found ready to ingest</div>
              </div>
            </div>
            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(130px, 1fr)); gap:0.5rem; max-height:160px; overflow-y:auto; padding-right:0.25rem;">
              ${videos.slice(0, 8).map(v => `
                <div style="background:var(--bg); border:1px solid var(--border); border-radius:var(--radius-sm); overflow:hidden; font-size:0.72rem;">
                  <img src="${v.thumbnailUrl}" alt="${v.title}" style="width:100%; aspect-ratio:16/9; object-fit:cover; display:block;">
                  <div style="padding:0.3rem 0.4rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${v.title}">${v.title}</div>
                </div>
              `).join('')}
            </div>
          `;
        } else {
          previewBox.innerHTML = `<div style="color:var(--danger); font-size:0.86rem;"><span class="material-symbols-rounded" style="vertical-align:middle; font-size:1.1rem;">error</span> ${json.message || 'Could not resolve channel. Check the handle/URL and try again.'}</div>`;
        }
      } catch (err) {
        previewBox.innerHTML = '<div style="color:var(--danger); font-size:0.86rem;">Network error fetching channel preview.</div>';
      } finally {
        if (btn) btn.disabled = false;
      }
    }

    async function importYouTubeChannel(e) {
      e.preventDefault();
      const btn = document.getElementById('btnYtImportSubmit');
      const url = document.getElementById('ytImportUrl')?.value?.trim();
      const category = document.getElementById('ytImportCategory')?.value;
      const ageRating = document.getElementById('ytImportAge')?.value;
      const channelType = document.getElementById('ytImportType')?.value;
      const maxVideos = Number(document.getElementById('ytImportMaxVideos')?.value) || 10;
      const autoApproveVideos = document.getElementById('ytImportAutoApprove')?.checked !== false;

      if (!url) {
        alert('Please enter a YouTube channel handle or URL.');
        return;
      }

      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="material-symbols-rounded" style="animation:spin 1s linear infinite;">sync</span> Ingesting Channel &amp; Videos...';
      }

      try {
        const res = await authFetch('/api/channels/import-youtube', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url,
            category,
            ageRating,
            channelType,
            maxVideos,
            autoApproveVideos
          })
        });
        const json = await res.json();
        if (json.success) {
          alert(json.message || 'Channel successfully imported and curated!');
          document.getElementById('formYtChannelImport')?.reset();
          const previewBox = document.getElementById('ytImportPreviewBox');
          if (previewBox) {
            previewBox.style.display = 'none';
            previewBox.innerHTML = '';
          }
          if (typeof loadAdminChannels === 'function') await loadAdminChannels();
          if (typeof loadChannels === 'function') await loadChannels();
          if (typeof loadSearchableChannels === 'function') await loadSearchableChannels();
        } else {
          alert('Failed to import channel: ' + (json.message || 'Unknown error'));
        }
      } catch (err) {
        alert('Error importing YouTube channel: ' + err.message);
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span class="material-symbols-rounded">cloud_download</span> Import &amp; Curate Channel';
        }
      }
    }

    async function createChannel(e) {
      e.preventDefault();
      const channelType = document.getElementById('newChanType').value;
      const payload = {
        name: document.getElementById('newChanName').value,
        channelType,
        category: document.getElementById('newChanCat').value,
        ageRating: document.getElementById('newChanAge')?.value || 'ALL',
        visibility: document.getElementById('newChanVisibility').value,
        description: document.getElementById('newChanDesc').value,
        avatarUrl: document.getElementById('newChanAvatar').value || undefined,
        scheduleTimezoneOffsetMinutes: -new Date().getTimezoneOffset()
      };
      const nonEmptySchedules = Object.values(liveSchedulesDraft).filter(s => s.slots && s.slots.length > 0);
      if (channelType === 'LIVE_TV' && nonEmptySchedules.length > 0) {
        payload.liveSchedules = nonEmptySchedules.map(s => ({
          id: s.id,
          ruleType: s.ruleType,
          date: s.date,
          weekday: s.weekday,
          slots: s.slots.map(slot => ({
            videoId: slot.videoId,
            startOfDaySeconds: slot.startOfDaySeconds,
            playMode: slot.playMode,
            clipStartSeconds: slot.playMode === 'CLIP' ? slot.clipStartSeconds : 0,
            clipEndSeconds: slot.playMode === 'CLIP' ? slot.clipEndSeconds : null
          }))
        }));
        payload.videoIds = Array.from(new Set(nonEmptySchedules.flatMap(s => s.slots.map(sl => sl.videoId))));
      }

      const res = await authFetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.success) {
        e.target.reset();
        liveSchedulesDraft = {};
        activeTimelineScope = 'DATE';
        activeTimelineDate = formatTodayYmd();
        toggleLiveTimelineBuilder();
        renderLiveTimelineBuilder();
        await loadChannels();
        loadStats();
        alert('Channel created!');
      } else {
        alert(json.message || 'Failed to create channel');
      }
    }

    async function deleteChannel(id) {
      if (!confirm('Delete this channel? Videos will remain in your library.')) return;
      const res = await authFetch('/api/channels/' + id, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) return alert(json.message || 'Cannot delete channel');
      await loadChannels();
      loadStats();
    }

    function switchChannelModalTab(tab) {
      document.getElementById('chanTabVideos').style.display = tab === 'videos' ? 'block' : 'none';
      document.getElementById('chanTabSuggest').style.display = tab === 'suggest' ? 'block' : 'none';
      document.getElementById('chanTabQueue').style.display = tab === 'queue' ? 'block' : 'none';

      document.getElementById('chanTabBtnVideos').className = tab === 'videos' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
      document.getElementById('chanTabBtnSuggest').className = tab === 'suggest' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
      document.getElementById('chanTabBtnQueue').className = tab === 'queue' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';

      if (tab === 'queue' && activeManageChannel) {
        loadChannelSuggestions(activeManageChannel.id);
      }
    }

    async function openChannelModal(channelId) {
      const res = await authFetch('/api/channels/' + channelId);
      const json = await res.json();
      if (!json.success) return alert(json.message || 'Cannot open channel');

      const { channel, videos, liveState, permissions } = json.data;
      activeManageChannel = channel;
      activeChannelPerms = permissions || { isOwner: false, canAddVideo: false, canSuggestVideo: false, canComment: false };
      closeCommentsPanel();
      switchChannelModalTab('videos');

      document.getElementById('chanModalTitle').textContent = channel.name;
      const isLive = channel.channelType === 'LIVE_TV';
      const isPrivate = channel.visibility === 'PRIVATE';
      document.getElementById('chanModalBadge').innerHTML =
        `<span class="${isLive ? 'pill-live' : 'pill-ondemand'}">${isLive ? 'LIVE CHANNEL' : 'ON DEMAND CHANNEL'}</span> ` +
        `<span style="font-size:0.75rem; padding:2px 8px; border-radius:999px; background:var(--surface-light);">${isPrivate ? 'Private' : 'Public'}</span>`;

      document.getElementById('chanRoleBadge').textContent = activeChannelPerms.isOwner
        ? 'Owner (Full Control)'
        : `Permissions: ${[
            activeChannelPerms.canAddVideo ? 'Add Videos' : null,
            activeChannelPerms.canSuggestVideo ? 'Suggest Videos' : null,
            activeChannelPerms.canComment ? 'Comment' : null
          ].filter(Boolean).join(', ') || 'View Only'}`;

      document.getElementById('chanOwnerControls').style.display = activeChannelPerms.isOwner ? 'flex' : 'none';
      document.getElementById('chanDirectAddBox').style.display = (activeChannelPerms.isOwner || activeChannelPerms.canAddVideo) ? 'block' : 'none';
      document.getElementById('chanTabBtnSuggest').style.display = (activeChannelPerms.isOwner || activeChannelPerms.canSuggestVideo) ? 'inline-flex' : 'none';
      document.getElementById('chanTabBtnQueue').style.display = (activeChannelPerms.isOwner || activeChannelPerms.canSuggestVideo) ? 'inline-flex' : 'none';

      document.getElementById('chanModeExplain').textContent = isLive
        ? 'Plays videos sequentially by wall-clock time. Viewers cannot seek or skip.'
        : 'YouTube-style channel. Viewers can browse and play any video anytime.';

      document.getElementById('btnToggleMode').textContent = isLive ? 'Switch to On Demand Channel' : 'Switch to Live Channel';
      document.getElementById('btnToggleVisibility').textContent = isPrivate ? 'Make Public' : 'Make Private';

      const liveBox = document.getElementById('liveBroadcastBox');
      if (isLive && liveState && liveState.currentVideo) {
        liveBox.style.display = 'block';
        document.getElementById('liveNowTitle').textContent = liveState.currentVideo.title;
        document.getElementById('liveNowOffset').textContent =
          `Airing at ${formatTime(liveState.offsetSeconds)} / ${formatTime(liveState.currentVideo.duration)} (${liveState.remainingSeconds}s left)`;
      } else {
        liveBox.style.display = 'none';
      }

      const inChannelIds = new Set(videos.map(v => v.id));
      const available = allVideos.filter(v => !inChannelIds.has(v.id));
      const addSel = document.getElementById('addVidToChanSelect');
      addSel.innerHTML = available.length
        ? available.map(v => `<option value="${v.id}">${v.title} (${formatTime(v.duration)})</option>`).join('')
        : '<option value="">All curated videos are already in this channel</option>';

      const listEl = document.getElementById('chanVideosList');
      listEl.innerHTML = videos.length
        ? videos.map((v, idx) => `
            <div class="schedule-item">
              <div style="display:flex; align-items:center; gap:0.75rem;">
                <span style="color:var(--text-muted); font-weight:700;">#${idx + 1}</span>
                <img src="${v.thumbnailUrl}" style="width:56px; height:34px; object-fit:cover; border-radius:4px;">
                <div>
                  <div style="font-weight:600; font-size:0.9rem;">${v.title}</div>
                  <div style="font-size:0.75rem; color:var(--text-muted);">${formatTime(v.duration)} • ${v.sourceType}</div>
                </div>
              </div>
              <div style="display:flex; gap:0.4rem; align-items:center;">
                <button class="btn btn-secondary btn-sm" onclick="openCommentsPanel('${v.id}', '${v.title.replace(/'/g, "\\'")}')">
                  <span class="material-symbols-rounded" style="font-size:16px;">chat</span> Comments
                </button>
                ${activeChannelPerms.isOwner ? `
                  <button class="btn-icon delete" onclick="removeVideoFromChannel('${channel.id}', '${v.id}')" title="Remove from channel">
                    <span class="material-symbols-rounded">remove_circle</span>
                  </button>
                ` : ''}
              </div>
            </div>
          `).join('')
        : '<div style="color:var(--text-muted); padding:1rem; text-align:center;">No videos in this channel yet.</div>';

      if (activeChannelPerms.isOwner || activeChannelPerms.canSuggestVideo) {
        loadChannelSuggestions(channel.id);
      }

      document.getElementById('channelModal').style.display = 'flex';
    }

    function closeChannelModal() {
      document.getElementById('channelModal').style.display = 'none';
      activeManageChannel = null;
      closeCommentsPanel();
    }

    async function toggleChannelMode() {
      if (!activeManageChannel) return;
      const newType = activeManageChannel.channelType === 'LIVE_TV' ? 'ON_DEMAND' : 'LIVE_TV';
      await authFetch('/api/channels/' + activeManageChannel.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelType: newType })
      });
      await loadChannels();
      openChannelModal(activeManageChannel.id);
    }

    async function toggleChannelVisibility() {
      if (!activeManageChannel) return;
      const newVis = activeManageChannel.visibility === 'PRIVATE' ? 'PUBLIC' : 'PRIVATE';
      await authFetch('/api/channels/' + activeManageChannel.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility: newVis })
      });
      await loadChannels();
      openChannelModal(activeManageChannel.id);
    }

    async function addSelectedVideoToChannel() {
      if (!activeManageChannel) return;
      const videoId = document.getElementById('addVidToChanSelect').value;
      if (!videoId) return;
      const res = await authFetch('/api/channels/' + activeManageChannel.id + '/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId })
      });
      const json = await res.json();
      if (!json.success) return alert(json.message || 'Failed to add video');
      await loadChannels();
      openChannelModal(activeManageChannel.id);
    }

    async function addNewVideoDirectlyToChannel() {
      if (!activeManageChannel) return;
      const sourceUrl = document.getElementById('chanDirectUrl').value.trim();
      const title = document.getElementById('chanDirectTitle').value.trim();
      if (!sourceUrl || !title) return alert('Please provide both URL and title.');
      const res = await authFetch('/api/channels/' + activeManageChannel.id + '/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceUrl, title })
      });
      const json = await res.json();
      if (!json.success) return alert(json.message || 'Failed to publish video');
      document.getElementById('chanDirectUrl').value = '';
      document.getElementById('chanDirectTitle').value = '';
      await loadVideos();
      await loadChannels();
      openChannelModal(activeManageChannel.id);
    }

    async function removeVideoFromChannel(channelId, videoId) {
      const res = await authFetch('/api/channels/' + channelId + '/videos/' + videoId, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) return alert(json.message || 'Failed to remove video');
      await loadChannels();
      openChannelModal(channelId);
    }

    async function openCommentsPanel(videoId, videoTitle) {
      if (!activeManageChannel) return;
      activeCommentsVideoId = videoId;
      document.getElementById('chanCommentsTitle').textContent = 'Comments: ' + videoTitle;
      document.getElementById('chanCommentsPanel').style.display = 'block';
      const canComment = activeChannelPerms.isOwner || activeChannelPerms.canComment;
      document.getElementById('chanCommentForm').style.display = canComment ? 'flex' : 'none';
      document.getElementById('chanCommentNoPerm').style.display = canComment ? 'none' : 'block';
      await loadChannelComments();
    }

    function closeCommentsPanel() {
      activeCommentsVideoId = null;
      const panel = document.getElementById('chanCommentsPanel');
      if (panel) panel.style.display = 'none';
    }

    async function loadChannelComments() {
      if (!activeManageChannel || !activeCommentsVideoId) return;
      const res = await authFetch(`/api/channels/${activeManageChannel.id}/videos/${activeCommentsVideoId}/comments`);
      const json = await res.json();
      const list = document.getElementById('chanCommentsList');
      if (!json.success || !json.data.length) {
        list.innerHTML = '<div style="color:var(--text-muted); font-size:0.85rem;">No comments yet.</div>';
        return;
      }
      list.innerHTML = json.data.map(c => `
        <div style="background:var(--surface-light); padding:0.65rem 0.85rem; border-radius:var(--radius-sm); display:flex; justify-content:space-between; align-items:flex-start; gap:0.5rem;">
          <div>
            <div style="font-size:0.78rem; font-weight:700; color:var(--secondary);">${c.authorName || 'Parent'} <span style="font-weight:400; color:var(--text-muted);">• ${new Date(c.createdAt).toLocaleString()}</span></div>
            <div style="font-size:0.88rem; margin-top:0.2rem;">${c.content}</div>
          </div>
          <button class="btn-icon delete" onclick="deleteChannelComment('${c.id}')" title="Delete comment" style="padding:2px;">
            <span class="material-symbols-rounded" style="font-size:16px;">delete</span>
          </button>
        </div>
      `).join('');
    }

    async function submitChannelComment(e) {
      e.preventDefault();
      if (!activeManageChannel || !activeCommentsVideoId) return;
      const input = document.getElementById('chanCommentInput');
      const content = input.value.trim();
      if (!content) return;
      const res = await authFetch(`/api/channels/${activeManageChannel.id}/videos/${activeCommentsVideoId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      const json = await res.json();
      if (!json.success) return alert(json.message || 'Cannot post comment');
      input.value = '';
      await loadChannelComments();
    }

    async function deleteChannelComment(commentId) {
      if (!activeManageChannel || !activeCommentsVideoId) return;
      const res = await authFetch(`/api/channels/${activeManageChannel.id}/videos/${activeCommentsVideoId}/comments/${commentId}`, {
        method: 'DELETE'
      });
      const json = await res.json();
      if (!json.success) return alert(json.message || 'Cannot delete comment');
      await loadChannelComments();
    }

    async function submitVideoSuggestion(e) {
      e.preventDefault();
      if (!activeManageChannel) return;
      const payload = {
        sourceUrl: document.getElementById('sugUrl').value.trim(),
        title: document.getElementById('sugTitle').value.trim(),
        note: document.getElementById('sugNote').value.trim()
      };
      const res = await authFetch(`/api/channels/${activeManageChannel.id}/suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!json.success) return alert(json.message || 'Failed to submit suggestion');
      e.target.reset();
      alert('Suggestion sent to channel owner!');
      switchChannelModalTab('queue');
    }

    async function loadChannelSuggestions(channelId) {
      const res = await authFetch(`/api/channels/${channelId}/suggestions`);
      const json = await res.json();
      if (!json.success) return;
      const pendingCount = json.data.filter(s => s.status === 'PENDING').length;
      document.getElementById('chanQueueCountBadge').textContent = pendingCount ? `(${pendingCount})` : '';

      const list = document.getElementById('chanSuggestionsList');
      if (!json.data.length) {
        list.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:1rem;">No video suggestions yet.</div>';
        return;
      }
      list.innerHTML = json.data.map(s => `
        <div class="schedule-item" style="align-items:flex-start;">
          <div style="display:flex; gap:0.75rem; align-items:center;">
            <img src="${s.thumbnailUrl}" style="width:68px; height:40px; object-fit:cover; border-radius:4px;">
            <div>
              <div style="font-weight:700; font-size:0.92rem;">${s.title}</div>
              <div style="font-size:0.78rem; color:var(--text-muted);">Suggested by ${s.suggesterName || 'Member'} • Status: <strong>${s.status}</strong></div>
              ${s.note ? `<div style="font-size:0.8rem; color:var(--text); margin-top:0.2rem;">"${s.note}"</div>` : ''}
            </div>
          </div>
          ${(activeChannelPerms.isOwner && s.status === 'PENDING') ? `
            <div style="display:flex; gap:0.4rem;">
              <button class="btn btn-primary btn-sm" onclick="approveSuggestion('${channelId}', '${s.id}')">Approve</button>
              <button class="btn btn-secondary btn-sm" onclick="rejectSuggestion('${channelId}', '${s.id}')">Reject</button>
            </div>
          ` : ''}
        </div>
      `).join('');
    }

    async function approveSuggestion(channelId, suggestionId) {
      const res = await authFetch(`/api/channels/${channelId}/suggestions/${suggestionId}/approve`, { method: 'POST' });
      const json = await res.json();
      if (!json.success) return alert(json.message || 'Failed to approve');
      await loadVideos();
      await loadChannels();
      openChannelModal(channelId);
    }

    async function rejectSuggestion(channelId, suggestionId) {
      const res = await authFetch(`/api/channels/${channelId}/suggestions/${suggestionId}/reject`, { method: 'POST' });
      const json = await res.json();
      if (!json.success) return alert(json.message || 'Failed to reject');
      await loadChannelSuggestions(channelId);
      await loadChannels();
    }

    const PRESET_MAP = {
      VIEWER: { canAddVideo: false, canSuggestVideo: false, canComment: false },
      COMMENTER: { canAddVideo: false, canSuggestVideo: false, canComment: true },
      SUGGESTER: { canAddVideo: false, canSuggestVideo: true, canComment: true },
      CONTRIBUTOR: { canAddVideo: true, canSuggestVideo: true, canComment: true }
    };

    function applyInvitePreset() {
      const preset = document.getElementById('invPreset').value;
      if (PRESET_MAP[preset]) {
        document.getElementById('invCanAdd').checked = PRESET_MAP[preset].canAddVideo;
        document.getElementById('invCanSuggest').checked = PRESET_MAP[preset].canSuggestVideo;
        document.getElementById('invCanComment').checked = PRESET_MAP[preset].canComment;
      }
    }

    function onInvitePermToggle() {
      document.getElementById('invPreset').value = 'CUSTOM';
    }

    function openShareModalFromChannel() {
      if (!activeManageChannel) return;
      const cid = activeManageChannel.id;
      closeChannelModal();
      openShareModal(cid);
    }

    async function openShareModal(channelId) {
      activeShareChannelId = channelId;
      document.getElementById('shareModal').style.display = 'flex';
      await Promise.all([loadShareInvites(channelId), loadShareMembers(channelId)]);
    }

    function closeShareModal() {
      document.getElementById('shareModal').style.display = 'none';
      activeShareChannelId = null;
    }

    async function createInviteLink(e) {
      e.preventDefault();
      if (!activeShareChannelId) return;
      const payload = {
        label: document.getElementById('invLabel').value.trim(),
        preset: document.getElementById('invPreset').value,
        permissions: {
          canAddVideo: document.getElementById('invCanAdd').checked,
          canSuggestVideo: document.getElementById('invCanSuggest').checked,
          canComment: document.getElementById('invCanComment').checked
        }
      };
      const res = await authFetch(`/api/channels/${activeShareChannelId}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!json.success) return alert(json.message || 'Failed to create invite');
      document.getElementById('invLabel').value = '';
      await loadShareInvites(activeShareChannelId);
    }

    async function loadShareInvites(channelId) {
      const res = await authFetch(`/api/channels/${channelId}/invites`);
      const json = await res.json();
      const el = document.getElementById('shareInvitesList');
      if (!json.success || !json.data.length) {
        el.innerHTML = '<div style="color:var(--text-muted); font-size:0.85rem;">No invite links created yet.</div>';
        return;
      }
      el.innerHTML = json.data.map(inv => {
        const shareUrl = `${window.location.origin}${window.location.pathname}?invite=${encodeURIComponent(inv.token)}`;
        return `
          <div class="schedule-item" style="opacity:${inv.isRevoked ? 0.5 : 1};">
            <div style="flex:1; min-width:0;">
              <div style="font-weight:700; font-size:0.88rem;">${inv.label || 'Share Link'} • <span style="color:var(--secondary);">${inv.preset}</span> ${inv.isRevoked ? '(Revoked)' : ''}</div>
              <div style="font-size:0.75rem; color:var(--text-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${shareUrl}</div>
              <div style="font-size:0.74rem; color:var(--text-muted);">Uses: ${inv.useCount} • Add: ${inv.permissions.canAddVideo ? 'Yes' : 'No'} | Suggest: ${inv.permissions.canSuggestVideo ? 'Yes' : 'No'} | Comment: ${inv.permissions.canComment ? 'Yes' : 'No'}</div>
            </div>
            ${!inv.isRevoked ? `
              <div style="display:flex; gap:0.4rem;">
                <button class="btn btn-secondary btn-sm" onclick="copyInviteLink('${shareUrl}')">Copy</button>
                <button class="btn btn-secondary btn-sm" onclick="revokeInviteLink('${channelId}', '${inv.id}')">Revoke</button>
              </div>
            ` : ''}
          </div>
        `;
      }).join('');
    }

    function copyInviteLink(url) {
      navigator.clipboard?.writeText(url);
      alert('Invite link copied to clipboard!');
    }

    async function revokeInviteLink(channelId, inviteId) {
      await authFetch(`/api/channels/${channelId}/invites/${inviteId}`, { method: 'DELETE' });
      await loadShareInvites(channelId);
    }

    async function loadShareMembers(channelId) {
      const res = await authFetch(`/api/channels/${channelId}/members`);
      const json = await res.json();
      const el = document.getElementById('shareMembersList');
      if (!json.success || !json.data.length) {
        el.innerHTML = '<div style="color:var(--text-muted); font-size:0.85rem;">No members have joined via invite link yet.</div>';
        return;
      }
      el.innerHTML = json.data.map(m => `
        <div class="schedule-item" style="flex-wrap:wrap; gap:0.5rem;">
          <div>
            <div style="font-weight:700; font-size:0.9rem;">${m.userName || m.userId} <span style="font-weight:400; color:var(--text-muted); font-size:0.78rem;">(${m.userEmail || ''})</span></div>
            <div style="display:flex; gap:0.85rem; margin-top:0.35rem; font-size:0.8rem; flex-wrap:wrap;">
              <label><input type="checkbox" ${m.permissions.canAddVideo ? 'checked' : ''} onchange="updateMemberPermissionFlag('${channelId}', '${m.userId}', 'canAddVideo', this.checked, ${m.permissions.canSuggestVideo}, ${m.permissions.canComment})"> Add Video</label>
              <label><input type="checkbox" ${m.permissions.canSuggestVideo ? 'checked' : ''} onchange="updateMemberPermissionFlag('${channelId}', '${m.userId}', 'canSuggestVideo', ${m.permissions.canAddVideo}, this.checked, ${m.permissions.canComment})"> Suggest Video</label>
              <label><input type="checkbox" ${m.permissions.canComment ? 'checked' : ''} onchange="updateMemberPermissionFlag('${channelId}', '${m.userId}', 'canComment', ${m.permissions.canAddVideo}, ${m.permissions.canSuggestVideo}, this.checked)"> Comment</label>
            </div>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="removeChannelMember('${channelId}', '${m.userId}')">Remove</button>
        </div>
      `).join('');
    }

    async function updateMemberPermissionFlag(channelId, userId, changedKey, addVal, suggestVal, commentVal) {
      const permissions = {
        canAddVideo: changedKey === 'canAddVideo' ? addVal : Boolean(addVal),
        canSuggestVideo: changedKey === 'canSuggestVideo' ? suggestVal : Boolean(suggestVal),
        canComment: changedKey === 'canComment' ? commentVal : Boolean(commentVal)
      };
      await authFetch(`/api/channels/${channelId}/members/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset: 'CUSTOM', permissions })
      });
      await loadShareMembers(channelId);
    }

    async function removeChannelMember(channelId, userId) {
      if (!confirm('Remove this member from the channel?')) return;
      await authFetch(`/api/channels/${channelId}/members/${userId}`, { method: 'DELETE' });
      await loadShareMembers(channelId);
    }

    async function checkInviteQueryParam() {
      if (!pendingInviteToken) return;
      const res = await fetch(apiUrl(`/api/invites/${encodeURIComponent(pendingInviteToken)}`), {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {}
      });
      const json = await res.json();
      const body = document.getElementById('inviteModalBody');
      if (!json.success) {
        body.innerHTML = `<p style="color:var(--primary);">${json.message || 'Invalid invite link.'}</p>`;
        document.getElementById('inviteModal').style.display = 'flex';
        return;
      }
      const d = json.data;
      if (!d.isValid) {
        body.innerHTML = `<p style="color:var(--primary);">This invite link is no longer valid (${d.isRevoked ? 'revoked' : d.isExpired ? 'expired' : 'usage limit reached'}).</p>`;
        document.getElementById('inviteModal').style.display = 'flex';
        return;
      }
      const permsList = [
        d.permissions.canAddVideo ? 'Add Videos Directly' : null,
        d.permissions.canSuggestVideo ? 'Suggest Videos' : null,
        d.permissions.canComment ? 'Comment on Videos' : null
      ].filter(Boolean).join(', ') || 'View Channel Only';

      body.innerHTML = `
        <div style="text-align:center; padding:0.5rem 0;">
          <img src="${d.channel.avatarUrl}" style="width:72px; height:72px; border-radius:50%; object-fit:cover; margin-bottom:0.75rem;">
          <h4 style="font-size:1.15rem; margin-bottom:0.25rem;">${d.channel.name}</h4>
          <div style="font-size:0.82rem; color:var(--text-muted); margin-bottom:0.75rem;">Invited by ${d.channel.ownerName} • ${d.channel.visibility}</div>
          <p style="font-size:0.88rem; margin-bottom:1rem;">${d.channel.description || ''}</p>
          <div style="background:var(--surface-light); padding:0.75rem; border-radius:var(--radius-sm); font-size:0.85rem; margin-bottom:1.25rem;">
            <strong>Role:</strong> ${d.preset}<br>
            <strong>Permissions:</strong> ${permsList}
          </div>
          ${authToken
            ? `<button class="btn btn-primary" onclick="acceptChannelInvite('${pendingInviteToken}')">${d.alreadyMember ? 'Open Channel' : 'Join Channel'}</button>`
            : `<button class="btn btn-primary" onclick="closeInviteModal(); openStudio();">Sign In / Register to Join</button>`
          }
        </div>
      `;
      document.getElementById('inviteModal').style.display = 'flex';
    }

    function closeInviteModal() {
      document.getElementById('inviteModal').style.display = 'none';
    }

    async function acceptChannelInvite(token) {
      const res = await authFetch(`/api/invites/${encodeURIComponent(token)}/accept`, { method: 'POST' });
      const json = await res.json();
      if (!json.success) return alert(json.message || 'Could not join channel');
      pendingInviteToken = '';
      const url = new URL(window.location.href);
      url.searchParams.delete('invite');
      window.history.replaceState({}, '', url.toString());
      closeInviteModal();
      await openStudio();
    }

    async function loadSettings() {
      const res = await authFetch('/api/config');
      const json = await res.json();
      if (json.success) {
        document.getElementById('cfgAppName').value = json.data.appName;
        document.getElementById('cfgWatchLimit').value = json.data.parentalDefaults.defaultWatchLimitMinutes;
        document.getElementById('cfgWelcome').value = json.data.welcomeMessage;
      }
      await loadGlobalParentalControls();
    }

    async function loadGlobalParentalControls() {
      try {
        const res = await authFetch('/api/parent/controls');
        const json = await res.json();
        if (!json.success || !json.data) return;
        const c = json.data;
        document.getElementById('globalPin').value = c.parentPin || '1234';
        document.getElementById('globalDailyLimit').value = c.dailyLimitMinutes ?? 45;
        document.getElementById('globalAgeRating').value = c.ageRating || 'ALL';
        const langEl = document.getElementById('globalContentLanguage');
        if (langEl) langEl.value = c.contentLanguage || 'all';
        const culEl = document.getElementById('globalCultureMode');
        if (culEl) culEl.value = c.cultureMode || 'GLOBAL';
        document.getElementById('globalYtSearchEnabled').checked = c.youtubeSearchEnabled !== false;
        document.getElementById('globalYtRequireApproval').checked = c.searchRequireApproval !== false;
        document.getElementById('globalYtSearchLimit').value = c.searchViewLimit ?? 0;
      } catch {}
    }

    async function saveGlobalParentalControls() {
      const payload = {
        parentPin: document.getElementById('globalPin').value.trim(),
        dailyLimitMinutes: Number(document.getElementById('globalDailyLimit').value),
        ageRating: document.getElementById('globalAgeRating').value,
        contentLanguage: document.getElementById('globalContentLanguage')?.value || 'all',
        cultureMode: document.getElementById('globalCultureMode')?.value || 'GLOBAL',
        youtubeSearchEnabled: document.getElementById('globalYtSearchEnabled').checked,
        searchRequireApproval: document.getElementById('globalYtRequireApproval').checked,
        searchViewLimit: Number(document.getElementById('globalYtSearchLimit').value)
      };
      const res = await authFetch('/api/parent/controls', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!json.success) return alert(json.message || 'Failed to save global controls');
      alert('Global parental controls saved for all kids!');
    }

    function formatTime(seconds) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return mins + ':' + (secs < 10 ? '0' : '') + secs;
    }

    function renderVideos(videos) {
      const grid = document.getElementById('videoGrid');
      if (!videos.length) {
        grid.innerHTML = '<div style="color:var(--text-muted); grid-column:1/-1; padding:2rem; text-align:center;">No videos found.</div>';
        return;
      }

      grid.innerHTML = videos.map(v => `
        <div class="video-card">
          <div class="video-thumb-wrap" onclick='previewVideo(${JSON.stringify(v).replace(/'/g, "&#39;")})'>
            <img src="${v.thumbnailUrl}" class="video-thumb" alt="${v.title}">
            <div class="play-overlay"><span class="material-symbols-rounded">play_arrow</span></div>
            <div class="badge-type">${v.sourceType}</div>
            <div class="badge-age">${v.ageRating}</div>
            <div class="duration-badge">${formatTime(v.duration || 180)}</div>
          </div>
          <div class="video-info">
            <div class="video-title" title="${v.title}">${v.title}</div>
            <div class="video-channel" style="cursor:pointer;" onclick='event.stopPropagation(); openChannelByVideoMeta(${JSON.stringify({ channelId: v.channelId, channelTitle: v.channelTitle }).replace(/'/g, "&#39;")})' title="View ${v.channelTitle} channel videos">
              <img src="${v.channelAvatar}" class="channel-pic">
              <span style="text-decoration:underline;">${v.channelTitle}</span>
              <span>•</span>
              <span>${v.views || 0} views</span>
            </div>
            <div class="video-tags">
              ${getVideoCategoriesByTags(v).map(c => `<span class="tag-chip" style="background:rgba(76,201,240,0.16); color:var(--accent);">${c}</span>`).join('')}
              ${(v.tags || []).slice(0, 3).map(t => `<span class="tag-chip">#${t}</span>`).join('')}
            </div>
            <div class="video-actions">
              <div style="font-size:0.8rem; color: ${v.isApproved ? 'var(--success)' : 'var(--warning)'}; display:flex; align-items:center; gap:0.25rem;">
                <span class="material-symbols-rounded" style="font-size:16px;">${v.isApproved ? 'check_circle' : 'hourglass_top'}</span>
                ${v.isApproved ? 'Approved' : 'Pending'}
              </div>
              <div style="display:flex; gap:0.5rem;">
                <button class="btn-icon" title="Toggle Featured" onclick="toggleFeatured('${v.id}', ${!v.isFeatured})">
                  <span class="material-symbols-rounded" style="color: ${v.isFeatured ? '#FFB703' : 'var(--text-muted)'};">star</span>
                </button>
                <button class="btn-icon delete" title="Delete" onclick="deleteVideo('${v.id}')">
                  <span class="material-symbols-rounded">delete</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      `).join('');
    }

    const STUDIO_CATEGORY_TAG_MAP = {
      'Cartoons & Fun': ['category:cartoons & fun', 'cartoons & fun', 'topic:animation-cartoons', 'topic:comedy-clean', 'cartoon', 'cartoons', 'animation', 'animated', 'comedy', 'funny', 'puppet', 'puppets', 'toons'],
      'Learning & ABCs': ['category:learning & abcs', 'learning & abcs', 'topic:abcs-phonics', 'topic:language-learning', 'abc', 'abcs', 'alphabet', 'phonics', 'letters', 'colors', 'shapes', 'preschool', 'spelling', 'vocabulary', 'counting', 'numbers'],
      'Music & Rhymes': ['category:music & rhymes', 'music & rhymes', 'topic:music-instruments', 'purpose:background-audio', 'music', 'rhyme', 'rhymes', 'nursery rhyme', 'nursery rhymes', 'song', 'songs', 'sing-along', 'singalong', 'lullaby', 'lullabies'],
      'Animals & Nature': ['category:animals & nature', 'animals & nature', 'topic:animals-nature', 'animal', 'animals', 'nature', 'wildlife', 'ocean', 'reef', 'marine', 'zoo', 'pets', 'pet', 'dino', 'dinosaur', 'dinosaurs', 'birds', 'insects', 'jungle', 'safari', 'bunny', 'puppy', 'kitten'],
      'Art & Crafts': ['category:art & crafts', 'art & crafts', 'topic:art-drawing', 'topic:crafts-diy', 'art', 'arts', 'craft', 'crafts', 'drawing', 'draw', 'painting', 'paint', 'origami', 'coloring', 'clay', 'illustration'],
      'Science & Space': ['category:science & space', 'science & space', 'topic:science', 'topic:space-astronomy', 'science', 'space', 'astronomy', 'planet', 'planets', 'rocket', 'rockets', 'nasa', 'physics', 'chemistry', 'biology', 'experiment', 'experiments', 'solar system', 'astronaut'],
      'Stories & Reading': ['category:stories & reading', 'stories & reading', 'topic:reading-books', 'purpose:story-narrative', 'story', 'stories', 'reading', 'read-aloud', 'book', 'books', 'fairytale', 'fairy tale', 'bedtime story', 'fable', 'storytelling'],
      'Math & Coding': ['category:math & coding', 'math & coding', 'topic:math-logic', 'topic:coding-tech', 'math', 'maths', 'counting', 'numbers', 'addition', 'subtraction', 'multiplication', 'geometry', 'logic', 'coding', 'programming', 'computer science', 'robotics', 'stem'],
      'Kids Yoga & Active': ['category:kids yoga & active', 'kids yoga & active', 'topic:physical-fitness', 'topic:mindfulness-breathing', 'context:movement-break', 'yoga', 'fitness', 'exercise', 'workout', 'stretching', 'mindfulness', 'breathing', 'dance', 'movement', 'active'],
      'World & Discovery': ['category:world & discovery', 'world & discovery', 'topic:history-geography', 'world', 'discovery', 'geography', 'history', 'countries', 'culture', 'cultures', 'earth', 'continents', 'travel', 'landmarks', 'civilization'],
      'Video Games & Gaming': ['category:video games & gaming', 'video games & gaming', 'topic:gaming-wholesome', 'gaming', 'video game', 'video games', 'minecraft'],
      'Hobbies & DIY': ['category:hobbies & diy', 'hobbies & diy', 'topic:crafts-diy', 'topic:engineering-robotics', 'hobby', 'hobbies', 'diy', 'maker', 'lego', 'building', 'engineering'],
      'Sports & Outdoors': ['category:sports & outdoors', 'sports & outdoors', 'topic:sports-outdoors', 'sport', 'sports', 'soccer', 'football', 'basketball', 'swimming', 'outdoors', 'camping', 'hiking'],
      'Cooking & Baking': ['category:cooking & baking', 'cooking & baking', 'topic:cooking-baking', 'cooking', 'baking', 'recipe', 'recipes', 'kitchen', 'chef', 'cupcakes']
    };

    function videoMatchesCategoryByTags(v, catName) {
      const target = String(catName || '').trim().toLowerCase();
      if (!target || target === 'all videos') return true;
      const tagSet = new Set((v?.tags || []).map(t => String(t).trim().toLowerCase()).filter(Boolean));
      if (v?.category && String(v.category).trim().toLowerCase() !== 'all videos') {
        tagSet.add(`category:${String(v.category).trim().toLowerCase()}`);
      }
      if (tagSet.has(`category:${target}`) || tagSet.has(target)) return true;
      const entry = Object.entries(STUDIO_CATEGORY_TAG_MAP).find(([name]) => name.toLowerCase() === target);
      return Boolean(entry && entry[1].some(alias => tagSet.has(alias)));
    }

    function getVideoCategoriesByTags(v) {
      if (Array.isArray(v?.categories) && v.categories.length) return v.categories;
      const matched = Object.keys(STUDIO_CATEGORY_TAG_MAP).filter(catName => videoMatchesCategoryByTags(v, catName));
      if (!matched.length && v?.category && v.category !== 'All Videos') return [v.category];
      return matched;
    }

    function renderFormCategoryTagPills() {
      const wrap = document.getElementById('formCategoryTagPills');
      const input = document.getElementById('formTags');
      if (!wrap || !input) return;
      const tagSet = new Set(input.value.split(',').map(t => t.trim().toLowerCase()).filter(Boolean));
      wrap.innerHTML = Object.keys(STUDIO_CATEGORY_TAG_MAP).map(catName => {
        const key = `category:${catName.toLowerCase()}`;
        const active = tagSet.has(key);
        return `<button type="button" onclick="toggleFormCategoryTag('${catName.replace(/'/g, "\\'")}')" style="cursor:pointer; font-size:0.72rem; padding:3px 8px; border-radius:99px; border:1px solid ${active ? 'var(--primary)' : 'var(--border)'}; background:${active ? 'rgba(255,51,102,0.16)' : 'var(--surface)'}; color:${active ? 'var(--primary)' : 'var(--text-muted)'}; font-weight:700;">${active ? '✓ ' : '+ '}${catName}</button>`;
      }).join('');
    }

    function toggleFormCategoryTag(catName) {
      const input = document.getElementById('formTags');
      if (!input) return;
      const key = `category:${catName.toLowerCase()}`;
      const list = input.value.split(',').map(t => t.trim()).filter(Boolean);
      const idx = list.findIndex(t => t.toLowerCase() === key);
      if (idx >= 0) {
        list.splice(idx, 1);
      } else {
        list.push(key);
      }
      input.value = list.join(', ');
      renderFormCategoryTagPills();
    }

    function filterVideos() {
      const q = document.getElementById('searchFilter').value.toLowerCase();
      const cat = document.getElementById('categoryFilter').value;
      const filtered = allVideos.filter(v => {
        const matchesQ = !q || v.title.toLowerCase().includes(q) || (v.tags || []).some(t => t.toLowerCase().includes(q));
        const matchesCat = !cat || videoMatchesCategoryByTags(v, cat);
        return matchesQ && matchesCat;
      });
      renderVideos(filtered);
    }

    async function inspectUrl() {
      const url = document.getElementById('videoUrlInput').value.trim();
      if (!url) return alert('Please enter a YouTube video URL or MP4/HLS stream link');

      const btn = document.getElementById('btnInspect');
      btn.innerHTML = '<span class="material-symbols-rounded">sync</span> Fetching...';
      btn.disabled = true;

      try {
        await loadChannels();
        const res = await authFetch('/api/admin/parse-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url })
        });
        const json = await res.json();
        if (json.success) {
          curVideoData = { ...json, sourceUrl: url };
          document.getElementById('formTitle').value = json.title || '';
          document.getElementById('formThumbPreview').src = json.thumbnailUrl;
          document.getElementById('formTags').value = 'kids, safe, fun';
          renderFormCategoryTagPills();
          document.getElementById('curationForm').style.display = 'grid';
        }
      } catch (err) {
        alert('Failed to inspect URL: ' + err.message);
      } finally {
        btn.innerHTML = '<span class="material-symbols-rounded">search_check</span> Fetch Metadata';
        btn.disabled = false;
      }
    }

    function cancelCuration() {
      document.getElementById('curationForm').style.display = 'none';
      document.getElementById('videoUrlInput').value = '';
      curVideoData = null;
    }

    async function saveCuratedVideo(e) {
      e.preventDefault();
      if (!curVideoData) return;

      const channelId = document.getElementById('formChannelSelect').value;
      const payload = {
        title: document.getElementById('formTitle').value,
        description: document.getElementById('formDesc').value,
        sourceUrl: curVideoData.sourceUrl,
        sourceType: curVideoData.sourceType,
        thumbnailUrl: curVideoData.thumbnailUrl,
        channelId,
        duration: Number(document.getElementById('formDuration').value) || 180,
        category: document.getElementById('formCategory').value,
        ageRating: document.getElementById('formAge').value,
        tags: document.getElementById('formTags').value.split(',').map(t => t.trim()),
        isApproved: true
      };

      const res = await authFetch('/api/admin/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.success) {
        cancelCuration();
        loadStats();
        loadVideos();
        loadChannels();
        alert('Video curated and added to channel!');
      } else {
        alert('Error saving video: ' + json.message);
      }
    }

    async function deleteVideo(id) {
      if (!confirm('Remove this video from FamiTube?')) return;
      const res = await authFetch('/api/admin/videos/' + id, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        loadStats();
        loadVideos();
      }
    }

    async function toggleFeatured(id, val) {
      await authFetch('/api/admin/videos/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFeatured: val })
      });
      loadVideos();
    }

    async function saveSettings() {
      const payload = {
        appName: document.getElementById('cfgAppName').value,
        welcomeMessage: document.getElementById('cfgWelcome').value,
        parentalDefaults: {
          defaultWatchLimitMinutes: Number(document.getElementById('cfgWatchLimit').value),
          enforcePin: true
        }
      };
      await authFetch('/api/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      alert('Settings updated successfully!');
    }

    function switchTab(name, btnEl) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btnEl.classList.add('active');

      document.getElementById('tabVideos').style.display = name === 'videos' ? 'block' : 'none';
      document.getElementById('tabChannels').style.display = name === 'channels' ? 'block' : 'none';
      document.getElementById('tabStories').style.display = name === 'stories' ? 'block' : 'none';
      document.getElementById('tabKids').style.display = name === 'kids' ? 'block' : 'none';
      document.getElementById('tabAdvisories').style.display = name === 'advisories' ? 'block' : 'none';
      document.getElementById('tabSettings').style.display = name === 'settings' ? 'block' : 'none';

      if (name === 'channels') { loadChannels(); toggleLiveTimelineBuilder(); }
      if (name === 'stories') { loadAdminStories(); }
      if (name === 'kids') { loadParentChildren(); loadParentVideoRequests(); }
      if (name === 'advisories') loadParentAdvisoryLists();
      if (name === 'settings') loadSettings();
    }

    let activeModalVideo = null;
    const kidVideoById = new Map();

    function openPlayer(videoId) {
      const video = kidVideoById.get(videoId) || (kidsFeedVideos || []).find(v => v.id === videoId);
      if (video) {
        previewVideo(video);
      }
    }

    function previewVideo(video) {
      if (currentUser?.role === 'CHILD') {
        if (isWebQuietHoursActive()) {
          showKidTimeUpOverlay('QUIET');
          return;
        }
        if (isWebEpisodeLimitReached()) {
          showKidTimeUpOverlay('EPISODE');
          return;
        }
        if (isKidTimeUp()) {
          showKidTimeUpOverlay('TIME');
          return;
        }
      }
      if (video && video.id) {
        kidVideoById.set(video.id, video);
      }
      activeModalVideo = video;
      document.getElementById('modalTitle').textContent = video.title;
      document.getElementById('modalDesc').textContent = video.description || 'No description provided.';
      const container = document.getElementById('playerContainer');

      if (video.sourceType === 'YOUTUBE' && video.youtubeVideoId) {
        container.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${video.youtubeVideoId}?autoplay=1" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
      } else {
        container.innerHTML = `<video id="webDirectVideoEl" src="${video.sourceUrl}" controls autoplay style="width:100%; height:100%;"></video>`;
        const vidEl = document.getElementById('webDirectVideoEl');
        if (vidEl && currentUser?.role === 'CHILD') {
          vidEl.onended = () => {
            webSessionEpisodesWatched += 1;
            if (isWebEpisodeLimitReached()) {
              closePlayerModal();
              showKidTimeUpOverlay('EPISODE');
            }
          };
        }
      }

      if (authToken && currentUser) {
        recordKidHistoryItem(video);
        populateModalPlaylistBar();
      } else {
        const bar = document.getElementById('modalPlaylistBar');
        if (bar) bar.style.display = 'none';
      }
      if (currentUser?.role === 'CHILD') {
        startKidWatchTimer();
      }
      loadModalParentReviews(video);

      document.getElementById('playerModal').style.display = 'flex';
    }

    function closePlayerModal() {
      if (webToddlerPhaseTimer) { clearTimeout(webToddlerPhaseTimer); webToddlerPhaseTimer = null; }
      if (webToddlerTickTimer) { clearInterval(webToddlerTickTimer); webToddlerTickTimer = null; }
      if (webToddlerActiveTopic) {
        const st = readWebToddlerLocalState();
        if (st.playheads?.[webToddlerActiveTopic]) {
          st.playheads[webToddlerActiveTopic].lastLeftAt = Date.now();
          st.sessionWatchedSec = webToddlerSessionWatchedSec;
          writeWebToddlerLocalState(st);
        }
        webToddlerActiveTopic = null;
      }
      stopKidWatchTimer();
      document.getElementById('playerContainer').innerHTML = '';
      document.getElementById('playerModal').style.display = 'none';
    }

    function tuneWebToddlerChannel(topic) {
      if (getWebToddlerCooldownUntilMs() > Date.now()) {
        alert('Shhh... Toddler TV is napping! Time for offline playtime.');
        return;
      }
      const ch = (webToddlerTvData?.channels || []).find(c => c.topic === topic);
      if (!ch || !ch.videos?.length) {
        alert('No calm videos available on this channel yet.');
        return;
      }
      if (webToddlerPhaseTimer) clearTimeout(webToddlerPhaseTimer);
      if (webToddlerTickTimer) clearInterval(webToddlerTickTimer);

      const st = readWebToddlerLocalState();
      webToddlerSessionWatchedSec = st.sessionWatchedSec || 0;
      const ph = st.playheads?.[topic] || { index: 0, elapsedSec: 0, lastLeftAt: 0 };
      if (ph.lastLeftAt && (Date.now() - ph.lastLeftAt) > 180000) {
        ph.index = (ph.index + 1) % ch.videos.length;
        ph.elapsedSec = 0;
      }
      ph.lastLeftAt = 0;
      st.playheads = st.playheads || {};
      st.playheads[topic] = ph;
      writeWebToddlerLocalState(st);

      webToddlerActiveTopic = topic;
      const modal = document.getElementById('playerModal');
      const container = document.getElementById('playerContainer');
      document.getElementById('modalTitle').textContent = `${ch.emoji} ${ch.displayTitle} • Linear Toddler TV`;
      document.getElementById('modalDesc').textContent = 'Tuning in...';
      const bar = document.getElementById('modalPlaylistBar');
      if (bar) bar.style.display = 'none';
      const revBar = document.getElementById('modalParentReviewBar');
      if (revBar) revBar.style.display = 'none';

      container.innerHTML = `<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; background:linear-gradient(135deg, #1e293b, #0f172a); color:#fff; text-align:center; padding:1.5rem;"><div style="font-size:3rem; margin-bottom:0.5rem;">${ch.emoji}</div><div style="font-family:'Fredoka',cursive; font-size:1.4rem;">Tuning in to ${ch.displayTitle}...</div></div>`;
      modal.style.display = 'flex';

      webToddlerPhaseTimer = setTimeout(() => {
        playWebToddlerSlot(ch, ph);
      }, 2200);
    }

    function playWebToddlerSlot(ch, ph) {
      if (!webToddlerActiveTopic) return;
      const vid = ch.videos[ph.index % ch.videos.length];
      if (!vid) return;
      const container = document.getElementById('playerContainer');
      const loopMins = webToddlerTvData?.settings?.toddlerLoopMinutes || 15;
      const loopBudgetSec = loopMins * 60;
      const startSec = Math.max(0, Math.floor(ph.elapsedSec || 0));

      document.getElementById('modalTitle').textContent = `${ch.emoji} ${ch.displayTitle} — ${vid.title}`;
      document.getElementById('modalDesc').textContent = `${startSec > 0 ? 'Resuming where you left off' : 'Playing from start'} • No skipping`;

      if (vid.sourceType === 'YOUTUBE' && vid.youtubeVideoId) {
        container.innerHTML = `
          <div style="position:relative; width:100%; height:100%;">
            <iframe src="https://www.youtube-nocookie.com/embed/${vid.youtubeVideoId}?autoplay=1&controls=0&disablekb=1&rel=0&modestbranding=1&iv_load_policy=3&start=${startSec}" allow="accelerometer; autoplay; encrypted-media" style="width:100%; height:100%; border:0;"></iframe>
            <div style="position:absolute; inset:0; z-index:5; background:transparent;"></div>
          </div>`;
      } else {
        container.innerHTML = `<video src="${vid.sourceUrl}" autoplay playsinline style="width:100%; height:100%; pointer-events:none;"></video>`;
      }
      if (authToken && currentUser) recordKidHistoryItem(vid);

      const dur = Math.max(30, vid.duration || 180);
      clearInterval(webToddlerTickTimer);
      webToddlerTickTimer = setInterval(async () => {
        if (!webToddlerActiveTopic) { clearInterval(webToddlerTickTimer); return; }
        ph.elapsedSec = (ph.elapsedSec || 0) + 1;
        webToddlerSessionWatchedSec += 1;
        const st = readWebToddlerLocalState();
        st.playheads[ch.topic] = ph;
        st.sessionWatchedSec = webToddlerSessionWatchedSec;
        writeWebToddlerLocalState(st);

        if (ph.elapsedSec >= dur) {
          clearInterval(webToddlerTickTimer);
          if (webToddlerSessionWatchedSec >= loopBudgetSec) {
            container.innerHTML = `<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; background:#0f172a; color:#fff; text-align:center; padding:1.5rem;"><div style="font-size:3rem; margin-bottom:0.5rem;">🌙 😴</div><div style="font-family:'Fredoka',cursive; font-size:1.35rem;">Bye-Bye! Time for Playtime</div><div style="color:#94a3b8; font-size:0.9rem; margin-top:0.35rem;">${ch.displayTitle} is going to take a nap now.</div></div>`;
            try {
              const res = await authFetch('/api/kids/toddler-tv/cooldown', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'START' })
              });
              const j = await res.json();
              const cdUntil = j?.data?.cooldownUntil ? Date.parse(j.data.cooldownUntil) : (Date.now() + 30 * 60000);
              const nextSt = readWebToddlerLocalState();
              nextSt.cooldownUntil = cdUntil;
              nextSt.sessionWatchedSec = 0;
              writeWebToddlerLocalState(nextSt);
              if (webToddlerTvData) webToddlerTvData.cooldownUntil = new Date(cdUntil).toISOString();
            } catch {}
            webToddlerPhaseTimer = setTimeout(() => {
              closePlayerModal();
              if (currentUser) renderKidHomeHub(currentUser);
            }, 5000);
          } else {
            const rem = loopBudgetSec - webToddlerSessionWatchedSec;
            if (rem <= 240) {
              const calmIdx = ch.videos.findIndex((x, i) => i !== ph.index && (x.tags || []).some(t => ['pacing:calm', 'context:bedtime-safe'].includes(t.toLowerCase())));
              ph.index = calmIdx >= 0 ? calmIdx : (ph.index + 1) % ch.videos.length;
            } else {
              ph.index = (ph.index + 1) % ch.videos.length;
            }
            ph.elapsedSec = 0;
            container.innerHTML = `<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; background:#0f172a; color:#fff; text-align:center; padding:1.5rem;"><div style="font-size:3rem; margin-bottom:0.5rem;">${ch.emoji}</div><div style="font-family:'Fredoka',cursive; font-size:1.35rem;">Take a Slow Breath...</div><div style="color:#94a3b8; font-size:0.9rem; margin-top:0.35rem;">Next story starting cleanly</div></div>`;
            webToddlerPhaseTimer = setTimeout(() => playWebToddlerSlot(ch, ph), 3200);
          }
        }
      }, 1000);
    }

    let showcaseChannels = [];
    let activeShowcaseChannelId = null;

    
    async function loadParentChildren() {
      const res = await authFetch('/api/parent/children');
      const json = await res.json();
      const el = document.getElementById('childrenList');
      if (!json.success || !json.data.length) {
        el.innerHTML = '<div style="color:var(--text-muted); padding:1rem; background:var(--surface); border-radius:var(--radius-sm); border:1px solid var(--border);">No child accounts registered yet.</div>';
        return;
      }
      el.innerHTML = json.data.map(c => `
        <div class="schedule-item" style="flex-direction:column; align-items:stretch; gap:0.75rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem;">
            <div>
              <div style="font-weight:700; font-size:0.95rem;">${c.name} <span style="font-weight:400; color:var(--text-muted); font-size:0.82rem;">(${formatChildEmailSubtitle(c.email)})</span></div>
              <div style="font-size:0.78rem; color:var(--text-muted); margin-top:0.2rem;">
                ${c.birthday ? `Birthday: <strong>${c.birthday}</strong> • ` : ''}Age Group:
                <select onchange="updateChildAgeRating('${c.id}', this.value)" style="margin-left:0.35rem; padding:2px 6px; border-radius:4px; border:1px solid var(--border);">
                  <option value="ALL" ${c.ageRating === 'ALL' ? 'selected' : ''}>All Ages</option>
                  <option value="TODDLER" ${c.ageRating === 'TODDLER' ? 'selected' : ''}>Tier 1: Toddler TV (1.5–3)</option>
                  <option value="YOUNG_KIDS" ${c.ageRating === 'YOUNG_KIDS' ? 'selected' : ''}>Tier 2: Young Kids (4–6)</option>
                  <option value="OLDER_KIDS" ${c.ageRating === 'OLDER_KIDS' ? 'selected' : ''}>Tier 3: Older Kids (7+)</option>
                </select>
              </div>
            </div>
            <div style="display:flex; gap:0.4rem; flex-wrap:wrap;">
              <button type="button" class="btn btn-primary btn-sm" onclick="switchToChildMode('${c.id}')">▶ Watch</button>
              <button type="button" class="btn btn-secondary btn-sm" onclick="openChildPairCodeModal('${c.id}', '${String(c.name || '').replace(/'/g, "\\'")}')">📱 Pair Device</button>
              <button class="btn btn-secondary btn-sm" onclick="deleteChildAccount('${c.id}')">Remove Child</button>
            </div>
          </div>
          <div style="padding:0.75rem 0.9rem; border-radius:var(--radius-sm); background:var(--surface); border:1px solid var(--border); display:flex; flex-wrap:wrap; gap:0.85rem; align-items:center; justify-content:space-between;">
            <div style="display:flex; flex-wrap:wrap; gap:0.9rem; align-items:center; font-size:0.82rem;">
              <label style="display:inline-flex; align-items:center; gap:0.4rem; font-weight:600; cursor:pointer;">
                <input type="checkbox" id="childSearchEnabled_${c.id}" ${c.youtubeSearchEnabled ? 'checked' : ''}>
                Enable YouTube Search
              </label>
              <label style="display:inline-flex; align-items:center; gap:0.4rem;">
                Max Searched Videos (0 = unlimited):
                <input type="number" min="0" id="childSearchLimit_${c.id}" value="${c.searchViewLimit ?? 0}" style="width:68px; padding:0.25rem 0.45rem; border-radius:4px; border:1px solid var(--border); background:var(--bg); color:var(--text);">
              </label>
              <span style="color:var(--accent); font-weight:600;">Used: ${c.searchViewsUsed ?? 0}</span>
              <label style="display:inline-flex; align-items:center; gap:0.4rem; font-weight:600; cursor:pointer;">
                <input type="checkbox" id="childSearchApproval_${c.id}" ${c.searchRequireApproval !== false ? 'checked' : ''}>
                Require Parent Approval
              </label>
            </div>
            <div style="display:flex; gap:0.45rem;">
              <button type="button" class="btn btn-secondary btn-sm" onclick="resetChildSearchViews('${c.id}')">Reset Count</button>
              <button type="button" class="btn btn-primary btn-sm" onclick="saveChildSearchSettings('${c.id}')">Save Override</button>
            </div>
          </div>
          <div style="padding:0.75rem 0.9rem; border-radius:var(--radius-sm); background:var(--surface); border:1px solid var(--border); display:flex; flex-wrap:wrap; gap:0.85rem; align-items:center; justify-content:space-between;">
            <div style="display:flex; flex-wrap:wrap; gap:0.85rem; align-items:center; font-size:0.82rem;">
              <span style="font-weight:700; color:${Object.keys(c.overrides || {}).length ? 'var(--primary)' : 'var(--accent)'};">
                ${Object.keys(c.overrides || {}).length ? 'Custom Override Active' : 'Using Global Controls'}
              </span>
              <label style="display:inline-flex; align-items:center; gap:0.35rem;">
                Daily Limit (min):
                <input type="number" min="0" max="720" id="childDailyLimit_${c.id}" value="${c.dailyLimitMinutes ?? 45}" style="width:68px; padding:0.25rem 0.45rem; border-radius:4px; border:1px solid var(--border); background:var(--bg); color:var(--text);">
              </label>
              <label style="display:inline-flex; align-items:center; gap:0.35rem;">
                PIN:
                <input type="text" maxlength="4" id="childPin_${c.id}" value="${c.parentPin || '1234'}" style="width:60px; padding:0.25rem 0.45rem; border-radius:4px; border:1px solid var(--border); background:var(--bg); color:var(--text);">
              </label>
            </div>
            <div style="display:flex; gap:0.45rem;">
              <button type="button" class="btn btn-secondary btn-sm" onclick="resetChildOverrides('${c.id}')">Use Global</button>
              <button type="button" class="btn btn-primary btn-sm" onclick="saveChildOverrides('${c.id}')">Save Kid Override</button>
            </div>
          </div>
        </div>
      `).join('');
    }

    async function saveChildOverrides(childId) {
      const payload = {
        dailyLimitMinutes: Number(document.getElementById(`childDailyLimit_${childId}`).value),
        parentPin: document.getElementById(`childPin_${childId}`).value.trim()
      };
      const res = await authFetch(`/api/parent/children/${childId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!json.success) return alert(json.message || 'Failed to save kid override');
      await loadParentChildren();
    }

    async function resetChildOverrides(childId) {
      const res = await authFetch(`/api/parent/children/${childId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          overrides: {
            parentPin: null,
            dailyLimitMinutes: null,
            ageRating: null,
            attentionTrackingEnabled: null,
            attentionPauseSeconds: null,
            attentionMinWatchPercent: null,
            youtubeSearchEnabled: null,
            searchViewLimit: null,
            searchRequireApproval: null
          }
        })
      });
      const json = await res.json();
      if (!json.success) return alert(json.message || 'Failed to reset to global');
      await loadParentChildren();
    }

    let parentModeChildrenCache = [];
    let activeChildProfileId = null;
    let parentPreviewChild = null;

    function openParentMode() {
      if (!authToken || currentUser?.role !== 'PARENT') {
        showAuthGate('PARENT');
        return;
      }
      parentPreviewChild = null;
      const previewBanner = document.getElementById('parentPreviewBanner');
      if (previewBanner) previewBanner.style.display = 'none';
      setModeButtons('parent');
      document.getElementById('linkChannelsJson').style.display = 'none';
      document.getElementById('showcaseApp').style.display = 'none';
      document.getElementById('channelsSearchApp').style.display = 'none';
      const chanPageParent = document.getElementById('channelDetailPage');
      if (chanPageParent) chanPageParent.style.display = 'none';
      document.getElementById('authGate').style.display = 'none';
      document.getElementById('studioApp').style.display = 'none';
      document.getElementById('parentModeApp').style.display = 'block';
      closeChildProfile();
      loadParentModeWeeklyInsights();
      loadParentModeChildren();
      loadParentModeGlobalControls();
      loadParentReferralsAndVouchers();
    }

    async function previewPmQuickShare() {
      const input = document.getElementById('pmQuickShareInput');
      const box = document.getElementById('pmQuickSharePreview');
      const sharedText = String(input?.value || '').trim();
      if (!sharedText) {
        if (box) { box.style.display = 'block'; box.textContent = 'Paste a YouTube video link, Shorts URL, or @handle first.'; }
        return;
      }
      if (box) { box.style.display = 'block'; box.textContent = 'Fetching preview...'; }
      try {
        const res = await authFetch('/api/parent/youtube-share-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sharedText })
        });
        const json = await res.json();
        if (!json.success || !json.data) {
          if (box) box.textContent = json.message || 'Could not recognize link.';
          return;
        }
        const d = json.data;
        if (box) {
          box.innerHTML = d.kind === 'CHANNEL'
            ? `<strong>Channel Ready:</strong> ${d.handle} (will be added as <strong>Trusted</strong>)`
            : `<div style="display:flex; align-items:center; gap:0.75rem;"><img src="${d.thumbnailUrl}" style="width:88px; height:50px; object-fit:cover; border-radius:6px;"><div><strong>${d.title}</strong><div style="color:var(--text-muted); font-size:0.78rem;">${d.channelTitle}</div></div></div>`;
        }
      } catch {
        if (box) box.textContent = 'Network error while previewing link.';
      }
    }

    async function approvePmQuickShare() {
      const input = document.getElementById('pmQuickShareInput');
      const box = document.getElementById('pmQuickSharePreview');
      const sharedText = String(input?.value || '').trim();
      if (!sharedText) return alert('Paste a YouTube video link or @handle first.');
      try {
        const res = await authFetch('/api/parent/quick-approve-youtube', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sharedText, trustLevel: 'TRUSTED' })
        });
        const json = await res.json();
        if (!json.success) return alert(json.message || 'Could not approve link');
        if (input) input.value = '';
        if (box) {
          box.style.display = 'block';
          box.innerHTML = `<span style="color:var(--success); font-weight:700;">Approved "${json.data.title}" for ${(json.data.approvedChildNames || []).join(', ')}!</span>`;
        }
      } catch {
        alert('Failed to approve shared link.');
      }
    }

    async function loadParentModeWeeklyInsights() {
      const el = document.getElementById('parentWeeklyInsightsSection');
      if (!el) return;
      try {
        const res = await authFetch('/api/parent/weekly-insights');
        const json = await res.json();
        if (!json.success || !json.data) return;
        const d = json.data;
        const rows = (d.children || []).map(ch => {
          const topics = (ch.topTopics || []).map(t => `${t.topic} (${t.percent}%)`).join(' • ') || 'No watch activity yet';
          return `<div style="font-size:0.84rem; padding:0.45rem 0; border-bottom:1px solid var(--border);"><strong>${ch.childName}</strong> (${ch.videosWatched7d} watched, ${ch.approvedRequests7d} approved): <span style="color:var(--text-muted);">${topics}</span></div>`;
        }).join('');
        el.innerHTML = `
          <div class="channel-creator-box">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:0.5rem;">
              <h3 style="font-family:'Fredoka',cursive; font-size:1.15rem; margin:0; display:flex; align-items:center; gap:0.45rem;">
                <span class="material-symbols-rounded" style="color:var(--secondary);">insights</span>
                Weekly Family Insights (Past 7 Days)
              </h3>
              <span style="font-size:0.8rem; font-weight:700; color:var(--secondary);">${d.summary?.totalVideosWatched7d || 0} videos watched</span>
            </div>
            ${rows || '<div style="font-size:0.84rem; color:var(--text-muted);">No child activity recorded this week yet.</div>'}
            ${!d.allowWeeklyInsights ? '<div style="font-size:0.78rem; color:var(--primary); margin-top:0.5rem;">Showing top topic per child (Free). Family Pass unlocks full multi-topic &amp; channel breakdowns.</div>' : ''}
          </div>
        `;
      } catch {}
    }

    function toggleParentAddChildForm(forceState) {
      const box = document.getElementById('parentAddChildBox');
      if (!box) return;
      const shouldShow = typeof forceState === 'boolean' ? forceState : box.style.display === 'none';
      box.style.display = shouldShow ? 'block' : 'none';
    }

    function deriveAgeRatingFromBirthdayInput(birthdayStr) {
      if (!birthdayStr) return null;
      const parts = birthdayStr.split('-').map(Number);
      if (parts.length !== 3) return null;
      const [y, m, d] = parts;
      const now = new Date();
      let age = now.getFullYear() - y;
      const monthDiff = (now.getMonth() + 1) - m;
      if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < d)) age--;
      if (age <= 3) return 'TODDLER';
      if (age <= 6) return 'YOUNG_KIDS';
      return 'OLDER_KIDS';
    }

    function onChildBirthdayChange(birthdayStr) {
      const derived = deriveAgeRatingFromBirthdayInput(birthdayStr);
      const sel = document.getElementById('childAgeRatingInput');
      if (derived && sel) sel.value = derived;
    }

    function onPmChildBirthdayChange(birthdayStr) {
      const derived = deriveAgeRatingFromBirthdayInput(birthdayStr);
      const sel = document.getElementById('pmChildAgeRatingInput');
      if (derived && sel) sel.value = derived;
    }

    function formatAgeGroupLabel(ageRating) {
      switch (ageRating) {
        case 'TODDLER': return 'Tier 1: Toddler TV (1.5–3)';
        case 'YOUNG_KIDS': return 'Tier 2: Young Kids (4–6)';
        case 'OLDER_KIDS': return 'Tier 3: Older Kids (7+)';
        default: return 'All Ages';
      }
    }

    const WEB_TODDLER_TV_CHANNELS = [
      { topic: 'Music & Rhymes', displayTitle: 'Songs & Rhymes', emoji: '🎵' },
      { topic: 'Animals & Nature', displayTitle: 'Cute Animals', emoji: '🐶' },
      { topic: 'Learning & ABCs', displayTitle: 'ABCs & Colors', emoji: '🔤' },
      { topic: 'Art & Crafts', displayTitle: 'Colors & Play', emoji: '🎨' },
      { topic: 'Kids Yoga & Active', displayTitle: 'Sing & Dance', emoji: '🤸' },
      { topic: 'Stories & Reading', displayTitle: 'Bedtime Stories', emoji: '📖' },
      { topic: 'Cartoons & Fun', displayTitle: 'Gentle Toons', emoji: '🧸' }
    ];

    async function loadParentModeGlobalControls() {
      const box = document.getElementById('pmGlobalControlsContainer');
      if (!box) return;
      try {
        const res = await authFetch('/api/parent/controls');
        const json = await res.json();
        if (!json.success || !json.data) return;
        const c = json.data;
        box.innerHTML = `
          <div class="channel-creator-box">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem; margin-bottom:0.85rem;">
              <div>
                <h3 style="font-family:'Fredoka',cursive; font-size:1.2rem; margin:0;">Global Family Controls</h3>
                <p style="font-size:0.82rem; color:var(--text-muted); margin:0.2rem 0 0;">Common defaults shared across all age groups (PIN, language, culture, and screen safety).</p>
              </div>
              <button type="button" class="btn btn-primary btn-sm" onclick="saveParentModeGlobalControls()">Save Global Controls</button>
            </div>
            <div class="form-row-3" style="margin-bottom:0.75rem;">
              <div class="form-group">
                <label>Global Parent PIN (4 digits)</label>
                <input type="text" maxlength="4" id="pmGlobalPin" value="${c.parentPin || '1234'}">
              </div>
              <div class="form-group">
                <label>Family Language</label>
                <select id="pmGlobalLang">
                  <option value="all" ${(c.contentLanguage || 'all') === 'all' ? 'selected' : ''}>All Languages (Default)</option>
                  <option value="en" ${c.contentLanguage === 'en' ? 'selected' : ''}>English</option>
                  <option value="id" ${c.contentLanguage === 'id' ? 'selected' : ''}>Indonesian</option>
                  <option value="bilingual" ${c.contentLanguage === 'bilingual' ? 'selected' : ''}>Bilingual (EN + ID)</option>
                </select>
              </div>
              <div class="form-group">
                <label>Culture Focus</label>
                <select id="pmGlobalCulture">
                  <option value="GLOBAL" ${(c.cultureMode || 'GLOBAL') === 'GLOBAL' ? 'selected' : ''}>Global / Cross-Cultural</option>
                  <option value="ID" ${c.cultureMode === 'ID' ? 'selected' : ''}>Indonesia / Nusantara</option>
                </select>
              </div>
            </div>
            <div class="form-row-3" style="align-items:center;">
              <div class="form-group">
                <label>Global Daily Limit (minutes, 0 = unlimited)</label>
                <input type="number" min="0" max="720" id="pmGlobalDailyLimit" value="${c.dailyLimitMinutes ?? 45}">
              </div>
              <div class="form-group">
                <label style="display:flex; align-items:center; gap:0.45rem; cursor:pointer;">
                  <input type="checkbox" id="pmGlobalQuietEnabled" ${c.quietHoursEnabled ? 'checked' : ''}>
                  Scheduled Quiet Hours
                </label>
                <div style="display:flex; gap:0.4rem; margin-top:0.35rem;">
                  <input type="time" id="pmGlobalQuietStart" value="${c.quietHoursStart || '20:00'}" style="flex:1;">
                  <input type="time" id="pmGlobalQuietEnd" value="${c.quietHoursEnd || '07:00'}" style="flex:1;">
                </div>
              </div>
              <div class="form-group">
                <label>Stop After N Videos (Per Session)</label>
                <select id="pmGlobalEpisodeLimit">
                  <option value="0" ${!(c.episodeLimitPerSession > 0) ? 'selected' : ''}>Off (No auto-stop)</option>
                  <option value="1" ${c.episodeLimitPerSession === 1 ? 'selected' : ''}>1 video</option>
                  <option value="2" ${c.episodeLimitPerSession === 2 ? 'selected' : ''}>2 videos</option>
                  <option value="3" ${c.episodeLimitPerSession === 3 ? 'selected' : ''}>3 videos</option>
                  <option value="5" ${c.episodeLimitPerSession === 5 ? 'selected' : ''}>5 videos</option>
                </select>
              </div>
            </div>
          </div>
        `;
      } catch {}
    }

    async function saveParentModeGlobalControls() {
      const parentPin = String(document.getElementById('pmGlobalPin')?.value || '').trim();
      if (!/^\d{4}$/.test(parentPin)) return alert('Parent PIN must be exactly 4 digits.');
      const payload = {
        parentPin,
        contentLanguage: document.getElementById('pmGlobalLang')?.value || 'all',
        cultureMode: document.getElementById('pmGlobalCulture')?.value || 'GLOBAL',
        dailyLimitMinutes: Number(document.getElementById('pmGlobalDailyLimit')?.value || 45),
        quietHoursEnabled: Boolean(document.getElementById('pmGlobalQuietEnabled')?.checked),
        quietHoursStart: document.getElementById('pmGlobalQuietStart')?.value || '20:00',
        quietHoursEnd: document.getElementById('pmGlobalQuietEnd')?.value || '07:00',
        episodeLimitPerSession: Number(document.getElementById('pmGlobalEpisodeLimit')?.value || 0)
      };
      const res = await authFetch('/api/parent/controls', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!json.success) return alert(json.message || 'Failed to save global controls');
      await loadParentModeChildren();
      alert('Global family controls saved!');
    }

    async function loadParentModeChildren() {
      const res = await authFetch('/api/parent/children');
      const json = await res.json();
      const grid = document.getElementById('parentModeChildrenGrid');
      if (!grid) return;
      if (!json.success || !json.data.length) {
        parentModeChildrenCache = [];
        grid.innerHTML = '<div style="grid-column:1/-1; color:var(--text-muted); padding:1.5rem; background:var(--surface); border-radius:var(--radius-sm); border:1px solid var(--border);">No children registered yet. Click <strong>Add Child</strong> above to get started.</div>';
        return;
      }
      parentModeChildrenCache = json.data;
      grid.innerHTML = json.data.map(c => `
        <div onclick="openChildProfile('${c.id}')" style="cursor:pointer; background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:1.15rem; display:flex; flex-direction:column; gap:0.75rem; transition:transform 0.15s ease, border-color 0.15s ease;" onmouseover="this.style.borderColor='var(--primary)'; this.style.transform='translateY(-2px)'" onmouseout="this.style.borderColor='var(--border)'; this.style.transform='none'">
          <div style="display:flex; align-items:center; gap:0.85rem;">
            <div style="width:48px; height:48px; border-radius:50%; background:linear-gradient(135deg, var(--primary), var(--secondary)); color:white; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:1.15rem; flex-shrink:0;">
              ${getUserInitials(c.name || c.email)}
            </div>
            <div style="min-width:0;">
              <div style="font-weight:800; font-size:1.05rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${c.name}</div>
              <div style="font-size:0.8rem; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${formatChildEmailSubtitle(c.email)}</div>
            </div>
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:0.4rem; align-items:center;">
            <span style="font-size:0.76rem; font-weight:700; padding:0.25rem 0.6rem; border-radius:99px; background:rgba(67,97,238,0.12); color:var(--secondary);">${formatAgeGroupLabel(c.ageRating)}</span>
            ${c.birthday ? `<span style="font-size:0.76rem; color:var(--text-muted);">🎂 ${c.birthday}</span>` : ''}
          </div>
          <div style="display:flex; gap:0.45rem; flex-wrap:wrap; align-items:center; justify-content:space-between; margin-top:auto;">
            <span style="font-size:0.8rem; font-weight:700; color:var(--primary); display:flex; align-items:center; gap:0.25rem;">
              Configure <span class="material-symbols-rounded" style="font-size:1rem;">chevron_right</span>
            </span>
            <div style="display:flex; gap:0.4rem;">
              <button type="button" class="btn btn-primary btn-sm" style="padding:0.28rem 0.65rem; font-size:0.75rem;" onclick="event.stopPropagation(); switchToChildMode('${c.id}')">▶ Watch</button>
              <button type="button" class="btn btn-secondary btn-sm" style="padding:0.28rem 0.65rem; font-size:0.75rem;" onclick="event.stopPropagation(); openChildPairCodeModal('${c.id}', '${String(c.name || '').replace(/'/g, "\\'")}')">📱 Pair</button>
            </div>
          </div>
        </div>
      `).join('');

      if (activeChildProfileId) {
        const stillExists = parentModeChildrenCache.find(x => x.id === activeChildProfileId);
        if (stillExists) renderChildProfile(stillExists);
        else closeChildProfile();
      }
    }

    async function loadParentReferralsAndVouchers() {
      const container = document.getElementById('parentReferralsSection');
      if (!container) return;
      try {
        const res = await authFetch('/api/parent/referrals');
        const json = await res.json();
        if (!json.success || !json.data) return;
        const { referralCode, referredUsers = [], vouchers = [] } = json.data;
        container.innerHTML = `
          <div class="channel-creator-box" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:1.25rem;">
            <div>
              <h3 style="font-family:'Fredoka',cursive; font-size:1.15rem; margin:0 0 0.35rem 0;">Your Referral Code</h3>
              <p style="font-size:0.84rem; color:var(--text-muted); margin:0 0 0.75rem 0;">Share this code with other parents so they receive a 3-month Family Pass voucher (no expiration).</p>
              <div style="display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap; margin-bottom:0.75rem;">
                <code style="font-size:1.05rem; font-weight:800; padding:0.45rem 0.85rem; border-radius:var(--radius-sm); background:var(--surface-light); border:1px solid var(--border); letter-spacing:0.06em;">${referralCode}</code>
                <button type="button" class="btn btn-secondary btn-sm" onclick="navigator.clipboard?.writeText('${referralCode}'); alert('Referral code copied!');">Copy</button>
              </div>
              <div style="font-size:0.82rem; color:var(--text-muted);">
                <strong>${referredUsers.length}</strong> parent${referredUsers.length === 1 ? '' : 's'} registered with your code
                ${referredUsers.length ? `<ul style="margin:0.35rem 0 0 1rem; padding:0;">${referredUsers.slice(0, 5).map(u => `<li>${u.name} (${u.email})</li>`).join('')}</ul>` : ''}
              </div>
            </div>
            <div>
              <h3 style="font-family:'Fredoka',cursive; font-size:1.15rem; margin:0 0 0.35rem 0;">Family Pass Vouchers</h3>
              <p style="font-size:0.84rem; color:var(--text-muted); margin:0 0 0.75rem 0;">Referral vouchers never expire — activate whenever you're ready.</p>
              ${!vouchers.length
                ? '<div style="font-size:0.84rem; color:var(--text-muted);">No vouchers yet.</div>'
                : vouchers.map(v => `
                  <div style="padding:0.75rem; border-radius:var(--radius-sm); background:var(--surface); border:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; gap:0.75rem; flex-wrap:wrap; margin-bottom:0.5rem;">
                    <div>
                      <div style="font-weight:700; font-size:0.9rem;">${v.durationMonths}-Month Family Pass</div>
                      <div style="font-size:0.76rem; color:var(--text-muted);">Code: ${v.code} • No expiration</div>
                    </div>
                    ${v.status === 'AVAILABLE'
                      ? `<button type="button" class="btn btn-primary btn-sm" onclick="redeemFamilyPassVoucher('${v.id}')">Activate Now</button>`
                      : `<span style="font-size:0.78rem; font-weight:700; color:var(--success);">Redeemed</span>`
                    }
                  </div>
                `).join('')
              }
            </div>
          </div>
        `;
      } catch {
        // Ignore transient failure
      }
    }

    async function redeemFamilyPassVoucher(voucherId) {
      const res = await authFetch(`/api/parent/vouchers/${voucherId}/redeem`, { method: 'POST' });
      const json = await res.json();
      if (!json.success) return alert(json.message || 'Could not redeem voucher');
      if (currentUser && json.data) {
        currentUser.plan = json.data.plan;
        currentUser.planExpiresAt = json.data.planExpiresAt;
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(currentUser));
      }
      await loadParentReferralsAndVouchers();
      alert(json.message || '3-Month Family Pass activated!');
    }

    function openChildProfile(childId) {
      const child = parentModeChildrenCache.find(c => c.id === childId);
      if (!child) return;
      activeChildProfileId = childId;
      document.getElementById('parentChildrenListView').style.display = 'none';
      document.getElementById('childProfileView').style.display = 'block';
      renderChildProfile(child);
    }

    async function switchToChildMode(childId) {
      if (!authToken || currentUser?.role !== 'PARENT') return;
      try {
        const res = await authFetch(`/api/parent/children/${childId}/switch-session`, {
          method: 'POST'
        });
        const contentType = res.headers.get('content-type') || '';
        const json = contentType.includes('application/json') ? await res.json() : null;
        if (!res.ok || !json?.success || !json?.token || !json?.user) {
          return alert(json?.message || `Unable to switch to child mode (HTTP ${res.status}).`);
        }
        localStorage.setItem('FamiTube_parent_backup_token', authToken);
        localStorage.setItem('FamiTube_parent_backup_user', JSON.stringify(currentUser));
        authToken = json.token;
        localStorage.setItem(AUTH_TOKEN_KEY, authToken);
        localStorage.removeItem('famitube_welcome_seen');
        activeKidTab = 'curated';
        kidHomeSelectedTopic = null;
        parentPreviewChild = null;
        handleAuthenticatedUser(json.user);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (err) {
        alert('Failed to switch to child mode.');
      }
    }

    async function previewAsChild(childId) {
      const child = parentModeChildrenCache.find(c => c.id === childId);
      if (!child) return;
      parentPreviewChild = child;
      activeKidTab = 'curated';
      kidHomeSelectedTopic = null;
      kidViewingSelectedChannel = false;
      const previewBanner = document.getElementById('parentPreviewBanner');
      const previewText = document.getElementById('parentPreviewBannerText');
      if (previewBanner && previewText) {
        previewText.textContent = `Previewing Kid View as ${child.name} (${formatAgeGroupLabel(child.ageRating)})`;
        previewBanner.style.display = 'flex';
      }
      const heroCard = document.getElementById('showcaseHeroCard');
      if (heroCard) heroCard.style.display = 'none';
      const curatedEl = document.getElementById('showcaseCuratedPanel');
      if (curatedEl) curatedEl.style.display = 'none';
      openHome(false);
      await renderKidHomeHub({ ...child, role: 'CHILD' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function exitParentPreview() {
      parentPreviewChild = null;
      const previewBanner = document.getElementById('parentPreviewBanner');
      if (previewBanner) previewBanner.style.display = 'none';
      openParentMode();
    }

    function closeChildProfile() {
      activeChildProfileId = null;
      const listEl = document.getElementById('parentChildrenListView');
      const profileEl = document.getElementById('childProfileView');
      if (listEl) listEl.style.display = 'block';
      if (profileEl) profileEl.style.display = 'none';
    }

    function renderChildProfile(c) {
      const container = document.getElementById('childProfileContent');
      if (!container) return;
      const isToddler = c.ageRating === 'TODDLER';
      const enabledTopics = Array.isArray(c.toddlerEnabledTopics) && c.toddlerEnabledTopics.length
        ? c.toddlerEnabledTopics
        : WEB_TODDLER_TV_CHANNELS.slice(0, 6).map(x => x.topic);
      const hiddenCount = Array.isArray(c.toddlerHiddenVideoIds) ? c.toddlerHiddenVideoIds.length : 0;
      const isNapping = c.toddlerCooldownUntil && Date.parse(c.toddlerCooldownUntil) > Date.now();
      const napMinsLeft = isNapping ? Math.max(1, Math.ceil((Date.parse(c.toddlerCooldownUntil) - Date.now()) / 60000)) : 0;

      container.innerHTML = `
        <div class="channel-creator-box" style="margin-bottom:1.25rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; margin-bottom:1.25rem;">
            <div style="display:flex; align-items:center; gap:1rem;">
              <div style="width:60px; height:60px; border-radius:50%; background:linear-gradient(135deg, var(--primary), var(--secondary)); color:white; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:1.45rem;">
                ${getUserInitials(c.name || c.email)}
              </div>
              <div>
                <h2 style="font-family:'Fredoka',cursive; font-size:1.45rem; margin:0;">${c.name}</h2>
                <div style="font-size:0.86rem; color:var(--text-muted);">${formatChildEmailSubtitle(c.email)}${c.birthday ? ` • 🎂 ${c.birthday}` : ''}</div>
              </div>
            </div>
            <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
              <button type="button" class="btn btn-primary btn-sm" onclick="switchToChildMode('${c.id}')">
                <span class="material-symbols-rounded" style="font-size:1rem;">switch_account</span> Switch to Child Mode
              </button>
              <button type="button" class="btn btn-secondary btn-sm" onclick="openChildPairCodeModal('${c.id}', '${String(c.name || '').replace(/'/g, "\\'")}')">📱 Pair Kid Device</button>
              <button type="button" class="btn btn-secondary btn-sm" onclick="removeChildFromProfile('${c.id}')">Remove Child</button>
            </div>
          </div>

          <div class="form-row" style="margin-bottom:1rem; align-items:end;">
            <div class="form-group">
              <label>Birthday (Reference Only)</label>
              <input type="date" id="profileBirthday_${c.id}" value="${c.birthday || ''}" onchange="onProfileBirthdayChange('${c.id}', this.value)">
            </div>
            <div class="form-group">
              <label>Developmental Tier (Parent Decides)</label>
              <select id="profileAgeRating_${c.id}">
                <option value="TODDLER" ${c.ageRating === 'TODDLER' ? 'selected' : ''}>Tier 1: Toddler TV (1.5–3)</option>
                <option value="YOUNG_KIDS" ${c.ageRating === 'YOUNG_KIDS' ? 'selected' : ''}>Tier 2: Young Kids (4–6)</option>
                <option value="OLDER_KIDS" ${c.ageRating === 'OLDER_KIDS' ? 'selected' : ''}>Tier 3: Older Kids (7+)</option>
                <option value="ALL" ${c.ageRating === 'ALL' ? 'selected' : ''}>All Ages</option>
              </select>
            </div>
            <div>
              <button type="button" class="btn btn-primary" onclick="saveChildProfileBasics('${c.id}')">Save Tier &amp; Profile</button>
            </div>
          </div>

          ${isToddler ? `
            <div style="padding:1rem; border-radius:var(--radius-sm); background:var(--bg); border:1px solid rgba(255,51,102,0.3); margin-bottom:0.9rem;">
              <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem; margin-bottom:0.85rem;">
                <div>
                  <div style="font-weight:700; font-size:0.98rem;">📺 Tier 1: Toddler TV Controls</div>
                  <div style="font-size:0.8rem; color:var(--text-muted);">Linear ready-made TV channels, 1-loop sessions, nap cooldown, and slow-paced language curation.</div>
                </div>
                <div style="display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap;">
                  ${isNapping ? `<button type="button" class="btn btn-secondary btn-sm" onclick="wakeParentChildToddlerTv('${c.id}')">☀️ Wake Up TV (${napMinsLeft}m nap left)</button>` : `<span style="font-size:0.78rem; font-weight:700; color:var(--success);">● TV Awake</span>`}
                  <button type="button" class="btn btn-primary btn-sm" onclick="savePmChildToddlerControls('${c.id}')">Save Toddler TV Settings</button>
                </div>
              </div>
              <div class="form-row-3" style="margin-bottom:0.85rem;">
                <div class="form-group">
                  <label>1-Loop Session Length (min)</label>
                  <select id="pmToddlerLoop_${c.id}">
                    ${[10, 15, 20, 25, 30].map(m => `<option value="${m}" ${(c.toddlerLoopMinutes ?? 15) === m ? 'selected' : ''}>${m} minutes</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label>Nap Cooldown After Loop</label>
                  <select id="pmToddlerCooldown_${c.id}">
                    ${[15, 30, 45, 60, 90].map(m => `<option value="${m}" ${(c.toddlerCooldownMinutes ?? 30) === m ? 'selected' : ''}>${m} minutes</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label>Toddler Micro-Stage</label>
                  <select id="pmToddlerSubStage_${c.id}">
                    <option value="AUTO" ${(c.toddlerSubStage || 'AUTO') === 'AUTO' ? 'selected' : ''}>Auto (Balanced)</option>
                    <option value="EARLY" ${c.toddlerSubStage === 'EARLY' ? 'selected' : ''}>Early Toddler (1.5-2.5y)</option>
                    <option value="OLDER" ${c.toddlerSubStage === 'OLDER' ? 'selected' : ''}>Older Toddler (2.5-4y)</option>
                  </select>
                </div>
              </div>
              <div class="form-row" style="margin-bottom:0.85rem;">
                <div class="form-group">
                  <label>Language Override</label>
                  <select id="pmToddlerLang_${c.id}">
                    <option value="all" ${(c.contentLanguage || 'all') === 'all' ? 'selected' : ''}>All Languages (Default)</option>
                    <option value="en" ${c.contentLanguage === 'en' ? 'selected' : ''}>English</option>
                    <option value="id" ${c.contentLanguage === 'id' ? 'selected' : ''}>Indonesian</option>
                    <option value="bilingual" ${c.contentLanguage === 'bilingual' ? 'selected' : ''}>Bilingual (EN + ID)</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Culture Focus</label>
                  <select id="pmToddlerCulture_${c.id}">
                    <option value="GLOBAL" ${(c.cultureMode || 'GLOBAL') === 'GLOBAL' ? 'selected' : ''}>Global / Cross-Cultural</option>
                    <option value="ID" ${c.cultureMode === 'ID' ? 'selected' : ''}>Indonesia / Nusantara</option>
                  </select>
                </div>
              </div>
              <div style="margin-bottom:0.85rem;">
                <div style="font-size:0.82rem; font-weight:700; margin-bottom:0.4rem;">Active Ready-Made TV Channels</div>
                <div style="display:flex; flex-wrap:wrap; gap:0.5rem;">
                  ${WEB_TODDLER_TV_CHANNELS.map(ch => `
                    <label style="display:inline-flex; align-items:center; gap:0.35rem; padding:0.35rem 0.65rem; border-radius:99px; background:var(--surface); border:1px solid var(--border); font-size:0.8rem; cursor:pointer;">
                      <input type="checkbox" class="pm-toddler-topic-${c.id}" value="${ch.topic}" ${enabledTopics.includes(ch.topic) ? 'checked' : ''}>
                      <span>${ch.emoji} ${ch.displayTitle}</span>
                    </label>
                  `).join('')}
                </div>
              </div>
              <div>
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:0.45rem;">
                  <span style="font-size:0.82rem; font-weight:700;">This Week's Loop Preview (6-Video Sticky Queue)</span>
                  ${hiddenCount ? `<button type="button" class="btn btn-secondary btn-sm" onclick="restoreParentToddlerHiddenVideos('${c.id}')">Restore ${hiddenCount} Swapped Video${hiddenCount === 1 ? '' : 's'}</button>` : ''}
                </div>
                <div id="pmToddlerLoopPreview_${c.id}" style="font-size:0.82rem; color:var(--text-muted);">Loading weekly channels...</div>
              </div>
            </div>
          ` : `
            <div style="padding:0.9rem 1rem; border-radius:var(--radius-sm); background:var(--bg); border:1px solid var(--border); display:flex; flex-wrap:wrap; gap:1rem; align-items:center; justify-content:space-between;">
              <div style="display:flex; flex-wrap:wrap; gap:1rem; align-items:center; font-size:0.86rem;">
                <label style="display:inline-flex; align-items:center; gap:0.4rem; font-weight:600; cursor:pointer;">
                  <input type="checkbox" id="pmSearchEnabled_${c.id}" ${c.youtubeSearchEnabled ? 'checked' : ''}>
                  Enable YouTube Search
                </label>
                <label style="display:inline-flex; align-items:center; gap:0.4rem;">
                  Max Searched Videos (0 = unlimited):
                  <input type="number" min="0" id="pmSearchLimit_${c.id}" value="${c.searchViewLimit ?? 0}" style="width:72px; padding:0.25rem 0.45rem; border-radius:4px; border:1px solid var(--border); background:var(--surface); color:var(--text);">
                </label>
                <span style="color:var(--accent); font-weight:600;">Used: ${c.searchViewsUsed ?? 0}</span>
                <label style="display:inline-flex; align-items:center; gap:0.4rem; font-weight:600; cursor:pointer;">
                  <input type="checkbox" id="pmSearchApproval_${c.id}" ${c.searchRequireApproval !== false ? 'checked' : ''}>
                  Require Parent Approval
                </label>
              </div>
              <div style="display:flex; gap:0.5rem;">
                <button type="button" class="btn btn-secondary btn-sm" onclick="resetPmChildSearchViews('${c.id}')">Reset Count</button>
                <button type="button" class="btn btn-primary btn-sm" onclick="savePmChildSearchSettings('${c.id}')">Save Search Settings</button>
              </div>
            </div>
          `}

          <div style="margin-top:0.9rem; padding:1rem; border-radius:var(--radius-sm); background:var(--bg); border:1px solid var(--border);">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem; margin-bottom:0.75rem;">
              <div>
                <div style="font-weight:700; font-size:0.95rem;">Device Safety &amp; PIN Override (Synced to Android)</div>
                <div style="font-size:0.8rem; color:var(--text-muted);">Configure PIN lock and daily watch limit for ${c.name}.</div>
              </div>
              <button type="button" class="btn btn-primary btn-sm" onclick="savePmChildParentalControls('${c.id}')">Save Device Controls</button>
            </div>
            <div class="form-row" style="align-items:end;">
              <div class="form-group">
                <label>Daily Watch Limit (0h 0m = No limit)</label>
                <div style="display:flex; gap:0.45rem; align-items:center;">
                  <select id="pmDailyHours_${c.id}" style="flex:1;" aria-label="Hours">
                    ${Array.from({ length: 13 }, (_, h) => `<option value="${h}" ${Math.floor((c.dailyLimitMinutes ?? 45) / 60) === h ? 'selected' : ''}>${h}h</option>`).join('')}
                  </select>
                  <span style="font-weight:700; color:var(--text-muted);">:</span>
                  <select id="pmDailyMinutes_${c.id}" style="flex:1;" aria-label="Minutes">
                    ${Array.from({ length: 60 }, (_, m) => `<option value="${m}" ${((c.dailyLimitMinutes ?? 45) % 60) === m ? 'selected' : ''}>${String(m).padStart(2, '0')}m</option>`).join('')}
                  </select>
                </div>
              </div>
              <div class="form-group">
                <label>Parent PIN (4 digits)</label>
                <input type="text" maxlength="4" pattern="\\d{4}" id="pmParentPin_${c.id}" value="${c.parentPin || '1234'}" placeholder="1234">
              </div>
            </div>
            <div class="form-row" style="margin-top:0.65rem; align-items:end;">
              <div class="form-group">
                <label style="display:flex; align-items:center; gap:0.45rem; cursor:pointer;">
                  <input type="checkbox" id="pmQuietEnabled_${c.id}" ${c.quietHoursEnabled ? 'checked' : ''}>
                  Scheduled Quiet Hours
                </label>
                <div style="display:flex; gap:0.4rem; margin-top:0.35rem;">
                  <input type="time" id="pmQuietStart_${c.id}" value="${c.quietHoursStart || '20:00'}" style="flex:1;">
                  <input type="time" id="pmQuietEnd_${c.id}" value="${c.quietHoursEnd || '07:00'}" style="flex:1;">
                </div>
              </div>
              <div class="form-group">
                <label>Stop After N Videos (Per Session)</label>
                <select id="pmEpisodeLimit_${c.id}">
                  <option value="0" ${!(c.episodeLimitPerSession > 0) ? 'selected' : ''}>Off (Unlimited)</option>
                  <option value="1" ${c.episodeLimitPerSession === 1 ? 'selected' : ''}>1 video</option>
                  <option value="2" ${c.episodeLimitPerSession === 2 ? 'selected' : ''}>2 videos</option>
                  <option value="3" ${c.episodeLimitPerSession === 3 ? 'selected' : ''}>3 videos</option>
                  <option value="5" ${c.episodeLimitPerSession === 5 ? 'selected' : ''}>5 videos</option>
                </select>
              </div>
            </div>
          </div>

          <div style="margin-top:0.9rem; padding:1rem; border-radius:var(--radius-sm); background:var(--bg); border:1px solid var(--border);">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem; margin-bottom:0.85rem;">
              <div>
                <div style="font-weight:700; font-size:0.98rem;">${isToddler ? 'Viewing History' : 'Activity, YouTube Search &amp; Viewing History'}</div>
                <div style="font-size:0.8rem; color:var(--text-muted);">${isToddler ? `Videos watched by ${c.name}.` : `Every video viewed, YouTube search query, and video permission request by ${c.name}.`}</div>
              </div>
              <div style="display:flex; gap:0.45rem; flex-wrap:wrap;">
                <button type="button" class="btn btn-secondary btn-sm" onclick="loadChildActivityHistory('${c.id}')">Refresh</button>
                <button type="button" class="btn btn-secondary btn-sm" id="btnClearChildActivity_${c.id}" onclick="clearChildActivityHistory('${c.id}')">Clear Current Tab</button>
              </div>
            </div>
            <div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-bottom:0.85rem;">
              <button type="button" class="filter-pill active" id="pmActTab_watch_${c.id}" onclick="switchChildActivityTab('${c.id}', 'watch')">🎬 Video Viewing (<span id="pmActCount_watch_${c.id}">0</span>)</button>
              ${!isToddler ? `
                <button type="button" class="filter-pill" id="pmActTab_search_${c.id}" onclick="switchChildActivityTab('${c.id}', 'search')">🔍 YouTube Searches (<span id="pmActCount_search_${c.id}">0</span>)</button>
                <button type="button" class="filter-pill" id="pmActTab_requests_${c.id}" onclick="switchChildActivityTab('${c.id}', 'requests')">📩 Video Requests (<span id="pmActCount_requests_${c.id}">0</span>)</button>
                <button type="button" class="filter-pill" id="pmActTab_subs_${c.id}" onclick="switchChildActivityTab('${c.id}', 'subs')">📺 @YouTube Subscriptions (<span id="pmActCount_subs_${c.id}">0</span>)</button>
              ` : ''}
            </div>
            <div id="pmActivityList_${c.id}" style="max-height:380px; overflow-y:auto;">
              <p style="color:var(--text-muted); font-size:0.85rem;">Loading activity history...</p>
            </div>
          </div>
        </div>
      `;
      if (isToddler) {
        childActivityActiveTab[c.id] = 'watch';
        loadParentToddlerLoopPreview(c.id);
      }
      loadChildActivityHistory(c.id);
    }

    async function loadParentToddlerLoopPreview(childId) {
      const el = document.getElementById(`pmToddlerLoopPreview_${childId}`);
      if (!el) return;
      try {
        const res = await authFetch(`/api/kids/toddler-tv?childId=${encodeURIComponent(childId)}`);
        const json = await res.json();
        const channels = json.success ? (json.data?.channels || []) : [];
        if (!channels.length) {
          el.innerHTML = 'No Toddler TV channels enabled.';
          return;
        }
        el.innerHTML = channels.map(ch => `
          <div style="margin-bottom:0.7rem; padding:0.65rem; border-radius:var(--radius-sm); background:var(--surface); border:1px solid var(--border);">
            <div style="font-weight:700; font-size:0.86rem; color:var(--text); margin-bottom:0.4rem;">${ch.emoji} ${ch.displayTitle} (${ch.videos.length} videos)</div>
            <div style="display:flex; flex-direction:column; gap:0.35rem;">
              ${ch.videos.map((v, i) => `
                <div style="display:flex; align-items:center; justify-content:space-between; gap:0.5rem; font-size:0.78rem;">
                  <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${i + 1}. ${v.title}</span>
                  <button type="button" class="btn btn-secondary btn-sm" style="padding:2px 8px; font-size:0.72rem;" onclick="hideParentToddlerVideo('${childId}', '${v.id}')">Swap / Hide</button>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('');
      } catch {
        el.innerHTML = 'Unable to load weekly loop preview.';
      }
    }

    async function savePmChildToddlerControls(childId) {
      const checkedTopics = Array.from(document.querySelectorAll(`.pm-toddler-topic-${childId}:checked`)).map(el => el.value);
      if (!checkedTopics.length) return alert('Keep at least 1 Toddler TV channel enabled.');
      const payload = {
        toddlerLoopMinutes: Number(document.getElementById(`pmToddlerLoop_${childId}`)?.value || 15),
        toddlerCooldownMinutes: Number(document.getElementById(`pmToddlerCooldown_${childId}`)?.value || 30),
        toddlerSubStage: document.getElementById(`pmToddlerSubStage_${childId}`)?.value || 'AUTO',
        contentLanguage: document.getElementById(`pmToddlerLang_${childId}`)?.value || 'all',
        cultureMode: document.getElementById(`pmToddlerCulture_${childId}`)?.value || 'GLOBAL',
        toddlerEnabledTopics: checkedTopics
      };
      const res = await authFetch(`/api/parent/children/${childId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!json.success) return alert(json.message || 'Failed to save Toddler TV controls');
      await loadParentModeChildren();
      alert('Toddler TV controls saved!');
    }

    async function hideParentToddlerVideo(childId, videoId) {
      const child = parentModeChildrenCache.find(c => c.id === childId);
      const existing = Array.isArray(child?.toddlerHiddenVideoIds) ? child.toddlerHiddenVideoIds : [];
      if (existing.includes(videoId)) return;
      const res = await authFetch(`/api/parent/children/${childId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toddlerHiddenVideoIds: [...existing, videoId] })
      });
      const json = await res.json();
      if (!json.success) return alert(json.message || 'Failed to swap video');
      await loadParentModeChildren();
    }

    async function restoreParentToddlerHiddenVideos(childId) {
      const res = await authFetch(`/api/parent/children/${childId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toddlerHiddenVideoIds: [] })
      });
      const json = await res.json();
      if (!json.success) return alert(json.message || 'Failed to restore videos');
      await loadParentModeChildren();
    }

    async function wakeParentChildToddlerTv(childId) {
      const res = await authFetch(`/api/parent/children/${childId}/toddler-wake`, { method: 'POST' });
      const json = await res.json();
      if (!json.success) return alert(json.message || 'Failed to wake Toddler TV');
      await loadParentModeChildren();
      alert('Toddler TV is awake!');
    }

    const childActivityCache = {};
    const childActivityActiveTab = {};

    async function loadChildActivityHistory(childId) {
      const listEl = document.getElementById(`pmActivityList_${childId}`);
      if (!listEl) return;
      try {
        const res = await authFetch(`/api/parent/children/${encodeURIComponent(childId)}/activity-history`);
        const json = await res.json();
        if (!json.success || !json.data) {
          listEl.innerHTML = `<p style="color:var(--primary); font-size:0.85rem;">${json.message || 'Failed to load activity history.'}</p>`;
          return;
        }
        childActivityCache[childId] = json.data;
        if (!childActivityActiveTab[childId]) childActivityActiveTab[childId] = 'watch';
        const wCount = document.getElementById(`pmActCount_watch_${childId}`);
        const sCount = document.getElementById(`pmActCount_search_${childId}`);
        const rCount = document.getElementById(`pmActCount_requests_${childId}`);
        const subCount = document.getElementById(`pmActCount_subs_${childId}`);
        if (wCount) wCount.textContent = String((json.data.watchHistory || []).length);
        if (sCount) sCount.textContent = String((json.data.searchHistory || []).length);
        if (rCount) rCount.textContent = String((json.data.videoRequests || []).length);
        if (subCount) subCount.textContent = String((json.data.youtubeSubscriptions || []).length);
        renderChildActivityTab(childId);
      } catch {
        listEl.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem;">Unable to load activity history.</p>';
      }
    }

    function switchChildActivityTab(childId, tab) {
      childActivityActiveTab[childId] = tab;
      ['watch', 'search', 'requests', 'subs'].forEach((t) => {
        document.getElementById(`pmActTab_${t}_${childId}`)?.classList.toggle('active', t === tab);
      });
      const clearBtn = document.getElementById(`btnClearChildActivity_${childId}`);
      if (clearBtn) {
        clearBtn.style.display = (tab === 'requests' || tab === 'subs') ? 'none' : 'inline-flex';
      }
      renderChildActivityTab(childId);
    }

    function renderChildActivityTab(childId) {
      const listEl = document.getElementById(`pmActivityList_${childId}`);
      if (!listEl) return;
      const data = childActivityCache[childId] || { watchHistory: [], searchHistory: [], videoRequests: [] };
      const tab = childActivityActiveTab[childId] || 'watch';

      if (tab === 'watch') {
        const items = data.watchHistory || [];
        if (!items.length) {
          listEl.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem;">No videos watched yet.</p>';
          return;
        }
        listEl.innerHTML = items.map((h) => `
          <div style="display:flex; align-items:center; justify-content:space-between; gap:0.75rem; padding:0.55rem 0; border-bottom:1px solid var(--border);">
            <div style="display:flex; align-items:center; gap:0.75rem; min-width:0;">
              ${h.thumbnailUrl ? `<img src="${h.thumbnailUrl}" alt="" style="width:72px; height:42px; object-fit:cover; border-radius:6px; flex-shrink:0;">` : ''}
              <div style="min-width:0;">
                <div style="font-weight:700; font-size:0.88rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${h.title}</div>
                <div style="font-size:0.76rem; color:var(--text-muted);">
                  ${h.channelTitle || 'FamiTube'} • ${h.isApprovedSearch ? '<span style="color:var(--accent); font-weight:700;">Approved Search</span>' : '<span style="color:var(--success); font-weight:700;">Curated</span>'}
                </div>
              </div>
            </div>
            <div style="font-size:0.75rem; color:var(--text-muted); white-space:nowrap;">${h.watchedAt ? new Date(h.watchedAt).toLocaleString() : ''}</div>
          </div>
        `).join('');
      } else if (tab === 'search') {
        const items = data.searchHistory || [];
        if (!items.length) {
          listEl.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem;">No YouTube searches recorded yet.</p>';
          return;
        }
        listEl.innerHTML = items.map((s) => `
          <div style="display:flex; align-items:center; justify-content:space-between; gap:0.75rem; padding:0.55rem 0; border-bottom:1px solid var(--border);">
            <div>
              <span style="font-weight:700; font-size:0.9rem;">🔍 "${s.query}"</span>
              <span style="font-size:0.76rem; color:var(--text-muted); margin-left:0.5rem;">(${s.resultsCount ?? 0} results${s.regionCode ? ` • ${s.regionCode}` : ''})</span>
            </div>
            <div style="font-size:0.75rem; color:var(--text-muted); white-space:nowrap;">${s.searchedAt ? new Date(s.searchedAt).toLocaleString() : ''}</div>
          </div>
        `).join('');
      } else if (tab === 'requests') {
        const items = data.videoRequests || [];
        if (!items.length) {
          listEl.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem;">No YouTube video requests yet.</p>';
          return;
        }
        listEl.innerHTML = items.map((r) => {
          const badgeColor = r.status === 'APPROVED' ? 'var(--success)' : r.status === 'REJECTED' ? 'var(--primary)' : '#f59e0b';
          return `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:0.75rem; padding:0.6rem 0; border-bottom:1px solid var(--border); flex-wrap:wrap;">
              <div style="display:flex; align-items:center; gap:0.75rem; min-width:0; flex:1;">
                ${r.thumbnailUrl ? `<img src="${r.thumbnailUrl}" alt="" style="width:72px; height:42px; object-fit:cover; border-radius:6px; flex-shrink:0;">` : ''}
                <div style="min-width:0;">
                  <div style="font-weight:700; font-size:0.88rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${r.title}</div>
                  <div style="font-size:0.76rem; color:var(--text-muted);">
                    ${r.channelTitle || 'YouTube'} • <span style="font-weight:800; color:${badgeColor};">${r.status}</span> • ${r.createdAt ? new Date(r.createdAt).toLocaleString() : ''}
                  </div>
                </div>
              </div>
              ${r.status === 'PENDING' ? `
                <div style="display:flex; gap:0.4rem;">
                  <button type="button" class="btn btn-primary btn-sm" onclick="decideChildActivityVideoRequest('${childId}', '${r.id}', 'APPROVED')">Approve</button>
                  <button type="button" class="btn btn-secondary btn-sm" onclick="decideChildActivityVideoRequest('${childId}', '${r.id}', 'REJECTED')">Deny</button>
                </div>
              ` : ''}
            </div>
          `;
        }).join('');
      } else {
        const items = data.youtubeSubscriptions || [];
        if (!items.length) {
          listEl.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem;">No @YouTube channels subscribed yet.</p>';
          return;
        }
        listEl.innerHTML = items.map((sub) => {
          const trust = sub.trustLevel || 'SUPERVISED';
          const badgeColor = trust === 'TRUSTED' ? 'var(--success)' : trust === 'BLOCKED' ? 'var(--primary)' : '#f59e0b';
          const badgeLabel = trust === 'TRUSTED' ? '✓ Trusted (Auto-Approve Videos)' : trust === 'BLOCKED' ? '✕ Blocked' : 'Supervised (Per-Video Approval)';
          const safeHandle = (sub.handle || '').replace(/'/g, "\\'");
          return `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:0.75rem; padding:0.65rem 0; border-bottom:1px solid var(--border); flex-wrap:wrap;">
              <div style="display:flex; align-items:center; gap:0.75rem; min-width:0; flex:1;">
                ${sub.avatarUrl ? `<img src="${sub.avatarUrl}" alt="" style="width:42px; height:42px; border-radius:50%; object-fit:cover; flex-shrink:0;">` : ''}
                <div style="min-width:0;">
                  <div style="font-weight:800; font-size:0.9rem; color:var(--accent);">${sub.handle}</div>
                  <div style="font-size:0.76rem; color:var(--text-muted);">
                    ${sub.title || sub.handle} • <span style="font-weight:800; color:${badgeColor};">${badgeLabel}</span>
                  </div>
                </div>
              </div>
              <div style="display:flex; gap:0.4rem; flex-wrap:wrap;">
                <button type="button" class="btn ${trust === 'TRUSTED' ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="setChildYtSubTrust('${childId}', '${safeHandle}', 'TRUSTED')">Trust</button>
                <button type="button" class="btn ${trust === 'SUPERVISED' ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="setChildYtSubTrust('${childId}', '${safeHandle}', 'SUPERVISED')">Supervise</button>
                <button type="button" class="btn ${trust === 'BLOCKED' ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="setChildYtSubTrust('${childId}', '${safeHandle}', 'BLOCKED')">Block</button>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    async function setChildYtSubTrust(childId, handle, trustLevel) {
      const res = await authFetch(`/api/parent/children/${encodeURIComponent(childId)}/youtube-subscriptions/${encodeURIComponent(handle)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trustLevel })
      });
      const json = await res.json();
      if (!json.success) return alert(json.message || 'Failed to update channel trust level');
      await loadChildActivityHistory(childId);
    }

    async function clearChildActivityHistory(childId) {
      const tab = childActivityActiveTab[childId] || 'watch';
      if (tab === 'requests') return;
      const endpoint = tab === 'search' ? 'search-history' : 'watch-history';
      const label = tab === 'search' ? 'YouTube search history' : 'video viewing history';
      if (!confirm(`Clear ${label} for this child?`)) return;
      const res = await authFetch(`/api/parent/children/${encodeURIComponent(childId)}/${endpoint}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) return alert(json.message || 'Failed to clear history');
      await loadChildActivityHistory(childId);
    }

    async function decideChildActivityVideoRequest(childId, requestId, decision) {
      const res = await authFetch(`/api/parent/video-requests/${encodeURIComponent(requestId)}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision })
      });
      const json = await res.json();
      if (!json.success) return alert(json.message || 'Failed to update request');
      await loadChildActivityHistory(childId);
    }

    function onProfileBirthdayChange(_childId, _birthdayStr) {
      // Parent is in full control of ageRating on existing profiles; birthday is informational only.
    }

    async function saveChildProfileBasics(childId) {
      const birthday = document.getElementById(`profileBirthday_${childId}`)?.value || undefined;
      const ageRating = document.getElementById(`profileAgeRating_${childId}`)?.value;
      const res = await authFetch(`/api/parent/children/${childId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ birthday, ageRating })
      });
      const json = await res.json();
      if (!json.success) return alert(json.message || 'Failed to save child profile');
      await loadParentModeChildren();
      alert('Child profile updated!');
    }

    async function savePmChildSearchSettings(childId) {
      const youtubeSearchEnabled = Boolean(document.getElementById(`pmSearchEnabled_${childId}`)?.checked);
      const searchViewLimit = Math.max(0, Number(document.getElementById(`pmSearchLimit_${childId}`)?.value || 0));
      const searchRequireApproval = Boolean(document.getElementById(`pmSearchApproval_${childId}`)?.checked);
      const res = await authFetch(`/api/parent/children/${childId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ youtubeSearchEnabled, searchViewLimit, searchRequireApproval })
      });
      const json = await res.json();
      if (!json.success) return alert(json.message || 'Failed to update search settings');
      await loadParentModeChildren();
      alert('Search settings saved!');
    }

    async function savePmChildParentalControls(childId) {
      const limitHours = Math.max(0, Math.min(12, Number(document.getElementById(`pmDailyHours_${childId}`)?.value || 0)));
      const limitMins = Math.max(0, Math.min(59, Number(document.getElementById(`pmDailyMinutes_${childId}`)?.value || 0)));
      const dailyLimitMinutes = limitHours * 60 + limitMins;
      const parentPin = String(document.getElementById(`pmParentPin_${childId}`)?.value || '').trim();
      if (!/^\d{4}$/.test(parentPin)) {
        return alert('Parent PIN must be exactly 4 digits.');
      }
      const res = await authFetch(`/api/parent/children/${childId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dailyLimitMinutes,
          parentPin,
          quietHoursEnabled: Boolean(document.getElementById(`pmQuietEnabled_${childId}`)?.checked),
          quietHoursStart: document.getElementById(`pmQuietStart_${childId}`)?.value || '20:00',
          quietHoursEnd: document.getElementById(`pmQuietEnd_${childId}`)?.value || '07:00',
          episodeLimitPerSession: Number(document.getElementById(`pmEpisodeLimit_${childId}`)?.value || 0)
        })
      });
      const json = await res.json();
      if (!json.success) return alert(json.message || 'Failed to save parental controls');
      await loadParentModeChildren();
      alert('Parental controls saved and synced!');
    }

    async function resetPmChildSearchViews(childId) {
      const res = await authFetch(`/api/parent/children/${childId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetSearchViewsUsed: true })
      });
      const json = await res.json();
      if (!json.success) return alert(json.message || 'Failed to reset view count');
      await loadParentModeChildren();
    }

    async function removeChildFromProfile(childId) {
      if (!confirm('Remove this child account?')) return;
      const res = await authFetch(`/api/parent/children/${childId}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) return alert(json.message || 'Failed to remove child');
      closeChildProfile();
      await loadParentModeChildren();
    }

    async function registerParentModeChild(e) {
      e.preventDefault();
      const emailVal = (document.getElementById('pmChildEmailInput')?.value || '').trim();
      const passwordVal = document.getElementById('pmChildPasswordInput')?.value || '';
      const birthdayVal = (document.getElementById('pmChildBirthdayInput')?.value || '').trim();
      const payload = {
        name: document.getElementById('pmChildNameInput').value.trim(),
        ageRating: document.getElementById('pmChildAgeRatingInput').value,
        ...(birthdayVal ? { birthday: birthdayVal } : {}),
        ...(emailVal ? { email: emailVal } : {}),
        ...(passwordVal ? { password: passwordVal } : {})
      };
      const res = await authFetch('/api/parent/children', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!json.success) return alert(json.message || 'Failed to register child');
      e.target.reset();
      toggleParentAddChildForm(false);
      await loadParentModeChildren();
      alert('Child profile added!');
    }

    async function registerChildAccount(e) {
      e.preventDefault();
      const emailVal = (document.getElementById('childEmailInput')?.value || '').trim();
      const passwordVal = document.getElementById('childPasswordInput')?.value || '';
      const birthdayVal = (document.getElementById('childBirthdayInput')?.value || '').trim();
      const payload = {
        name: document.getElementById('childNameInput').value.trim(),
        ageRating: document.getElementById('childAgeRatingInput').value,
        ...(birthdayVal ? { birthday: birthdayVal } : {}),
        ...(emailVal ? { email: emailVal } : {}),
        ...(passwordVal ? { password: passwordVal } : {})
      };
      const res = await authFetch('/api/parent/children', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!json.success) return alert(json.message || 'Failed to register child');
      e.target.reset();
      await loadParentChildren();
      alert('Child profile added!');
    }

    async function openChildPairCodeModal(childId, childName) {
      const modal = document.getElementById('childPairCodeModal');
      const titleEl = document.getElementById('childPairModalTitle');
      const codeEl = document.getElementById('childPairCodeDisplay');
      if (titleEl) titleEl.textContent = `Pair ${childName || 'Kid'}'s Device`;
      if (codeEl) codeEl.textContent = '......';
      if (modal) modal.style.display = 'flex';
      try {
        const res = await authFetch(`/api/parent/children/${encodeURIComponent(childId)}/pair-code`, { method: 'POST' });
        const json = await res.json();
        if (!res.ok || !json.success || !json.data?.code) {
          closeChildPairCodeModal();
          return alert(json.message || 'Unable to generate pairing code');
        }
        const c = String(json.data.code);
        if (codeEl) codeEl.textContent = c.length === 6 ? `${c.slice(0, 3)} ${c.slice(3)}` : c;
      } catch {
        closeChildPairCodeModal();
        alert('Failed to generate pairing code.');
      }
    }

    function closeChildPairCodeModal() {
      const modal = document.getElementById('childPairCodeModal');
      if (modal) modal.style.display = 'none';
    }

    async function openWhoIsWatchingModal() {
      const modal = document.getElementById('whoIsWatchingModal');
      const grid = document.getElementById('whoIsWatchingGrid');
      if (!modal || !grid) return;
      modal.style.display = 'flex';
      grid.innerHTML = '<div style="grid-column:1/-1; color:var(--text-muted); text-align:center; padding:1rem;">Loading family profiles...</div>';
      const parentBackupToken = localStorage.getItem('FamiTube_parent_backup_token');
      const fetchToken = currentUser?.role === 'PARENT' ? authToken : parentBackupToken;
      let kids = parentModeChildrenCache || [];
      if (fetchToken) {
        try {
          const res = await fetch(apiUrl('/api/parent/children'), {
            headers: { Authorization: `Bearer ${fetchToken}` }
          });
          const json = await res.json();
          if (json.success && Array.isArray(json.data)) {
            kids = json.data;
            parentModeChildrenCache = kids;
          }
        } catch {}
      }
      const kidCards = kids.map(c => `
        <button type="button" onclick="closeWhoIsWatchingModal(); switchToChildFromPicker('${c.id}');" style="cursor:pointer; background:var(--surface-light); border:1px solid var(--border); border-radius:var(--radius-sm); padding:1.1rem 0.75rem; display:flex; flex-direction:column; align-items:center; gap:0.55rem; color:var(--text); font-family:inherit;">
          <span style="width:56px; height:56px; border-radius:50%; background:linear-gradient(135deg, var(--primary), var(--secondary)); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:1.3rem;">${getUserInitials(c.name)}</span>
          <span style="font-weight:800; font-size:0.96rem;">${c.name}</span>
          <span style="font-size:0.74rem; color:var(--secondary); font-weight:700;">${formatAgeGroupLabel(c.ageRating)}</span>
        </button>
      `).join('');
      const parentCard = `
        <button type="button" onclick="closeWhoIsWatchingModal(); if(currentUser?.role==='CHILD'){ handleLogout(); } else { openParentMode(); }" style="cursor:pointer; background:var(--surface); border:1.5px dashed var(--secondary); border-radius:var(--radius-sm); padding:1.1rem 0.75rem; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:0.55rem; color:var(--text); font-family:inherit;">
          <span style="width:56px; height:56px; border-radius:50%; background:rgba(67,97,238,0.14); color:var(--secondary); display:flex; align-items:center; justify-content:center;">
            <span class="material-symbols-rounded" style="font-size:1.6rem;">admin_panel_settings</span>
          </span>
          <span style="font-weight:800; font-size:0.96rem;">Parent Mode</span>
          <span style="font-size:0.74rem; color:var(--text-muted); font-weight:600;">Manage &amp; Curate</span>
        </button>
      `;
      grid.innerHTML = kidCards + parentCard;
    }

    function closeWhoIsWatchingModal() {
      const modal = document.getElementById('whoIsWatchingModal');
      if (modal) modal.style.display = 'none';
    }

    async function switchToChildFromPicker(childId) {
      if (currentUser?.role === 'PARENT') {
        return switchToChildMode(childId);
      }
      const parentBackupToken = localStorage.getItem('FamiTube_parent_backup_token');
      if (!parentBackupToken) return;
      try {
        const res = await fetch(apiUrl(`/api/parent/children/${childId}/switch-session`), {
          method: 'POST',
          headers: { Authorization: `Bearer ${parentBackupToken}` }
        });
        const json = await res.json();
        if (!res.ok || !json?.success || !json?.token || !json?.user) {
          return alert(json?.message || 'Unable to switch child profile');
        }
        authToken = json.token;
        localStorage.setItem(AUTH_TOKEN_KEY, authToken);
        handleAuthenticatedUser(json.user);
      } catch {
        alert('Failed to switch child profile.');
      }
    }

    async function updateChildAgeRating(childId, ageRating) {
      const res = await authFetch(`/api/parent/children/${childId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ageRating })
      });
      const json = await res.json();
      if (!json.success) return alert(json.message || 'Failed to update age rating');
    }

    async function deleteChildAccount(childId) {
      if (!confirm('Remove this child account?')) return;
      const res = await authFetch(`/api/parent/children/${childId}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) return alert(json.message || 'Failed to remove child');
      await loadParentChildren();
    }

    async function saveChildSearchSettings(childId) {
      const youtubeSearchEnabled = Boolean(document.getElementById(`childSearchEnabled_${childId}`)?.checked);
      const searchViewLimit = Math.max(0, Number(document.getElementById(`childSearchLimit_${childId}`)?.value || 0));
      const searchRequireApproval = Boolean(document.getElementById(`childSearchApproval_${childId}`)?.checked);
      const res = await authFetch(`/api/parent/children/${childId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ youtubeSearchEnabled, searchViewLimit, searchRequireApproval })
      });
      const json = await res.json();
      if (!json.success) return alert(json.message || 'Failed to save search settings');
      await loadParentChildren();
      alert('YouTube search settings saved!');
    }

    async function resetChildSearchViews(childId) {
      const res = await authFetch(`/api/parent/children/${childId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetSearchViewsUsed: true })
      });
      const json = await res.json();
      if (!json.success) return alert(json.message || 'Failed to reset count');
      await loadParentChildren();
    }

    async function loadParentVideoRequests() {
      const el = document.getElementById('parentVideoRequestsList');
      if (!el || !authToken) return;
      try {
        const res = await authFetch('/api/parent/video-requests');
        const json = await res.json();
        if (!json.success || !json.data.length) {
          el.innerHTML = '<div style="color:var(--text-muted); font-size:0.86rem;">No video search approval requests yet.</div>';
          return;
        }
        el.innerHTML = json.data.map(r => `
          <div class="schedule-item" style="flex-wrap:wrap; gap:0.75rem;">
            <div style="display:flex; align-items:center; gap:0.75rem; min-width:0; flex:1;">
              <img src="${r.thumbnailUrl}" style="width:88px; height:52px; object-fit:cover; border-radius:6px; flex-shrink:0;">
              <div style="min-width:0;">
                <div style="font-weight:700; font-size:0.9rem;">${r.title}</div>
                <div style="font-size:0.78rem; color:var(--text-muted); margin-top:0.15rem;">
                  Requested by <strong>${r.kidName || 'Child'}</strong> &bull; ${r.channelTitle} &bull;
                  <span style="font-weight:700; color:${r.status === 'APPROVED' ? 'var(--success)' : r.status === 'REJECTED' ? 'var(--primary)' : 'var(--accent)'};">${r.status}</span>
                </div>
              </div>
            </div>
            <div style="display:flex; gap:0.45rem;">
              ${r.status !== 'APPROVED' ? `<button type="button" class="btn btn-primary btn-sm" onclick="decideParentVideoRequest('${r.id}', 'APPROVED')">Approve</button>` : ''}
              ${r.status !== 'REJECTED' ? `<button type="button" class="btn btn-secondary btn-sm" onclick="decideParentVideoRequest('${r.id}', 'REJECTED')">Decline</button>` : ''}
            </div>
          </div>
        `).join('');
      } catch {
        el.innerHTML = '<div style="color:var(--text-muted); font-size:0.86rem;">Unable to load approval requests.</div>';
      }
    }

    async function decideParentVideoRequest(requestId, decision) {
      const res = await authFetch(`/api/parent/video-requests/${requestId}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision })
      });
      const json = await res.json();
      if (!json.success) return alert(json.message || 'Failed to update request');
      if (currentUser) renderNotifications(currentUser);
      await loadParentVideoRequests();
      await loadParentChildren();
    }

    let kidsFeedVideos = null;
    let kidParentalSettings = {
      parentPin: '1234',
      dailyLimitMinutes: 45,
      ageRating: 'ALL',
      quietHoursEnabled: false,
      quietHoursStart: '20:00',
      quietHoursEnd: '07:00',
      episodeLimitPerSession: 0,
      attentionTrackingEnabled: false,
      attentionPauseSeconds: 30,
      attentionMinWatchPercent: 60
    };
    let webSessionEpisodesWatched = 0;

    async function loadShowcase(useKidsFeed = false) {
      try {
        if (!authToken || !currentUser) {
          showcaseChannels = [];
          kidsFeedVideos = null;
          if (showcaseAutoRotateTimer) clearInterval(showcaseAutoRotateTimer);
          return;
        }
        if (parentPreviewChild) {
          const previewAge = !parentPreviewChild.ageRating || parentPreviewChild.ageRating === 'ALL'
            ? 'OLDER_KIDS'
            : parentPreviewChild.ageRating;
          const res = await fetch(apiUrl(`/api/channels?ageRating=${encodeURIComponent(previewAge)}`));
          const json = await res.json();
          if (json.success) {
            showcaseChannels = json.data || [];
            const hasActive = showcaseChannels.some(c => c.id === activeShowcaseChannelId);
            const initialId = hasActive ? activeShowcaseChannelId : (showcaseChannels[0]?.id || null);
            renderShowcaseChannels();
            await selectShowcaseChannel(initialId, true);
            resetShowcaseAutoRotate();
          }
          return;
        }
        if (useKidsFeed && authToken) {
          const res = await fetch(apiUrl('/api/kids/feed'), {
            headers: { Authorization: `Bearer ${authToken}` }
          });
          const json = await res.json();
          if (json.success && json.data) {
            showcaseChannels = json.data.channels || [];
            kidsFeedVideos = json.data.videos || [];
            kidsFeedVideos.forEach(v => { if (v?.id) kidVideoById.set(v.id, v); });
            if (json.data.parentalSettings) {
              kidParentalSettings = { ...kidParentalSettings, ...json.data.parentalSettings };
              if (currentUser && json.data.parentalSettings.ageRating) {
                currentUser.ageRating = json.data.parentalSettings.ageRating;
              }
              updateKidTimePill();
              if (currentUser?.role === 'CHILD') {
                updateKidToolsVisibility(currentUser);
              }
            }
            const hasActive = showcaseChannels.some(c => c.id === activeShowcaseChannelId);
            const initialId = hasActive ? activeShowcaseChannelId : (showcaseChannels[0]?.id || null);
            renderShowcaseChannels();
            await selectShowcaseChannel(initialId, true);
            resetShowcaseAutoRotate();
            return;
          }
        }
        kidsFeedVideos = null;
        const res = await fetch(apiUrl('/api/channels'));
        const json = await res.json();
        if (json.success) {
          showcaseChannels = json.data || [];
          const hasActive = showcaseChannels.some(c => c.id === activeShowcaseChannelId);
          const initialId = hasActive ? activeShowcaseChannelId : (showcaseChannels[0]?.id || null);
          renderShowcaseChannels();
          await selectShowcaseChannel(initialId, true);
          resetShowcaseAutoRotate();
        }
      } catch {
        document.getElementById('showcaseChannels').innerHTML =
          '<p style="color:var(--text-muted);">Unable to load channels from API at ' + API_BASE + '</p>';
      }
    }

    function renderShowcaseChannels() {
      const track = document.getElementById('showcaseChannels');
      if (!showcaseChannels.length) {
        track.innerHTML = '<p style="color:var(--text-muted);">No channels available yet.</p>';
        return;
      }
      track.innerHTML = showcaseChannels.map(c => {
        const isActive = activeShowcaseChannelId === c.id;
        const isLive = c.channelType === 'LIVE_TV';
        return `
          <div class="card channel-slide ${isActive ? 'active' : ''}" data-channel-id="${c.id}" onclick="selectShowcaseChannel('${c.id}')">
            <div style="display:flex; align-items:center; gap:0.85rem; margin-bottom:0.65rem;">
              <img src="${c.avatarUrl}" style="width:48px; height:48px; border-radius:50%; object-fit:cover; border:2px solid ${isLive ? 'var(--primary)' : 'var(--accent)'};">
              <div style="min-width:0;">
                <div style="font-weight:700; font-size:0.98rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${c.name}</div>
                <div style="font-size:0.78rem; color:var(--accent);">${c.category} &bull; ${c.videoCount || 0} videos</div>
                <div style="font-size:0.74rem; color:var(--text-muted);">by ${c.ownerName || 'Team FamiTube'}</div>
                <div style="margin-top:0.25rem;">${formatChannelAgeBadge(c.ageRating)}</div>
              </div>
            </div>
            <p style="color:var(--text-muted); font-size:0.82rem; line-height:1.4; margin:0 0 0.5rem;">${c.description}</p>
            <div style="display:flex; justify-content:flex-end;">
              <button type="button" class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); openChannelPage('${c.id}', 'home')" style="font-size:0.74rem; padding:0.25rem 0.65rem; border-radius:99px; gap:0.25rem;">
                <span>Channel Page</span>
                <span class="material-symbols-rounded" style="font-size:0.95rem;">arrow_forward</span>
              </button>
            </div>
          </div>
        `;
      }).join('');
      const activeSlide = track.querySelector('.channel-slide.active');
      if (activeSlide) {
        activeSlide.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
      }
    }

    let showcaseAutoRotateTimer = null;
    let isShowcaseHovered = false;

    function resetShowcaseAutoRotate() {
      if (showcaseAutoRotateTimer) clearInterval(showcaseAutoRotateTimer);
      showcaseAutoRotateTimer = setInterval(async () => {
        if (document.hidden || isShowcaseHovered || showcaseChannels.length <= 1) return;
        const showcaseEl = document.getElementById('showcaseApp');
        if (!showcaseEl || showcaseEl.style.display === 'none') return;
        const videoModal = document.getElementById('videoModal');
        if (videoModal && videoModal.style.display === 'flex') return;
        await stepChannelCarousel(1, true);
      }, 5000);
    }

    (() => {
      const track = document.getElementById('showcaseChannels');
      if (track) {
        track.addEventListener('mouseenter', () => { isShowcaseHovered = true; });
        track.addEventListener('mouseleave', () => { isShowcaseHovered = false; });
      }
    })();

    async function stepChannelCarousel(delta, isAuto = false) {
      if (!showcaseChannels.length) return;
      const currentIdx = showcaseChannels.findIndex(c => c.id === activeShowcaseChannelId);
      const baseIdx = currentIdx >= 0 ? currentIdx : 0;
      const nextIdx = (baseIdx + delta + showcaseChannels.length) % showcaseChannels.length;
      await selectShowcaseChannel(showcaseChannels[nextIdx].id, isAuto);
      if (!isAuto) resetShowcaseAutoRotate();
    }

    async function selectShowcaseChannel(channelId, isAuto = false) {
      await loadChannelVideosIntoShowcase(channelId);
      if (!isAuto) resetShowcaseAutoRotate();
    }

    async function loadChannelVideosIntoShowcase(channelId) {
      const targetId = channelId || showcaseChannels[0]?.id || null;
      activeShowcaseChannelId = targetId;
      renderShowcaseChannels();
      const heading = document.getElementById('showcaseVideosHeading');
      const countEl = document.getElementById('showcaseVideosCount');
      const grid = document.getElementById('showcaseVideos');

      let videos = [];
      if (targetId) {
        const ch = showcaseChannels.find(c => c.id === targetId);
        heading.innerHTML = ch
          ? `<div style="display:flex; align-items:center; gap:0.6rem; flex-wrap:wrap;"><span>${ch.name} — Curated Videos</span> <button type="button" class="btn btn-secondary btn-sm" onclick="openChannelPage('${ch.id}', 'home')" style="font-size:0.75rem; padding:0.25rem 0.65rem; border-radius:99px; gap:0.25rem; font-weight:700;"><span>Open Channel Page</span><span class="material-symbols-rounded" style="font-size:0.95rem;">arrow_forward</span></button></div>`
          : 'Curated Videos';
        const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
        const res = await fetch(apiUrl('/api/channels/' + targetId), { headers });
        const json = await res.json();
        videos = json.success ? json.data.videos : [];
      } else {
        heading.textContent = 'Curated Videos';
      }

      countEl.textContent = `${videos.length} video${videos.length === 1 ? '' : 's'}`;
      updateShowcaseSubscribeButton(targetId);
      if (videos.length === 0) {
        grid.innerHTML = '<p style="color:var(--text-muted);">No curated videos in this channel yet.</p>';
        return;
      }
      grid.innerHTML = videos.map(v => `
        <div class="video-card">
          <div class="video-thumb-wrap" onclick='previewVideo(${JSON.stringify(v).replace(/'/g, "&#39;")})'>
            <img src="${v.thumbnailUrl}" class="video-thumb" alt="${v.title}">
            <div class="badge-type">${v.sourceType}</div>
            <div class="badge-age">${v.ageRating}</div>
            <div class="duration-badge">${formatTime(v.duration || 180)}</div>
          </div>
          <div class="video-body">
            <div class="video-title" title="${v.title}">${v.title}</div>
            <div class="video-meta" style="cursor:pointer;" onclick='event.stopPropagation(); openChannelByVideoMeta(${JSON.stringify({ channelId: v.channelId, channelTitle: v.channelTitle }).replace(/'/g, "&#39;")})' title="View ${v.channelTitle} channel videos">
              <img src="${v.channelAvatar}" class="channel-pic">
              <span style="text-decoration:underline;">${v.channelTitle}</span>
              <span>&bull;</span>
              <span>${getVideoCategoriesByTags(v).join(' • ') || v.category}</span>
            </div>
            <div class="tag-row">
              ${(v.tags || []).slice(0, 3).map(t => `<span class="tag-chip">#${t}</span>`).join('')}
            </div>
          </div>
        </div>
      `).join('');
    }

    let searchableChannels = [];
    let searchableCategories = [];
    let activeChannelSearchCategory = 'ALL';
    let activeChannelSearchType = 'ALL';
    let activeChannelSearchAge = 'ALL';
    let channelSearchQuery = '';
    let kidSubscribedChannelIds = new Set();
    let channelSearchSubscribedOnly = false;

    async function loadKidSubscribedChannels() {
      if (!authToken) return;
      try {
        const res = await authFetch('/api/kids/channels');
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          kidSubscribedChannelIds = new Set(json.data.map(c => c.id));
          updateSubscribedChannelsCountBadge();
        }
      } catch {}
    }

    function updateSubscribedChannelsCountBadge() {
      const el = document.getElementById('subscribedChannelsCount');
      if (el) el.textContent = String(kidSubscribedChannelIds.size);
    }

    function toggleChannelSubscribedFilter() {
      channelSearchSubscribedOnly = !channelSearchSubscribedOnly;
      const btn = document.getElementById('channelSubscribedFilterPill');
      if (btn) btn.classList.toggle('active', channelSearchSubscribedOnly);
      renderChannelSearchResults();
    }

    async function toggleKidChannelSubscription(channelId, e) {
      if (e) e.stopPropagation();
      if (!authToken) {
        alert('Please sign in to subscribe to channels.');
        return;
      }
      const isSubbed = kidSubscribedChannelIds.has(channelId);
      try {
        const res = await authFetch('/api/kids/channels/' + encodeURIComponent(channelId), {
          method: isSubbed ? 'DELETE' : 'POST'
        });
        const json = await res.json();
        if (json.success) {
          if (isSubbed) {
            kidSubscribedChannelIds.delete(channelId);
          } else {
            kidSubscribedChannelIds.add(channelId);
          }
          updateSubscribedChannelsCountBadge();
          renderChannelSearchResults();
          updateShowcaseSubscribeButton(activeShowcaseChannelId);
        } else {
          alert(json.message || 'Failed to update channel subscription');
        }
      } catch {
        alert('Unable to update channel subscription');
      }
    }

    function updateShowcaseSubscribeButton(channelId) {
      const subBtn = document.getElementById('btnShowcaseChannelSubscribe');
      if (!subBtn) return;
      if (channelId && authToken) {
        const isSub = kidSubscribedChannelIds.has(channelId);
        subBtn.style.display = 'inline-flex';
        subBtn.className = `btn btn-sm ${isSub ? 'btn-secondary' : 'btn-primary'}`;
        subBtn.innerHTML = `<span class="material-symbols-rounded" style="font-size:1rem;">${isSub ? 'check' : 'add'}</span> <span>${isSub ? 'Subscribed' : 'Subscribe'}</span>`;
      } else {
        subBtn.style.display = 'none';
      }
    }

    async function onShowcaseChannelSubscribeClick() {
      if (!activeShowcaseChannelId) return;
      await toggleKidChannelSubscription(activeShowcaseChannelId);
    }

    async function loadChannelSearchPage(useKidsFeed = false) {
      const grid = document.getElementById('channelsSearchGrid');
      if (grid && !searchableChannels.length) {
        grid.innerHTML = '<p style="color:var(--text-muted);">Loading channels...</p>';
      }
      if (useKidsFeed && currentUser?.role === 'CHILD') {
        const childAge = !currentUser.ageRating || currentUser.ageRating === 'ALL' ? 'OLDER_KIDS' : currentUser.ageRating;
        activeChannelSearchAge = childAge;
        syncChannelSearchAgePills();
      }
      try {
        await Promise.all([
          loadKidSubscribedChannels(),
          loadKidYouTubeSubscriptions()
        ]);
        const [chanRes, catRes] = await Promise.all([
          useKidsFeed && authToken
            ? fetch(apiUrl('/api/kids/feed'), { headers: { Authorization: `Bearer ${authToken}` } })
            : fetch(apiUrl('/api/channels')),
          fetch(apiUrl('/api/categories'))
        ]);
        const chanJson = await chanRes.json();
        if (chanJson.success) {
          searchableChannels = (useKidsFeed && authToken)
            ? (chanJson.data?.channels || [])
            : (chanJson.data || []);
        }
        const catJson = await catRes.json().catch(() => ({}));
        if (catJson.success && Array.isArray(catJson.data)) {
          searchableCategories = catJson.data.filter(c => c.name && c.name !== 'All Videos');
        }
        renderChannelSearchCategories();
        renderChannelSearchResults();
      } catch {
        if (grid) {
          grid.innerHTML = '<p style="color:var(--text-muted);">Unable to load channels from API at ' + API_BASE + '</p>';
        }
      }
    }

    function syncChannelSearchAgePills() {
      document.querySelectorAll('#channelAgeFilters .filter-pill').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-age') === activeChannelSearchAge);
      });
    }

    function setChannelSearchAge(ageRating) {
      activeChannelSearchAge = ageRating || 'ALL';
      syncChannelSearchAgePills();
      renderChannelSearchResults();
    }

    function renderChannelSearchCategories() {
      const wrap = document.getElementById('channelCategoryFilters');
      if (!wrap) return;
      const presentCats = new Set(searchableChannels.map(c => c.category).filter(Boolean));
      const ordered = [];
      for (const cat of searchableCategories) {
        if (presentCats.has(cat.name)) ordered.push(cat);
      }
      for (const name of presentCats) {
        if (!ordered.some(c => c.name === name)) {
          ordered.push({ name, icon: 'category' });
        }
      }
      const lang = localStorage.getItem(LANG_PREF_KEY) || 'en';
      const allLabel = (I18N[lang] && I18N[lang].filter_all_categories) || 'All Categories';
      wrap.innerHTML = [
        `<button type="button" class="filter-pill ${activeChannelSearchCategory === 'ALL' ? 'active' : ''}" onclick="filterChannelsByCategory('ALL')">${allLabel}</button>`,
        ...ordered.map(c => {
          const isActive = activeChannelSearchCategory === c.name;
          const safeName = String(c.name).replace(/'/g, "\\'");
          return `<button type="button" class="filter-pill ${isActive ? 'active' : ''}" onclick="filterChannelsByCategory('${safeName}')">
            <span class="material-symbols-rounded" style="font-size:0.95rem;">${c.icon || 'tag'}</span> ${c.name}
          </button>`;
        })
      ].join('');
    }

    function filterChannelsByCategory(categoryName) {
      activeChannelSearchCategory = categoryName || 'ALL';
      renderChannelSearchCategories();
      renderChannelSearchResults();
    }

    function setChannelSearchType(type, btn) {
      activeChannelSearchType = type || 'ALL';
      document.querySelectorAll('.channel-type-pills .filter-pill').forEach(b => b.classList.remove('active'));
      if (btn) btn.classList.add('active');
      renderChannelSearchResults();
    }

    function onChannelSearchInput() {
      const input = document.getElementById('channelSearchInput');
      const clearBtn = document.getElementById('channelSearchClearBtn');
      channelSearchQuery = (input?.value || '').trim();
      if (clearBtn) clearBtn.style.display = channelSearchQuery ? 'inline-flex' : 'none';
      renderChannelSearchResults();
    }

    function clearChannelSearchQuery() {
      const input = document.getElementById('channelSearchInput');
      if (input) input.value = '';
      channelSearchQuery = '';
      const clearBtn = document.getElementById('channelSearchClearBtn');
      if (clearBtn) clearBtn.style.display = 'none';
      renderChannelSearchResults();
    }

    function clearAllChannelFilters() {
      channelSearchSubscribedOnly = false;
      document.getElementById('channelSubscribedFilterPill')?.classList.remove('active');
      activeChannelSearchCategory = 'ALL';
      activeChannelSearchType = 'ALL';
      activeChannelSearchAge = 'ALL';
      syncChannelSearchAgePills();
      document.querySelectorAll('.channel-type-pills .filter-pill').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-type') === 'ALL');
      });
      clearChannelSearchQuery();
      renderChannelSearchCategories();
      renderChannelSearchResults();
    }

    function openKidYtChannelFromChannelsPage(handle) {
      openKidTabFromHeader('search');
      openKidYouTubeChannelVideos(handle);
    }

    function renderChannelSearchResults() {
      const grid = document.getElementById('channelsSearchGrid');
      const badge = document.getElementById('channelSearchCountBadge');
      const ytSubsEl = document.getElementById('channelsYtSubsSection');
      if (!grid) return;

      if (ytSubsEl) {
        const qYt = channelSearchQuery.toLowerCase();
        const filteredYtSubs = (kidYtSubscribedChannels || []).filter(ch => {
          if (!qYt) return true;
          return `${ch.handle || ''} ${ch.title || ''}`.toLowerCase().includes(qYt);
        });
        if (authToken && filteredYtSubs.length > 0) {
          ytSubsEl.style.display = 'block';
          ytSubsEl.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.75rem; flex-wrap:wrap; gap:0.5rem;">
              <div>
                <h3 style="margin:0; font-size:1.1rem; color:#ffd166;">My Subscribed YouTube Channels (@)</h3>
                <p style="margin:0.15rem 0 0; font-size:0.8rem; color:var(--text-muted);">Parent-Trusted @channels play right away; Supervised @channels check parent approval on uncurated videos.</p>
              </div>
              <span style="font-size:0.8rem; color:var(--text-muted);">${filteredYtSubs.length} subscribed</span>
            </div>
            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:0.8rem;">
              ${filteredYtSubs.map(ch => {
                const safeHandle = (ch.handle || '').replace(/'/g, "\\'");
                const isTrusted = ch.trustLevel === 'TRUSTED';
                const trustBadge = isTrusted
                  ? '<span style="font-size:0.7rem; padding:2px 8px; border-radius:99px; background:rgba(6,214,160,0.16); color:var(--success); font-weight:700;">✓ Parent-Trusted</span>'
                  : '<span style="font-size:0.7rem; padding:2px 8px; border-radius:99px; background:rgba(255,209,102,0.16); color:#ffd166; font-weight:700;">Supervised</span>';
                return `
                  <div class="card" onclick="openKidYtChannelFromChannelsPage('${safeHandle}')" style="padding:0.85rem 1rem; display:flex; align-items:center; justify-content:space-between; gap:0.75rem; cursor:pointer;">
                    <div style="display:flex; align-items:center; gap:0.7rem; min-width:0; flex:1;">
                      ${ch.avatarUrl ? `<img src="${ch.avatarUrl}" alt="" style="width:42px; height:42px; border-radius:50%; object-fit:cover; flex-shrink:0; border:2px solid ${isTrusted ? 'var(--success)' : 'var(--accent)'};">` : ''}
                      <div style="min-width:0;">
                        <div style="font-weight:800; font-size:0.9rem; color:var(--accent); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${ch.handle}</div>
                        <div style="font-size:0.78rem; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${ch.title || ch.handle}</div>
                      </div>
                    </div>
                    ${trustBadge}
                  </div>
                `;
              }).join('')}
            </div>
          `;
        } else {
          ytSubsEl.style.display = 'none';
          ytSubsEl.innerHTML = '';
        }
      }

      const q = channelSearchQuery.toLowerCase();
      const filtered = searchableChannels.filter(c => {
        if (channelSearchSubscribedOnly && !kidSubscribedChannelIds.has(c.id)) return false;
        if (activeChannelSearchCategory !== 'ALL' && c.category !== activeChannelSearchCategory) return false;
        if (activeChannelSearchType !== 'ALL' && c.channelType !== activeChannelSearchType) return false;
        if (activeChannelSearchAge !== 'ALL') {
          const chAge = String(c.ageRating || 'ALL').toUpperCase();
          if (chAge !== activeChannelSearchAge && chAge !== 'ALL') return false;
        }
        if (q) {
          const hay = `${c.name || ''} ${c.description || ''} ${c.category || ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });

      if (badge) {
        badge.textContent = filtered.length === searchableChannels.length
          ? `${filtered.length} channels`
          : `${filtered.length} of ${searchableChannels.length} channels`;
      }

      if (!filtered.length) {
        grid.innerHTML = `
          <div class="card" style="grid-column:1 / -1; padding:2.25rem; text-align:center;">
            <span class="material-symbols-rounded" style="font-size:2.4rem; color:var(--text-muted); margin-bottom:0.5rem;">${channelSearchSubscribedOnly ? 'bookmark_border' : 'search_off'}</span>
            <h3 style="margin-bottom:0.35rem;">${channelSearchSubscribedOnly ? 'No Subscribed Channels Yet' : 'No matching channels found'}</h3>
            <p style="color:var(--text-muted); font-size:0.9rem; margin-bottom:1rem;">${channelSearchSubscribedOnly ? 'Tap "Subscribe" on any curated channel below to add it to your subscribed list!' : 'Try a different search keyword or clear the active category filter.'}</p>
            <button type="button" class="btn btn-secondary btn-sm" onclick="clearAllChannelFilters()">${channelSearchSubscribedOnly ? 'Show All Curated Channels' : 'Clear Filters'}</button>
          </div>
        `;
        return;
      }

      grid.innerHTML = filtered.map(c => {
        const isLive = c.channelType === 'LIVE_TV';
        const videoCount = c.videoCount ?? (Array.isArray(c.videoIds) ? c.videoIds.length : 0);
        const isSubscribed = kidSubscribedChannelIds.has(c.id);
        const subBtnHtml = authToken ? `
          <button type="button" class="btn btn-sm ${isSubscribed ? 'btn-secondary' : 'btn-primary'}" onclick="toggleKidChannelSubscription('${c.id}', event)" style="padding:0.25rem 0.65rem; font-size:0.75rem; border-radius:99px; gap:0.25rem;">
            <span class="material-symbols-rounded" style="font-size:0.95rem;">${isSubscribed ? 'check' : 'add'}</span>
            <span>${isSubscribed ? 'Subscribed' : 'Subscribe'}</span>
          </button>
        ` : '';
        return `
          <div class="card channel-search-card" onclick="openChannelPage('${c.id}', 'channels')">
            <div style="display:flex; align-items:center; gap:0.85rem;">
              <img src="${c.avatarUrl}" alt="${c.name}" style="width:52px; height:52px; border-radius:50%; object-fit:cover; flex-shrink:0; border:2px solid ${isLive ? 'var(--primary)' : 'var(--accent)'};">
              <div style="min-width:0; flex:1;">
                <div style="display:flex; align-items:center; gap:0.35rem;">
                  <span style="font-weight:700; font-size:1rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${c.name}</span>
                  ${c.isVerified ? '<span class="material-symbols-rounded" style="font-size:1rem; color:var(--accent); flex-shrink:0;" title="Verified Safe Channel">verified</span>' : ''}
                </div>
                <div style="font-size:0.78rem; color:var(--text-muted); margin-top:0.15rem;">${c.category} &bull; ${videoCount} videos &bull; by ${c.ownerName || 'Team FamiTube'}</div>
              </div>
            </div>
            <p style="color:var(--text-muted); font-size:0.85rem; line-height:1.45; margin:0; flex:1;">${c.description || ''}</p>
            <div style="display:flex; align-items:center; justify-content:space-between; gap:0.5rem; margin-top:0.2rem; flex-wrap:wrap;">
              <div style="display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap;">
                <span class="channel-type-badge ${isLive ? 'live' : 'ondemand'}">
                  <span class="material-symbols-rounded" style="font-size:0.88rem;">${isLive ? 'live_tv' : 'video_library'}</span>
                  ${isLive ? 'LIVE TV' : 'ON DEMAND'}
                </span>
                ${formatChannelAgeBadge(c.ageRating)}
              </div>
              <div style="display:flex; align-items:center; gap:0.5rem;">
                ${subBtnHtml}
                <span style="font-size:0.8rem; font-weight:700; color:var(--primary); display:inline-flex; align-items:center; gap:0.15rem;">
                  View Channel <span class="material-symbols-rounded" style="font-size:1rem;">arrow_forward</span>
                </span>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    let activeChannelPageData = null;
    let activeChannelPageVideos = [];
    let previousViewBeforeChannelPage = 'channels';

    async function openChannelPage(channelId, fromView) {
      if (!channelId) return;

      previousViewBeforeChannelPage = fromView || (document.getElementById('channelsSearchApp')?.style.display === 'block' ? 'channels' : 'home');

      // Hide all other top-level views
      const idsToHide = ['showcaseApp', 'channelsSearchApp', 'authGate', 'parentModeApp', 'studioApp', 'linkChannelsJson'];
      idsToHide.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });

      // Show dedicated channel page
      const channelPageEl = document.getElementById('channelDetailPage');
      if (channelPageEl) channelPageEl.style.display = 'block';

      // Update nav button styling & URL hash
      setModeButtons('channel_detail');
      if (window.location.hash !== `#channel/${channelId}`) {
        history.pushState(null, '', `#channel/${channelId}`);
      }

      // Update back button text
      const backLabel = document.getElementById('channelDetailBackLabel');
      if (backLabel) backLabel.textContent = previousViewBeforeChannelPage === 'home' ? 'Back to Home' : 'Back to Channels';

      // Reset & set loading state
      const titleEl = document.getElementById('channelDetailTitle');
      const breadcrumbEl = document.getElementById('channelBreadcrumbName');
      const descEl = document.getElementById('channelDetailDescription');
      const grid = document.getElementById('channelDetailVideoGrid');
      const emptyState = document.getElementById('channelDetailEmptyState');
      const countBadge = document.getElementById('channelVideosCountBadge');
      const headingEl = document.getElementById('channelVideosHeading');

      if (titleEl) titleEl.textContent = 'Loading Channel...';
      if (breadcrumbEl) breadcrumbEl.textContent = 'Loading...';
      if (descEl) descEl.textContent = 'Loading channel details and curated videos...';
      if (grid) grid.innerHTML = '<div style="grid-column:1 / -1; text-align:center; padding:3rem; color:var(--text-muted);"><span class="material-symbols-rounded" style="animation:spin 1s linear infinite; font-size:2.4rem;">sync</span><div style="margin-top:0.6rem; font-weight:600;">Loading channel catalog...</div></div>';
      if (emptyState) emptyState.style.display = 'none';
      window.scrollTo({ top: 0, behavior: 'smooth' });

      let channel = null;
      let videos = [];

      try {
        const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
        const ageParam = (currentUser?.role === 'CHILD' && currentUser?.ageRating && currentUser.ageRating !== 'ALL')
          ? `?ageRating=${encodeURIComponent(currentUser.ageRating)}`
          : (parentPreviewChild && parentPreviewChild.ageRating && parentPreviewChild.ageRating !== 'ALL' ? `?ageRating=${encodeURIComponent(parentPreviewChild.ageRating)}` : '');
        const res = await fetch(apiUrl(`/api/channels/${channelId}${ageParam}`), { headers });
        const json = await res.json();
        if (json.success && json.data) {
          channel = json.data.channel;
          videos = json.data.videos || [];
        }
      } catch (err) {
        console.warn('API error fetching channel:', err);
      }

      // Fallback if API returned 404 or network was offline
      if (!channel) {
        channel = (Array.isArray(searchableChannels) && searchableChannels.find(c => c.id === channelId)) ||
                  (Array.isArray(showcaseChannels) && showcaseChannels.find(c => c.id === channelId));
      }
      if (!videos.length && channel) {
        if (Array.isArray(kidsFeedVideos) && kidsFeedVideos.length) {
          videos = kidsFeedVideos.filter(v => v.channelId === channel.id || (v.channelTitle && v.channelTitle.toLowerCase() === channel.name.toLowerCase()));
        }
      }

      if (!channel) {
        if (titleEl) titleEl.textContent = 'Channel Not Found';
        if (descEl) descEl.textContent = 'This channel could not be found or is not accessible for your current profile.';
        if (grid) grid.innerHTML = '';
        if (emptyState) emptyState.style.display = 'block';
        return;
      }

      activeChannelPageData = channel;
      activeChannelPageVideos = videos;

      // Populate Title & Avatar
      if (titleEl) titleEl.textContent = channel.name;
      if (breadcrumbEl) breadcrumbEl.textContent = channel.name;

      const avatarEl = document.getElementById('channelDetailAvatar');
      if (avatarEl) {
        avatarEl.src = channel.avatarUrl || 'assets/famitube-icon.png';
        avatarEl.alt = channel.name;
      }

      const verifiedEl = document.getElementById('channelDetailVerified');
      if (verifiedEl) verifiedEl.style.display = channel.isVerified ? 'inline-block' : 'none';

      // Type & Age badges
      const isLive = channel.channelType === 'LIVE_TV';
      const typeBadge = document.getElementById('channelDetailTypeBadge');
      if (typeBadge) {
        typeBadge.className = `channel-type-badge ${isLive ? 'live' : 'ondemand'}`;
        typeBadge.innerHTML = `<span class="material-symbols-rounded" style="font-size:0.88rem;">${isLive ? 'live_tv' : 'video_library'}</span> ${isLive ? 'LIVE TV' : 'ON DEMAND'}`;
      }

      const ageBadge = document.getElementById('channelDetailAgeBadge');
      if (ageBadge) ageBadge.innerHTML = formatChannelAgeBadge(channel.ageRating);

      const catEl = document.getElementById('channelDetailCategory');
      if (catEl) catEl.textContent = channel.category || 'General';

      const countEl = document.getElementById('channelDetailVideoCount');
      if (countEl) countEl.textContent = `• ${videos.length} videos`;

      const ownerEl = document.getElementById('channelDetailOwner');
      if (ownerEl) ownerEl.textContent = `• Curated by ${channel.ownerName || 'Team FamiTube'}`;

      // Description
      if (descEl) descEl.textContent = channel.description || 'Welcome to ' + channel.name + '. Enjoy safe, age-appropriate educational and entertaining videos curated for your family.';

      // Update subscribe button
      updateChannelPageSubButton();

      // Live TV button
      const liveBtn = document.getElementById('channelDetailLiveBtn');
      if (liveBtn) {
        liveBtn.style.display = isLive ? 'inline-flex' : 'none';
      }

      // Videos heading & count badge
      if (headingEl) headingEl.textContent = `${channel.name}'s Videos`;
      if (countBadge) countBadge.textContent = `${videos.length} video${videos.length === 1 ? '' : 's'}`;

      // Render Video Grid
      if (videos.length === 0) {
        if (grid) grid.innerHTML = '';
        if (emptyState) emptyState.style.display = 'block';
      } else {
        if (emptyState) emptyState.style.display = 'none';
        if (grid) {
          grid.innerHTML = videos.map(v => `
            <div class="video-card">
              <div class="video-thumb-wrap" onclick='previewVideo(${JSON.stringify(v).replace(/'/g, "&#39;")})'>
                <img src="${v.thumbnailUrl}" class="video-thumb" alt="${v.title}">
                <div class="badge-type">${v.sourceType}</div>
                <div class="badge-age">${v.ageRating}</div>
                <div class="duration-badge">${formatTime(v.duration || 180)}</div>
              </div>
              <div class="video-body">
                <div class="video-title" title="${v.title}" onclick='previewVideo(${JSON.stringify(v).replace(/'/g, "&#39;")})' style="cursor:pointer;">${v.title}</div>
                <div class="video-meta">
                  <img src="${channel.avatarUrl}" class="channel-pic">
                  <span>${channel.name}</span>
                  <span>&bull;</span>
                  <span>${v.category || channel.category}</span>
                </div>
                <div class="tag-row">
                  ${(v.tags || []).slice(0, 3).map(t => `<span class="tag-chip">#${t}</span>`).join('')}
                </div>
              </div>
            </div>
          `).join('');
        }
      }
    }

    function backFromChannelPage() {
      if (previousViewBeforeChannelPage === 'home') {
        openHome(currentUser?.role === 'CHILD');
      } else {
        openChannelsNav();
      }
    }

    function updateChannelPageSubButton() {
      const btn = document.getElementById('channelDetailSubBtn');
      const icon = document.getElementById('channelDetailSubIcon');
      const text = document.getElementById('channelDetailSubText');
      if (!btn || !activeChannelPageData) return;
      const isSub = kidSubscribedChannelIds.has(activeChannelPageData.id);
      btn.className = `btn btn-sm ${isSub ? 'btn-secondary' : 'btn-primary'}`;
      if (icon) icon.textContent = isSub ? 'check' : 'add';
      if (text) text.textContent = isSub ? 'Subscribed' : 'Subscribe';
    }

    async function toggleActiveChannelPageSubscription(event) {
      if (!activeChannelPageData) return;
      await toggleKidChannelSubscription(activeChannelPageData.id, event);
      updateChannelPageSubButton();
    }

    function watchActiveChannelLive() {
      if (!activeChannelPageVideos.length) return;
      previewVideo(activeChannelPageVideos[0]);
    }

    async function openChannelFromSearch(channelId) {
      openChannelPage(channelId, 'channels');
    }

    function openChannelByVideoMeta(v) {
      const chId = v?.channelId ||
        (Array.isArray(searchableChannels) && searchableChannels.find(c => c.name && c.name.toLowerCase() === (v?.channelTitle || '').toLowerCase())?.id) ||
        (Array.isArray(showcaseChannels) && showcaseChannels.find(c => c.name && c.name.toLowerCase() === (v?.channelTitle || '').toLowerCase())?.id);
      if (chId) {
        openChannelPage(chId, 'home');
      } else {
        openChannelsNav();
      }
    }

    let kidSearchResults = [];
    let kidCuratedSearchResults = [];
    let kidHistoryItems = [];
    let kidHistoryVisibleLimit = 0;
    let kidPlaylists = [];
    let kidAchievementsData = null;
    let activeKidTab = 'curated';
    let kidViewingSelectedChannel = false;

    function isSimpleKidUser(user) {
      return user?.role === 'CHILD' && user.ageRating === 'TODDLER';
    }

    function updateKidToolsVisibility(user) {
      const channelsBtn = document.getElementById('kidTabBtnChannels');
      const storiesBtn = document.getElementById('kidTabBtnStories');
      const searchBtn = document.getElementById('kidTabBtnSearch');
      const favoritesBtn = document.getElementById('kidTabBtnFavorites');
      const historyBtn = document.getElementById('kidTabBtnHistory');
      const achievementsBtn = document.getElementById('kidTabBtnAchievements');
      const curatedTabBtn = document.getElementById('kidTabBtnCurated');
      const levelPill = document.getElementById('kidLevelPill');
      const famibuxPill = document.getElementById('kidFamibuxPill');
      const heroCard = document.getElementById('showcaseHeroCard');
      const guestEntryEl = document.getElementById('guestEntryView');
      const kidHub = document.getElementById('kidHomeHub');
      const curatedPanel = document.getElementById('showcaseCuratedPanel');

      const isChild = user?.role === 'CHILD';
      const profileKidStatsRow = document.getElementById('profileKidStatsRow');
      const headerTimePill = document.getElementById('headerTimePill');
      const headerParentalBtn = document.getElementById('headerParentalBtn');
      const profileParentalBtn = document.getElementById('profileParentalBtn');

      if (profileKidStatsRow) profileKidStatsRow.style.display = isChild ? 'flex' : 'none';
      if (headerTimePill) headerTimePill.style.display = isChild ? 'inline-flex' : 'none';
      if (headerParentalBtn) headerParentalBtn.style.display = 'none';
      if (profileParentalBtn) profileParentalBtn.style.display = isChild ? 'flex' : 'none';
      if (levelPill) levelPill.style.display = 'none';
      if (famibuxPill) famibuxPill.style.display = 'none';

      if (heroCard) {
        heroCard.style.display = 'none';
      }
      const kidNavBtns = [curatedTabBtn, storiesBtn, channelsBtn, searchBtn, favoritesBtn, historyBtn, achievementsBtn];
      if (!user || !authToken) {
        kidNavBtns.forEach(btn => { if (btn) btn.style.display = 'none'; });
        if (guestEntryEl) guestEntryEl.style.display = 'flex';
        if (kidHub) kidHub.style.display = 'none';
        if (curatedPanel) curatedPanel.style.display = 'none';
        return;
      }
      if (guestEntryEl) guestEntryEl.style.display = 'none';

      if (!isChild) {
        kidNavBtns.forEach(btn => { if (btn) btn.style.display = 'none'; });
        if (kidHub) kidHub.style.display = 'none';
        return;
      }

      const simpleMode = isSimpleKidUser(user);
      const isYoungOrToddler = user?.ageRating === 'TODDLER' || user?.ageRating === 'YOUNG_KIDS';
      if (curatedTabBtn) {
        curatedTabBtn.style.display = 'inline-flex';
        curatedTabBtn.innerHTML = `<span class="material-symbols-rounded" style="font-size:1.05rem;">${simpleMode ? 'tv' : 'home'}</span> ${simpleMode ? 'TV Channels' : 'Explore'}`;
      }
      if (storiesBtn) storiesBtn.style.display = isYoungOrToddler ? 'inline-flex' : 'none';
      if (channelsBtn) channelsBtn.style.display = simpleMode ? 'none' : 'inline-flex';
      if (searchBtn) searchBtn.style.display = simpleMode ? 'none' : 'inline-flex';
      if (favoritesBtn) favoritesBtn.style.display = simpleMode ? 'inline-flex' : 'none';
      if (historyBtn) historyBtn.style.display = 'none';
      if (achievementsBtn) achievementsBtn.style.display = 'none';

      const favSub = document.getElementById('profileFavoritesSubtitle');
      if (favSub) favSub.textContent = `${getKidFavorites().length} Saved Videos`;


      updateKidTimePill();
      updateKidSearchQuotaBadge(user);
      if (IS_DEV_STAGE) {
        const appPreviewEl = document.getElementById('navAppPreview');
        if (appPreviewEl) appPreviewEl.style.display = 'inline-flex';
      }
      switchKidShowcaseTab(activeKidTab || 'curated');
    }

    function updateKidSearchQuotaBadge(settings) {
      const badge = document.getElementById('kidSearchQuotaBadge');
      if (!badge) return;
      const limit = settings?.searchViewLimit ?? 0;
      const used = settings?.searchViewsUsed ?? 0;
      const reqApproval = settings?.searchRequireApproval !== false;
      const limitText = limit > 0 ? `${used} / ${limit} searched videos used` : `${used} searched videos watched (Unlimited)`;
      badge.textContent = `${limitText}${reqApproval ? ' • Parent approval required' : ''}`;
    }

    function openKidTabFromHeader(tab) {
      if (window.location.hash === '#channels') {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
      document.getElementById('linkChannelsJson').style.display = 'none';
      document.getElementById('showcaseApp').style.display = 'block';
      document.getElementById('channelsSearchApp').style.display = 'none';
      const chanPageKid = document.getElementById('channelDetailPage');
      if (chanPageKid) chanPageKid.style.display = 'none';
      document.getElementById('authGate').style.display = 'none';
      document.getElementById('parentModeApp').style.display = 'none';
      document.getElementById('studioApp').style.display = 'none';
      setModeButtons('showcase');
      switchKidShowcaseTab(tab);
    }

    function switchKidShowcaseTab(tab, keepSelectedChannel = false) {
      if (typeof stopStoryAudioAndMic === 'function') stopStoryAudioAndMic();
      if (tab === 'history') tab = 'search';
      if (tab === 'achievements') tab = 'curated';
      if (tab === 'search' && currentUser?.role === 'CHILD' && currentUser?.ageRating === 'TODDLER') {
        tab = 'curated';
      }
      activeKidTab = tab || 'curated';
      if (!keepSelectedChannel) {
        kidViewingSelectedChannel = false;
      }
      const isChild = currentUser?.role === 'CHILD' || Boolean(parentPreviewChild);
      const curatedEl = document.getElementById('showcaseCuratedPanel');
      const featuredChannelsSection = document.getElementById('showcaseFeaturedChannelsSection');
      const backToExploreBtn = document.getElementById('btnBackToKidExplore');
      const kidHubEl = document.getElementById('kidHomeHub');
      const storiesEl = document.getElementById('kidStoriesPanel');
      const searchEl = document.getElementById('kidYouTubeSearchPanel');
            const achievementsEl = document.getElementById('kidAchievementsPanel');
      const favoritesEl = document.getElementById('kidFavoritesPanel');

      if (!currentUser || !authToken) {
        if (kidHubEl) kidHubEl.style.display = 'none';
        if (curatedEl) curatedEl.style.display = 'none';
      } else if (isChild) {
        const showSelectedChannel = activeKidTab === 'curated' && kidViewingSelectedChannel;
        if (kidHubEl) kidHubEl.style.display = (activeKidTab === 'curated' && !kidViewingSelectedChannel) ? 'block' : 'none';
        if (curatedEl) curatedEl.style.display = showSelectedChannel ? 'block' : 'none';
        if (featuredChannelsSection) featuredChannelsSection.style.display = showSelectedChannel ? 'none' : 'block';
        if (backToExploreBtn) backToExploreBtn.style.display = showSelectedChannel ? 'inline-flex' : 'none';
      } else {
        if (kidHubEl) kidHubEl.style.display = 'none';
        if (curatedEl) curatedEl.style.display = activeKidTab === 'curated' ? 'block' : 'none';
        if (featuredChannelsSection) featuredChannelsSection.style.display = 'block';
        if (backToExploreBtn) backToExploreBtn.style.display = 'none';
      }
      if (storiesEl) storiesEl.style.display = activeKidTab === 'stories' ? 'block' : 'none';
      if (searchEl) searchEl.style.display = activeKidTab === 'search' ? 'block' : 'none';
      if (achievementsEl) achievementsEl.style.display = activeKidTab === 'achievements' ? 'block' : 'none';
      if (favoritesEl) favoritesEl.style.display = activeKidTab === 'favorites' ? 'block' : 'none';

      document.getElementById('kidTabBtnCurated')?.classList.toggle('active', activeKidTab === 'curated');
      document.getElementById('kidTabBtnStories')?.classList.toggle('active', activeKidTab === 'stories');
      document.getElementById('kidTabBtnChannels')?.classList.remove('active');
      document.getElementById('kidTabBtnSearch')?.classList.toggle('active', activeKidTab === 'search');
      document.getElementById('kidTabBtnAchievements')?.classList.toggle('active', activeKidTab === 'achievements');
      document.getElementById('kidTabBtnFavorites')?.classList.toggle('active', activeKidTab === 'favorites');

      if (activeKidTab === 'curated' && isChild) renderKidHomeHub(currentUser);
      if (activeKidTab === 'stories' && typeof loadAndRenderKidStories === 'function') loadAndRenderKidStories();
      if (activeKidTab === 'search') {
        loadKidYouTubeSubscriptions();
        const input = document.getElementById('kidYouTubeSearchInput');
        const q = (input?.value || '').trim();
        if (q || activeKidYtChannelDetail) {
          renderKidYouTubeSearchResults();
        } else {
          const resultsEl = document.getElementById('kidYouTubeSearchResults');
          if (resultsEl) resultsEl.innerHTML = '';
        }
      }
      if (activeKidTab === 'favorites') {
        renderKidFavorites();
        if (!isSimpleKidUser(currentUser)) {
          loadKidPlaylists();
          loadKidHistory();
        }
      }
    }

        function famibuxIconHtml(size = 18) {
      return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" style="vertical-align:middle; display:inline-block; filter: drop-shadow(0 2px 4px rgba(251,133,0,0.3)); flex-shrink:0;">
        <circle cx="12" cy="12" r="10" fill="url(#famibuxGoldGrad)" stroke="#E09F00" stroke-width="1.5"/>
        <circle cx="12" cy="12" r="8.2" stroke="rgba(255,255,255,0.3)" stroke-width="0.75" stroke-dasharray="1.5 1"/>
        <!-- Vertical coin strike line crossing through -->
        <line x1="11" y1="4.5" x2="11" y2="19.5" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round"/>
        <!-- Letter F stem -->
        <rect x="9.8" y="6" width="2.4" height="11.5" rx="1.2" fill="#FFFFFF"/>
        <!-- Letter F top bar -->
        <path d="M10 6H16.2C16.9 6 17.4 6.5 17.4 7.2C17.4 7.9 16.9 8.4 16.2 8.4H10V6Z" fill="#FFFFFF"/>
        <!-- Horizontal crossing coin bar going across the stem -->
        <path d="M6.5 11.2H15C15.7 11.2 16.2 11.7 16.2 12.4C16.2 13.1 15.7 13.6 15 13.6H6.5C5.8 13.6 5.3 13.1 5.3 12.4C5.3 11.7 5.8 11.2 6.5 11.2Z" fill="#FFFFFF"/>
        <defs>
          <linearGradient id="famibuxGoldGrad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
            <stop stop-color="#FFE066"/>
            <stop offset="0.6" stop-color="#FFB703"/>
            <stop offset="1" stop-color="#FB8500"/>
          </linearGradient>
        </defs>
      </svg>`;
    }

    async function loadKidAchievements() {
      if (!authToken) return;
      try {
        const res = await authFetch('/api/kids/achievements');
        const json = await res.json();
        if (!json.success || !json.data) return;
        kidAchievementsData = json.data;
        const famibuxCount = json.data.famibux ?? json.data.stars ?? 0;
        const headerStars = document.getElementById('headerStarsCount');
        if (headerStars) {
          headerStars.textContent = String(famibuxCount);
        }
        const headerFamibux = document.getElementById('headerFamibuxCount');
        if (headerFamibux) {
          headerFamibux.textContent = String(famibuxCount);
        }
        const profileLevelTitle = document.getElementById('profileLevelTitle');
        if (profileLevelTitle) {
          profileLevelTitle.textContent = `Lv.${json.data.level} ${json.data.levelTitle}`;
        }
        const profileBadgesSubtitle = document.getElementById('profileBadgesSubtitle');
        if (profileBadgesSubtitle) {
          profileBadgesSubtitle.textContent = `${json.data.unlockedCount} of ${json.data.totalCount} Badges Unlocked`;
        }
        const pill = document.getElementById('kidLevelPill');
        if (pill) {
          pill.textContent = `🏆 ${json.data.unlockedCount} Badges • Lv.${json.data.level} ${json.data.levelTitle}`;
        }
        renderKidAchievements();
      } catch {
        // Ignore transient network failures
      }
    }

    function renderKidAchievements() {
      const heroEl = document.getElementById('kidAchievementsHero');
      const statsEl = document.getElementById('kidAchievementsStats');
      const gridEl = document.getElementById('kidAchievementsGrid');
      const d = kidAchievementsData;
      if (!d || !heroEl || !statsEl || !gridEl) return;

      const famibux = d.famibux ?? d.stars ?? 0;
      const nextBadges = d.nextLevelBadges ?? d.nextLevelStars ?? d.totalCount;

      heroEl.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:1rem; flex-wrap:wrap; margin-bottom:0.9rem;">
          <div>
            <div style="font-size:0.82rem; font-weight:700; color:#ffd166; text-transform:uppercase; letter-spacing:0.06em;">Level ${d.level} Explorer</div>
            <h3 style="font-size:1.5rem; margin:0.15rem 0;">${d.levelTitle}</h3>
            <p style="color:var(--text-muted); font-size:0.88rem;">${d.unlockedCount} of ${d.totalCount} badges unlocked • Badges level you up!</p>
          </div>
          <div style="text-align:right;">
            <div style="font-size:1.9rem; font-weight:800; color:#ffb703; display:inline-flex; align-items:center; gap:0.4rem;">
              ${famibuxIconHtml(28)} ${famibux}
            </div>
            <div style="font-size:0.8rem; color:var(--text-muted); margin-top:0.15rem;">
              Famibux Currency
            </div>
            <div style="font-size:0.78rem; color:#ffd166; margin-top:0.2rem;">
              ${d.level === 5 ? 'Max Level Reached!' : `Next level at ${nextBadges} badges`}
            </div>
          </div>
        </div>
        <div style="height:10px; background:rgba(255,255,255,0.08); border-radius:99px; overflow:hidden;">
          <div style="height:100%; width:${d.progressPercent}%; background:linear-gradient(90deg, #ff2e93, #ffd166); border-radius:99px; transition:width 0.3s ease;"></div>
        </div>
      `;

      const s = d.stats || {};
      const statCards = [
        { label: 'Videos Watched', value: s.videosWatched ?? 0, icon: '🎬' },
        { label: 'My Lists', value: s.playlistsCreated ?? 0, icon: '🎵' },
        { label: 'Approved Searches', value: s.approvedSearches ?? 0, icon: '🔍' }
      ];
      statsEl.innerHTML = statCards.map((c) => `
        <div class="card" style="padding:1rem; text-align:center;">
          <div style="font-size:1.5rem; margin-bottom:0.25rem;">${c.icon}</div>
          <div style="font-size:1.35rem; font-weight:800;">${c.value}</div>
          <div style="font-size:0.8rem; color:var(--text-muted);">${c.label}</div>
        </div>
      `).join('');

      gridEl.innerHTML = (d.achievements || []).map((a) => {
        const pct = Math.min(100, Math.round(((a.progress || 0) / (a.target || 1)) * 100));
        const reward = a.rewardFamibux ?? a.rewardStars ?? 0;
        return `
          <div class="card" style="padding:1.1rem; border:${a.unlocked ? '1px solid rgba(255,209,102,0.55)' : '1px solid var(--border)'}; opacity:${a.unlocked ? '1' : '0.78'};">
            <div style="display:flex; align-items:center; gap:0.75rem; margin-bottom:0.6rem;">
              <div style="width:46px; height:46px; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:1.6rem; background:${a.unlocked ? 'rgba(255,209,102,0.18)' : 'rgba(255,255,255,0.06)'};">
                ${a.icon}
              </div>
              <div style="flex:1;">
                <div style="font-weight:700; font-size:0.98rem;">${a.title}</div>
                <div style="font-size:0.78rem; color:${a.unlocked ? '#06d6a0' : '#ffb703'}; font-weight:700; display:flex; align-items:center; gap:0.3rem;">
                  ${a.unlocked ? 'Unlocked!' : `+${reward} ${famibuxIconHtml(14)} Famibux`}
                </div>
              </div>
            </div>
            <p style="font-size:0.84rem; color:var(--text-muted); margin-bottom:0.7rem;">${a.description}</p>
            <div style="display:flex; justify-content:space-between; font-size:0.76rem; color:var(--text-muted); margin-bottom:0.3rem;">
              <span>Progress</span>
              <span>${a.progress} / ${a.target}</span>
            </div>
            <div style="height:6px; background:rgba(255,255,255,0.08); border-radius:99px; overflow:hidden;">
              <div style="height:100%; width:${pct}%; background:${a.unlocked ? '#06d6a0' : 'var(--primary)'}; border-radius:99px;"></div>
            </div>
          </div>
        `;
      }).join('');
    }

    let kidHomeCategoriesCache = [];
    let kidHomeSelectedTopic = null;
    let kidCuratedVisibleLimit = 5;
    let kidYtVisibleLimit = 10;

    function kidTopicEmoji(name, isToddler = false) {
      const lower = String(name || '').toLowerCase();
      if (isToddler) {
        if (lower.includes('animal') || lower.includes('nature')) return '🐶';
        if (lower.includes('cartoon') || lower.includes('fun')) return '🧸';
        if (lower.includes('craft') || lower.includes('art')) return '🎨';
        if (lower.includes('yoga') || lower.includes('active')) return '🤸';
        if (lower.includes('learn') || lower.includes('abc')) return '🔤';
        if (lower.includes('music') || lower.includes('rhyme')) return '🎵';
        if (lower.includes('stor') || lower.includes('read')) return '📖';
        return '🎬';
      }
      if (lower.includes('animal') || lower.includes('nature')) return '🦁';
      if (lower.includes('cartoon') || lower.includes('fun')) return '🎨';
      if (lower.includes('craft') || lower.includes('art')) return '✂️';
      if (lower.includes('discovery') || lower.includes('world')) return '🌍';
      if (lower.includes('yoga') || lower.includes('active')) return '🤸';
      if (lower.includes('learn') || lower.includes('abc')) return '📚';
      if (lower.includes('music') || lower.includes('rhyme')) return '🎵';
      if (lower.includes('science') || lower.includes('space')) return '🚀';
      if (lower.includes('math') || lower.includes('coding')) return '🔢';
      if (lower.includes('stor') || lower.includes('read')) return '📖';
      if (lower.includes('game') || lower.includes('gaming')) return '🎮';
      if (lower.includes('hobb') || lower.includes('diy')) return '🛠️';
      if (lower.includes('sport') || lower.includes('outdoor')) return '⚽';
      if (lower.includes('cook') || lower.includes('bak')) return '🧁';
      return '🎬';
    }

    const TODDLER_ALLOWED_TOPICS = new Set([
      'cartoons & fun',
      'learning & abcs',
      'music & rhymes',
      'animals & nature',
      'art & crafts',
      'stories & reading',
      'kids yoga & active'
    ]);

    function isToddlerTopic(name) {
      return TODDLER_ALLOWED_TOPICS.has(String(name || '').trim().toLowerCase());
    }

    function kidDisplayTopicTitle(name, isToddler) {
      if (!isToddler) return name;
      const lower = String(name || '').trim().toLowerCase();
      if (lower === 'music & rhymes') return 'Songs & Rhymes';
      if (lower === 'animals & nature') return 'Cute Animals';
      if (lower === 'cartoons & fun') return 'Cartoons & Fun';
      if (lower === 'learning & abcs') return 'ABCs & Colors';
      if (lower === 'stories & reading') return 'Bedtime Stories';
      if (lower === 'art & crafts') return 'Colors & Play';
      if (lower === 'kids yoga & active') return 'Sing & Dance';
      return name;
    }

    function kidTopicImage(name, isToddler = false) {
      const lower = String(name || '').toLowerCase();
      if (isToddler) {
        if (lower.includes('animal') || lower.includes('nature')) return 'assets/topics/toddler-animals.jpg';
        if (lower.includes('cartoon') || lower.includes('fun')) return 'assets/topics/toddler-cartoons.jpg';
        if (lower.includes('craft') || lower.includes('art')) return 'assets/topics/toddler-art.jpg';
        if (lower.includes('yoga') || lower.includes('active')) return 'assets/topics/toddler-dance.jpg';
        if (lower.includes('learn') || lower.includes('abc')) return 'assets/topics/toddler-abcs.jpg';
        if (lower.includes('music') || lower.includes('rhyme')) return 'assets/topics/toddler-music.jpg';
        if (lower.includes('stor') || lower.includes('read')) return 'assets/topics/toddler-stories.jpg';
      }
      if (lower.includes('animal') || lower.includes('nature')) return 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600&h=400&fit=crop';
      if (lower.includes('cartoon') || lower.includes('fun')) return 'https://images.unsplash.com/photo-1587654780291-39c9404d746b?w=600&h=400&fit=crop';
      if (lower.includes('craft') || lower.includes('art')) return 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=600&h=400&fit=crop';
      if (lower.includes('discovery') || lower.includes('world')) return 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600&h=400&fit=crop';
      if (lower.includes('yoga') || lower.includes('active')) return 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=600&h=400&fit=crop';
      if (lower.includes('learn') || lower.includes('abc')) return 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=600&h=400&fit=crop';
      if (lower.includes('music') || lower.includes('rhyme')) return 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&h=400&fit=crop';
      if (lower.includes('science') || lower.includes('space')) return 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=600&h=400&fit=crop';
      if (lower.includes('math') || lower.includes('coding')) return 'https://images.unsplash.com/photo-1515879218367-8466d910aaa4?w=600&h=400&fit=crop';
      if (lower.includes('stor') || lower.includes('read')) return 'https://images.unsplash.com/photo-1512820790803-83ca734da794?w=600&h=400&fit=crop';
      if (lower.includes('game') || lower.includes('gaming')) return 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600&h=400&fit=crop';
      if (lower.includes('hobb') || lower.includes('diy')) return 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=600&h=400&fit=crop';
      if (lower.includes('sport') || lower.includes('outdoor')) return 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=600&h=400&fit=crop';
      if (lower.includes('cook') || lower.includes('bak')) return 'https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=600&h=400&fit=crop';
      return 'https://images.unsplash.com/photo-1579202673506-ca3ce28943ef?w=600&h=400&fit=crop';
    }

    let webToddlerTvData = null;
    let webToddlerActiveTopic = null;
    let webToddlerPhaseTimer = null;
    let webToddlerTickTimer = null;
    let webToddlerSessionWatchedSec = 0;

    function getWebToddlerStorageKey() {
      return `famitube_toddler_tv_${currentUser?.id || 'guest'}`;
    }

    function readWebToddlerLocalState() {
      try {
        const raw = localStorage.getItem(getWebToddlerStorageKey());
        return raw ? JSON.parse(raw) : { playheads: {}, cooldownUntil: 0, sessionWatchedSec: 0 };
      } catch {
        return { playheads: {}, cooldownUntil: 0, sessionWatchedSec: 0 };
      }
    }

    function writeWebToddlerLocalState(st) {
      try {
        localStorage.setItem(getWebToddlerStorageKey(), JSON.stringify(st));
      } catch {}
    }

    function getWebToddlerCooldownUntilMs() {
      const local = readWebToddlerLocalState();
      const serverMs = webToddlerTvData?.cooldownUntil ? Date.parse(webToddlerTvData.cooldownUntil) : 0;
      return Math.max(Number(local.cooldownUntil || 0), Number.isFinite(serverMs) ? serverMs : 0);
    }

    async function wakeWebToddlerTvWithPin() {
      const pin = prompt('Grown-Ups Only: Enter 4-digit Parent PIN to wake Toddler TV:');
      if (!pin) return;
      try {
        const res = await authFetch('/api/kids/toddler-tv/cooldown', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'WAKE', pin: pin.trim() })
        });
        const json = await res.json();
        if (!res.ok || !json.success) return alert(json.message || 'Incorrect Parent PIN');
        const st = readWebToddlerLocalState();
        st.cooldownUntil = 0;
        st.sessionWatchedSec = 0;
        writeWebToddlerLocalState(st);
        webToddlerSessionWatchedSec = 0;
        if (webToddlerTvData) webToddlerTvData.cooldownUntil = null;
        if (currentUser) renderKidHomeHub(currentUser);
      } catch {
        alert('Could not verify PIN.');
      }
    }

    async function renderKidHomeHub(user) {
      const hub = document.getElementById('kidHomeHub');
      if (!hub || user?.role !== 'CHILD') return;
      hub.style.display = 'block';
      const isToddler = user.ageRating === 'TODDLER';

      if (isToddler) {
        try {
          const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
          const childParam = parentPreviewChild?.id ? `?childId=${encodeURIComponent(parentPreviewChild.id)}` : '';
          const res = await fetch(apiUrl('/api/kids/toddler-tv' + childParam), { headers });
          const json = await res.json();
          if (json.success && json.data) {
            webToddlerTvData = json.data;
          }
        } catch {}

        const channels = webToddlerTvData?.channels || WEB_TODDLER_TV_CHANNELS.slice(0, 6).map(c => ({ ...c, videos: [] }));
        const loopMins = webToddlerTvData?.settings?.toddlerLoopMinutes || 15;
        const cooldownUntilMs = getWebToddlerCooldownUntilMs();
        const isCooling = cooldownUntilMs > Date.now();
        const minsLeft = isCooling ? Math.max(1, Math.ceil((cooldownUntilMs - Date.now()) / 60000)) : 0;

        hub.innerHTML = `
          <div style="display:flex; align-items:center; justify-content:space-between; gap:1rem; flex-wrap:wrap; margin-bottom:1rem;">
            <div>
              <h2 style="font-family:'Fredoka',cursive; font-size:1.55rem; margin:0 0 0.25rem 0;">${isCooling ? '🌙 Shhh... Toddler TV is Napping' : '📺 Toddler TV Channels'}</h2>
              <p style="color:var(--text-muted); font-size:0.9rem; margin:0;">
                ${isCooling
                  ? `Wakes up in <strong>${minsLeft}m</strong> • Time to play with toys!`
                  : `Tap a picture channel to tune in • 1 Loop (${loopMins}m) per session`}
              </p>
            </div>
            ${isCooling ? `
              <button type="button" class="btn btn-secondary btn-sm" onclick="wakeWebToddlerTvWithPin()">🔒 Grown-Ups Wake TV (PIN)</button>
            ` : ''}
          </div>
          <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(210px, 1fr)); gap:1rem;">
            ${channels.map(ch => `
              <button type="button" onclick="tuneWebToddlerChannel('${ch.topic.replace(/'/g, "\\'")}')" style="position:relative; height:172px; cursor:pointer; background:var(--surface); border:2px solid ${isCooling ? 'var(--border)' : 'var(--primary)'}; border-radius:22px; overflow:hidden; padding:0; text-align:left; color:#fff; font-family:inherit; opacity:${isCooling ? '0.62' : '1'}; transition:transform 0.15s ease;">
                <img src="${kidTopicImage(ch.topic, true)}" alt="${ch.displayTitle}" loading="lazy" style="width:100%; height:100%; object-fit:cover; display:block; ${isCooling ? 'filter:grayscale(45%) brightness(0.6);' : ''}">
                <div style="position:absolute; inset:0; background:linear-gradient(180deg, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.16) 54%, rgba(0,0,0,0.82) 100%);"></div>
                <span style="position:absolute; top:10px; left:10px; background:rgba(0,0,0,0.58); border-radius:10px; padding:3px 8px; font-size:1.35rem; line-height:1.2;">${isCooling ? '😴' : ch.emoji}</span>
                ${isCooling ? `<span style="position:absolute; top:10px; right:10px; background:rgba(15,23,42,0.86); color:#93C5FD; font-size:0.72rem; font-weight:800; padding:3px 8px; border-radius:99px;">Napping</span>` : ''}
                <span style="position:absolute; left:14px; right:14px; bottom:12px; font-weight:800; font-size:1rem; line-height:1.2; text-shadow:0 1px 4px rgba(0,0,0,0.8);">${ch.displayTitle}</span>
              </button>
            `).join('')}
          </div>
        `;
        return;
      }

      if (!kidHomeCategoriesCache.length) {
        try {
          const res = await fetch(apiUrl('/api/categories'));
          const json = await res.json();
          if (json.success && Array.isArray(json.data)) {
            kidHomeCategoriesCache = json.data.filter(c => c.name !== 'All Videos');
          }
        } catch {}
      }

      const canSearch = !isToddler && user.youtubeSearchEnabled !== false;
      const visibleCategories = isToddler
        ? kidHomeCategoriesCache.filter(c => isToddlerTopic(c.name))
        : kidHomeCategoriesCache;
      if (isToddler && kidHomeSelectedTopic && !isToddlerTopic(kidHomeSelectedTopic)) {
        kidHomeSelectedTopic = null;
      }

      if (!kidHomeSelectedTopic) {
        hub.innerHTML = `
          <div style="display:flex; align-items:center; justify-content:space-between; gap:1rem; flex-wrap:wrap; margin-bottom:1rem;">
            <div>
              <h2 style="font-family:'Fredoka',cursive; font-size:1.55rem; margin:0 0 0.25rem 0;">${isToddler ? 'Pick a Picture!' : 'Pick a Topic'}</h2>
              <p style="color:var(--text-muted); font-size:0.9rem; margin:0;">${isToddler ? 'Tap a picture below to see safe videos.' : 'Tap a picture topic or search safe videos.'}</p>
            </div>
            ${canSearch ? `
              <button type="button" class="btn btn-secondary" onclick="switchKidShowcaseTab('search'); setTimeout(() => document.getElementById('kidYouTubeSearchInput')?.focus(), 50);" style="display:inline-flex; align-items:center; gap:0.45rem; border-radius:99px;">
                <span class="material-symbols-rounded" style="font-size:1.05rem; color:var(--secondary);">search</span>
                <span>Search Videos</span>
              </button>
            ` : ''}
          </div>
          <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(185px, 1fr)); gap:0.95rem;">
            ${visibleCategories.map(c => {
              const displayLabel = kidDisplayTopicTitle(c.name, isToddler);
              return `
              <button type="button" onclick="selectKidHubTopic('${c.name.replace(/'/g, "\\'")}')" style="position:relative; height:${isToddler ? '160px' : '142px'}; cursor:pointer; background:var(--surface); border:2px solid var(--border); border-radius:20px; overflow:hidden; padding:0; text-align:left; color:#fff; font-family:inherit; transition:transform 0.15s ease, border-color 0.15s ease;" onmouseover="this.style.borderColor='var(--primary)'; this.style.transform='translateY(-2px)'" onmouseout="this.style.borderColor='var(--border)'; this.style.transform='none'">
                <img src="${kidTopicImage(c.name, isToddler)}" alt="${displayLabel}" loading="lazy" style="width:100%; height:100%; object-fit:cover; display:block;">
                <div style="position:absolute; inset:0; background:${isToddler ? 'linear-gradient(180deg, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.12) 56%, rgba(0,0,0,0.78) 100%)' : 'linear-gradient(180deg, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.38) 50%, rgba(0,0,0,0.88) 100%)'};"></div>
                <span style="position:absolute; top:10px; left:10px; background:rgba(0,0,0,0.58); border-radius:10px; padding:3px 8px; font-size:${isToddler ? '1.35rem' : '1.1rem'}; line-height:1.2;">${kidTopicEmoji(c.name, isToddler)}</span>
                <span style="position:absolute; left:12px; right:12px; bottom:10px; font-weight:800; font-size:0.95rem; line-height:1.2; text-shadow:0 1px 4px rgba(0,0,0,0.8);">${displayLabel}</span>
              </button>
            `;}).join('')}
          </div>
        `;
      } else {
        hub.innerHTML = `
          <div style="display:flex; align-items:center; gap:0.85rem; margin-bottom:1rem; flex-wrap:wrap;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="selectKidHubTopic(null)">
              <span class="material-symbols-rounded" style="font-size:1rem;">arrow_back</span> All Topics
            </button>
            <h2 style="font-family:'Fredoka',cursive; font-size:1.35rem; margin:0;">${kidTopicEmoji(kidHomeSelectedTopic, isToddler)} ${kidDisplayTopicTitle(kidHomeSelectedTopic, isToddler)}</h2>
          </div>
          ${kidHomeSelectedTopic === 'Stories & Reading' ? `
            <div class="card" style="padding:1rem 1.25rem; margin-bottom:1rem; display:flex; align-items:center; justify-content:space-between; gap:1rem; flex-wrap:wrap; background:linear-gradient(135deg, rgba(255,51,102,0.12), rgba(76,201,240,0.12)); border-color:rgba(255,51,102,0.35);">
              <div>
                <div style="font-weight:800; font-size:1rem;">📖 Flip-Page Storybooks &amp; Read-Along</div>
                <div style="font-size:0.84rem; color:var(--text-muted);">Read illustrated stories page by page or practice reading aloud with your microphone!</div>
              </div>
              <button type="button" class="btn btn-primary btn-sm" onclick="switchKidShowcaseTab('stories')">
                <span class="material-symbols-rounded" style="font-size:1rem;">menu_book</span> Open Storybooks
              </button>
            </div>
          ` : ''}
          <div id="kidHubTopicVideos" class="video-grid"><p style="color:var(--text-muted);">Loading safe videos...</p></div>
        `;
        const effectiveAge = isToddler ? 'TODDLER' : (!user.ageRating || user.ageRating === 'ALL' ? 'OLDER_KIDS' : user.ageRating);
        loadKidHubTopicVideos(kidHomeSelectedTopic, effectiveAge);
      }
    }

    function selectKidHubTopic(topicName) {
      kidHomeSelectedTopic = kidHomeSelectedTopic === topicName ? null : topicName;
      if (currentUser) renderKidHomeHub(currentUser);
    }

    async function loadKidHubTopicVideos(topicName, ageRating) {
      const container = document.getElementById('kidHubTopicVideos');
      if (!container) return;
      try {
        const params = new URLSearchParams();
        params.set('category', topicName);
        if (ageRating && ageRating !== 'ALL') params.set('ageRating', ageRating);
        const res = await fetch(apiUrl('/api/videos?' + params.toString()));
        const json = await res.json();
        const videos = (json.success ? (json.data || []) : [])
          .slice()
          .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
        if (!videos.length) {
          container.innerHTML = `<p style="color:var(--text-muted);">No videos in ${topicName} right now.</p>`;
          return;
        }
        videos.forEach(v => { if (v?.id) kidVideoById.set(v.id, v); });
        container.innerHTML = videos.map(v => renderKidVideoCardHtml(v)).join('');
      } catch {
        container.innerHTML = '<p style="color:var(--text-muted);">Could not load videos.</p>';
      }
    }

    function renderKidVideoCardHtml(v) {
      const fav = isKidFavorite(v.id);
      return `
        <div class="card video-card" style="position:relative;">
          <div class="video-thumb" onclick="openPlayer('${v.id}')" style="cursor:pointer; position:relative;">
            <img src="${v.thumbnailUrl}" alt="${v.title}" loading="lazy">
            <div class="badge-type">${v.sourceType}</div>
            <div class="badge-age">${v.ageRating}</div>
            <div class="play-overlay"><span class="material-symbols-rounded">play_arrow</span></div>
            ${fav ? `<div style="position:absolute; bottom:6px; right:6px; width:26px; height:26px; border-radius:50%; background:rgba(255,46,147,0.92); color:#fff; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 5px rgba(0,0,0,0.4);"><span class="material-symbols-rounded" style="font-size:16px;">favorite</span></div>` : ''}
          </div>
          <div class="video-info" style="display:flex; align-items:flex-start; justify-content:space-between; gap:0.5rem;">
            <div onclick="openPlayer('${v.id}')" style="cursor:pointer; min-width:0; flex:1;">
              <div style="font-size:0.76rem; color:var(--text-muted); margin-bottom:0.25rem;">${v.channelTitle}</div>
              <div class="video-title">${v.title}</div>
            </div>
            <button type="button" onclick="event.stopPropagation(); toggleKidFavorite('${v.id}')" title="${fav ? 'Remove from Favorites' : 'Save to Favorites'}" style="background:none; border:none; cursor:pointer; padding:0.25rem; color:${fav ? '#ff2e93' : 'var(--text-muted)'}; flex-shrink:0;">
              <span class="material-symbols-rounded" style="font-size:1.3rem;">${fav ? 'favorite' : 'favorite_border'}</span>
            </button>
          </div>
        </div>
      `;
    }

    // --- Kid Favorites (matching Android FavoritesScreen) ---
    function getKidFavoritesStorageKey() {
      return `famitube_favorites_${currentUser?.id || 'guest'}`;
    }

    function getKidFavorites() {
      try {
        const raw = localStorage.getItem(getKidFavoritesStorageKey());
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
      } catch {
        return [];
      }
    }

    function isKidFavorite(videoId) {
      return getKidFavorites().some(v => v.id === videoId);
    }

    let kidFavActiveList = null;

    function kidEsc(s) {
      return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function kidVideoToListItem(v) {
      const yt = v.youtubeVideoId || v.id;
      return {
        key: yt || v.id,
        youtubeVideoId: v.youtubeVideoId || v.id,
        videoId: v.id,
        title: v.title || '',
        channelTitle: v.channelTitle || 'FamiTube',
        thumbnailUrl: v.thumbnailUrl || '',
        sourceType: v.sourceType || 'YOUTUBE',
        sourceUrl: v.sourceUrl || ''
      };
    }

    async function addVideoToKidList(listId, v) {
      if (isSimpleKidUser(currentUser)) {
        return { ok: false, message: 'Playlists are disabled in Toddler mode' };
      }
      try {
        const res = await authFetch(`/api/kids/playlists/${listId}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(kidVideoToListItem(v))
        });
        const json = await res.json();
        if (json.success) { await loadKidPlaylists(); return { ok: true }; }
        return { ok: false, message: json.message || 'Could not add to list' };
      } catch {
        return { ok: false, message: 'Could not add to list' };
      }
    }

    async function createKidList(title) {
      if (isSimpleKidUser(currentUser)) return null;
      title = (title || '').trim();
      if (!title) return null;
      try {
        const res = await authFetch('/api/kids/playlists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title })
        });
        const json = await res.json();
        if (!json.success) { alert(json.message || 'Could not create list'); return null; }
        await loadKidPlaylists();
        return (kidPlaylists.find(p => p.id === json.data?.id) || kidPlaylists.find(p => p.title === title) || null);
      } catch {
        alert('Could not create list');
        return null;
      }
    }

    function hideKidFavToast() {
      document.getElementById('kidFavToast')?.remove();
    }

    async function showKidFavToast(videoId) {
      hideKidFavToast();
      if (!authToken || isSimpleKidUser(currentUser)) return;
      const v = kidVideoById.get(videoId) || (kidsFeedVideos || []).find(x => x.id === videoId);
      if (!v) return;
      await loadKidPlaylists();
      const el = document.createElement('div');
      el.id = 'kidFavToast';
      el.className = 'card';
      el.style.cssText = 'position:fixed; right:1rem; bottom:1rem; z-index:9999; padding:0.9rem 1rem; max-width:320px; box-shadow:0 8px 28px rgba(0,0,0,0.35);';
      el.innerHTML = `
        <div style="font-weight:700; margin-bottom:0.5rem;">Saved to Favorites ❤️</div>
        <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:0.5rem;">Want to put it in a list too?</div>
        <div id="kidFavToastLists" style="display:flex; flex-wrap:wrap; gap:0.35rem; margin-bottom:0.5rem;">
          ${kidPlaylists.map(pl => `<button type="button" class="btn btn-secondary btn-sm" data-list="${kidEsc(pl.id)}">${kidEsc(pl.title)}</button>`).join('')}
          <button type="button" class="btn btn-secondary btn-sm" data-new="1">+ New list</button>
        </div>
        <div id="kidFavToastMsg" style="font-size:0.78rem; color:var(--text-muted); min-height:1em;"></div>
        <button type="button" class="btn btn-primary btn-sm" data-done="1" style="margin-top:0.4rem;">No thanks</button>`;
      el.addEventListener('click', async (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        const msg = el.querySelector('#kidFavToastMsg');
        if (b.dataset.done) return hideKidFavToast();
        let listId = b.dataset.list;
        if (b.dataset.new) {
          const name = prompt('Name your new list:');
          const pl = await createKidList(name);
          if (!pl) return;
          listId = pl.id;
        }
        if (!listId) return;
        const r = await addVideoToKidList(listId, v);
        if (r.ok) {
          msg.textContent = 'Added to list ✓';
          setTimeout(hideKidFavToast, 1200);
        } else {
          msg.textContent = r.message;
        }
      });
      document.body.appendChild(el);
      setTimeout(hideKidFavToast, 12000);
    }

    function toggleKidFavorite(videoId) {
      const list = getKidFavorites();
      const idx = list.findIndex(v => v.id === videoId);
      let added = false;
      if (idx >= 0) {
        list.splice(idx, 1);
      } else {
        const v = kidVideoById.get(videoId) || (kidsFeedVideos || []).find(x => x.id === videoId);
        if (v) { list.unshift(v); added = true; }
      }
      try {
        localStorage.setItem(getKidFavoritesStorageKey(), JSON.stringify(list.slice(0, 100)));
      } catch {}
      const favSub = document.getElementById('profileFavoritesSubtitle');
      if (favSub) favSub.textContent = `${list.length} Saved Videos`;
      if (activeKidTab === 'favorites') {
        renderKidFavorites();
      } else if (activeKidTab === 'curated' && kidHomeSelectedTopic && currentUser) {
        renderKidHomeHub(currentUser);
      }
      if (added) showKidFavToast(videoId); else hideKidFavToast();
    }

    function selectKidFavList(id) {
      kidFavActiveList = id || null;
      renderKidFavorites();
    }

    async function newKidFavList() {
      const name = prompt('Name your new list:');
      const pl = await createKidList(name);
      if (pl) selectKidFavList(pl.id);
    }

    function renderKidFavorites() {
      const grid = document.getElementById('kidFavoritesGrid');
      if (!grid) return;
      const chips = document.getElementById('kidFavoritesLists');
      const header = document.getElementById('kidFavoritesListHeader');
      const historySec = document.getElementById('kidHistorySection');
      const descEl = document.getElementById('kidFavoritesDesc');
      const isToddler = isSimpleKidUser(currentUser);
      const favs = getKidFavorites();
      favs.forEach(v => { if (v?.id) kidVideoById.set(v.id, v); });
      if (isToddler) {
        kidFavActiveList = null;
        if (chips) chips.style.display = 'none';
        if (header) header.style.display = 'none';
        if (historySec) historySec.style.display = 'none';
        if (descEl) descEl.textContent = 'Tap the heart on any video to save it here.';
      } else {
        if (historySec) historySec.style.display = '';
        if (descEl) descEl.textContent = 'Tap the heart on any video to save it here. You can also put it in a list of your own.';
      }
      const active = !isToddler && kidFavActiveList ? kidPlaylists.find(p => p.id === kidFavActiveList) : null;
      if (kidFavActiveList && !active) kidFavActiveList = null;
      if (chips && !isToddler) {
        const chip = (label, id, on) => `<button type="button" class="btn ${on ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="selectKidFavList(${id ? `'${kidEsc(id)}'` : 'null'})">${label}</button>`;
        chips.style.cssText = 'display:flex; flex-wrap:wrap; gap:0.4rem; margin-bottom:1rem;';
        chips.innerHTML = chip('All ❤️ (' + favs.length + ')', null, !active)
          + kidPlaylists.map(pl => chip(kidEsc(pl.title) + ' (' + (pl.items?.length || 0) + ')', pl.id, active && active.id === pl.id)).join('')
          + '<button type="button" class="btn btn-secondary btn-sm" onclick="newKidFavList()">+ New list</button>';
      }
      if (header) {
        if (active) {
          header.style.display = 'flex';
          header.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;';
          header.innerHTML = `<h4 style="font-size:1.05rem;">${kidEsc(active.title)}</h4><button type="button" class="btn btn-secondary btn-sm" onclick="deleteKidPlaylist('${kidEsc(active.id)}')">Delete list</button>`;
        } else {
          header.style.display = 'none';
        }
      }
      if (active) {
        const items = active.items || [];
        if (!items.length) {
          grid.innerHTML = '<div class="card" style="padding:1.5rem; color:var(--text-muted);">This list is empty. Tap ❤️ on a video, then choose this list!</div>';
          return;
        }
        grid.innerHTML = items.map((item, iIdx) => `
          <div class="card video-card" style="display:flex; flex-direction:column;">
            <div class="video-thumb" onclick="playKidPlaylistItem('${kidEsc(active.id)}', ${iIdx})" style="cursor:pointer;">
              <img src="${kidEsc(item.thumbnailUrl)}" alt="${kidEsc(item.title)}" loading="lazy">
              <div class="play-overlay"><span class="material-symbols-rounded">play_arrow</span></div>
            </div>
            <div class="video-info" style="display:flex; flex-direction:column; gap:0.35rem;">
              <div class="video-title" onclick="playKidPlaylistItem('${kidEsc(active.id)}', ${iIdx})" style="cursor:pointer;">${kidEsc(item.title)}</div>
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:0.75rem; color:var(--text-muted);">${kidEsc(item.channelTitle)}</span>
                <button type="button" class="btn btn-secondary btn-sm" style="padding:0.2rem 0.5rem; font-size:0.72rem;" onclick="removeKidPlaylistItem('${kidEsc(active.id)}', '${kidEsc(item.key)}')">Remove</button>
              </div>
            </div>
          </div>`).join('');
        return;
      }
      if (!favs.length) {
        grid.innerHTML = '<div class="card" style="padding:1.5rem; color:var(--text-muted);">No favorites yet. Tap the ❤️ on any video to save it here!</div>';
        return;
      }
      grid.innerHTML = favs.map(v => renderKidVideoCardHtml(v)).join('');
    }

    // --- Daily Screen Time Timer & Quick Access Parental Controls (PIN) ---
    let kidWatchTimerInterval = null;
    let kidUnlockedPinCache = '';

    function getKidWatchSecondsKey() {
      const today = new Date().toISOString().slice(0, 10);
      return `famitube_watch_${currentUser?.id || 'guest'}_${today}`;
    }

    function getKidWatchSecondsToday() {
      try {
        return Math.max(0, parseInt(localStorage.getItem(getKidWatchSecondsKey()) || '0', 10) || 0);
      } catch {
        return 0;
      }
    }

    function getKidRemainingMinutes() {
      const limitMin = Number(kidParentalSettings?.dailyLimitMinutes ?? 0);
      if (limitMin <= 0) return null; // Unlimited
      const usedMin = Math.floor(getKidWatchSecondsToday() / 60);
      return Math.max(0, limitMin - usedMin);
    }

    function isKidTimeUp() {
      const rem = getKidRemainingMinutes();
      return rem !== null && rem <= 0;
    }

    function parseHmMinutesWeb(hm, fallback) {
      const parts = String(hm || fallback || '00:00').split(':').map(Number);
      if (parts.length !== 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return 0;
      return parts[0] * 60 + parts[1];
    }

    function isWebQuietHoursActive() {
      const enabled = kidParentalSettings?.quietHoursEnabled ?? currentUser?.quietHoursEnabled;
      if (!enabled) return false;
      const snoozeKey = `famitube_quiet_snooze_${currentUser?.id || 'guest'}`;
      const snoozeUntil = Number(localStorage.getItem(snoozeKey) || '0');
      if (snoozeUntil > Date.now()) return false;
      const now = new Date();
      const nowMins = now.getHours() * 60 + now.getMinutes();
      const startMins = parseHmMinutesWeb(kidParentalSettings?.quietHoursStart || currentUser?.quietHoursStart || '20:00');
      const endMins = parseHmMinutesWeb(kidParentalSettings?.quietHoursEnd || currentUser?.quietHoursEnd || '07:00');
      if (startMins > endMins) return nowMins >= startMins || nowMins < endMins;
      if (startMins < endMins) return nowMins >= startMins && nowMins < endMins;
      return false;
    }

    function isWebEpisodeLimitReached() {
      const limit = Number(kidParentalSettings?.episodeLimitPerSession ?? currentUser?.episodeLimitPerSession ?? 0);
      return limit > 0 && webSessionEpisodesWatched >= limit;
    }

    function snoozeWebQuietHoursFromModal() {
      const snoozeKey = `famitube_quiet_snooze_${currentUser?.id || 'guest'}`;
      try { localStorage.setItem(snoozeKey, String(Date.now() + 2 * 60 * 60 * 1000)); } catch {}
      hideKidTimeUpOverlay();
      const status = document.getElementById('kidPcStatusMsg');
      if (status) {
        status.textContent = 'Quiet Hours snoozed for 2 hours!';
        status.style.color = '#06d6a0';
        status.style.display = 'block';
      }
    }

    function updateKidTimePill() {
      const label = document.getElementById('headerTimeLabel');
      const pill = document.getElementById('headerTimePill');
      if (!label || !pill) return;
      const rem = getKidRemainingMinutes();
      if (rem === null) {
        label.textContent = '∞';
        pill.style.color = '#06d6a0';
      } else {
        label.textContent = `${rem}m`;
        pill.style.color = rem <= 5 ? '#ff6b8b' : '#06d6a0';
      }
    }

    function startKidWatchTimer() {
      stopKidWatchTimer();
      kidWatchTimerInterval = setInterval(() => {
        if (!currentUser || currentUser.role !== 'CHILD') return;
        const nextSec = getKidWatchSecondsToday() + 10;
        try {
          localStorage.setItem(getKidWatchSecondsKey(), String(nextSec));
        } catch {}
        updateKidTimePill();
        if (isWebQuietHoursActive()) {
          closePlayerModal();
          showKidTimeUpOverlay('QUIET');
        } else if (isKidTimeUp()) {
          closePlayerModal();
          showKidTimeUpOverlay('TIME');
        }
      }, 10000);
    }

    function stopKidWatchTimer() {
      if (kidWatchTimerInterval) {
        clearInterval(kidWatchTimerInterval);
        kidWatchTimerInterval = null;
      }
    }

    function showKidTimeUpOverlay(reason = 'TIME') {
      const el = document.getElementById('kidTimeUpOverlay');
      const titleEl = document.getElementById('kidTimeUpTitle');
      const descEl = document.getElementById('kidTimeUpDesc');
      if (reason === 'QUIET') {
        const s = kidParentalSettings?.quietHoursStart || currentUser?.quietHoursStart || '20:00';
        const e = kidParentalSettings?.quietHoursEnd || currentUser?.quietHoursEnd || '07:00';
        if (titleEl) titleEl.textContent = 'Shhh… FamiTube is Sleeping';
        if (descEl) descEl.textContent = `Quiet Hours are active (${s} – ${e}). Time to rest or cuddle up!`;
      } else if (reason === 'EPISODE') {
        const lim = Number(kidParentalSettings?.episodeLimitPerSession ?? currentUser?.episodeLimitPerSession ?? 0);
        if (titleEl) titleEl.textContent = 'All Done for This Session!';
        if (descEl) descEl.textContent = `You finished ${lim} episode${lim === 1 ? '' : 's'}. Ask a grown-up via 🔒 for another session.`;
      } else {
        if (titleEl) titleEl.textContent = 'Time for a Break!';
        if (descEl) descEl.textContent = "You've reached your daily screen time limit. Great job exploring today!";
      }
      if (el) el.style.display = 'flex';
    }

    function hideKidTimeUpOverlay() {
      const el = document.getElementById('kidTimeUpOverlay');
      if (el) el.style.display = 'none';
    }

    function openKidParentalPinGate() {
      const modal = document.getElementById('kidPinGateModal');
      const input = document.getElementById('kidPinGateInput');
      const err = document.getElementById('kidPinGateError');
      if (err) err.style.display = 'none';
      if (input) input.value = '';
      if (modal) modal.style.display = 'flex';
      setTimeout(() => input?.focus(), 60);
    }

    function closeKidPinGate() {
      const modal = document.getElementById('kidPinGateModal');
      if (modal) modal.style.display = 'none';
    }

    async function submitKidPinGate(e) {
      e.preventDefault();
      const input = document.getElementById('kidPinGateInput');
      const err = document.getElementById('kidPinGateError');
      const btn = document.getElementById('kidPinGateSubmitBtn');
      const pin = String(input?.value || '').trim();
      if (!/^\d{4}$/.test(pin)) {
        if (err) {
          err.textContent = 'Please enter a 4-digit PIN.';
          err.style.display = 'block';
        }
        return;
      }
      if (btn) btn.disabled = true;
      try {
        const res = await authFetch('/api/kids/parental-controls/verify-pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin })
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          if (err) {
            err.textContent = json.message || 'Incorrect Parent PIN.';
            err.style.display = 'block';
          }
          return;
        }
        if (json.data) {
          kidParentalSettings = { ...kidParentalSettings, ...json.data };
        }
        kidUnlockedPinCache = pin;
        closeKidPinGate();
        openKidParentalControlsModal();
      } catch {
        if (pin === (kidParentalSettings.parentPin || '1234')) {
          kidUnlockedPinCache = pin;
          closeKidPinGate();
          openKidParentalControlsModal();
        } else if (err) {
          err.textContent = 'Incorrect Parent PIN.';
          err.style.display = 'block';
        }
      } finally {
        if (btn) btn.disabled = false;
      }
    }

    function openKidParentalControlsModal() {
      const limit = Number(kidParentalSettings.dailyLimitMinutes ?? 45);
      document.getElementById('kidPcLimitHours').value = String(Math.floor(limit / 60));
      document.getElementById('kidPcLimitMinutes').value = String(limit % 60);
      document.getElementById('kidPcAgeRating').value = kidParentalSettings.ageRating || currentUser?.ageRating || 'ALL';
      const langEl = document.getElementById('kidPcContentLanguage');
      if (langEl) langEl.value = kidParentalSettings.contentLanguage || currentUser?.contentLanguage || 'all';
      document.getElementById('kidPcNewPin').value = kidParentalSettings.parentPin || kidUnlockedPinCache || '1234';
      const qEnEl = document.getElementById('kidPcQuietHoursEnabled');
      if (qEnEl) qEnEl.checked = Boolean(kidParentalSettings.quietHoursEnabled ?? currentUser?.quietHoursEnabled);
      const qStEl = document.getElementById('kidPcQuietStart');
      if (qStEl) qStEl.value = kidParentalSettings.quietHoursStart || currentUser?.quietHoursStart || '20:00';
      const qEdEl = document.getElementById('kidPcQuietEnd');
      if (qEdEl) qEdEl.value = kidParentalSettings.quietHoursEnd || currentUser?.quietHoursEnd || '07:00';
      const epEl = document.getElementById('kidPcEpisodeLimit');
      if (epEl) epEl.value = String(kidParentalSettings.episodeLimitPerSession ?? currentUser?.episodeLimitPerSession ?? 0);
      const ageVal = kidParentalSettings.ageRating || currentUser?.ageRating || 'ALL';
      const tSec = document.getElementById('kidPcToddlerSection');
      if (tSec) tSec.style.display = ageVal === 'TODDLER' ? 'block' : 'none';
      const tLoopEl = document.getElementById('kidPcToddlerLoop');
      if (tLoopEl) tLoopEl.value = String(kidParentalSettings.toddlerLoopMinutes ?? 15);
      const tCoolEl = document.getElementById('kidPcToddlerCooldown');
      if (tCoolEl) tCoolEl.value = String(kidParentalSettings.toddlerCooldownMinutes ?? 30);
      const status = document.getElementById('kidPcStatusMsg');
      if (status) status.style.display = 'none';
      const switchRow = document.getElementById('kidPcSwitchRow');
      if (switchRow) {
        switchRow.style.display = localStorage.getItem('FamiTube_parent_backup_token') ? 'flex' : 'none';
      }
      document.getElementById('kidParentalControlsModal').style.display = 'flex';
    }

    async function wakeWebToddlerTvFromModal() {
      const pin = kidUnlockedPinCache || kidParentalSettings.parentPin || '1234';
      try {
        const res = await authFetch('/api/kids/toddler-tv/cooldown', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'WAKE', pin })
        });
        if (res.ok) {
          const st = readWebToddlerLocalState();
          st.cooldownUntil = 0;
          st.sessionWatchedSec = 0;
          writeWebToddlerLocalState(st);
          if (webToddlerTvData) webToddlerTvData.cooldownUntil = null;
          if (currentUser) renderKidHomeHub(currentUser);
          const status = document.getElementById('kidPcStatusMsg');
          if (status) {
            status.textContent = 'Toddler TV is awake!';
            status.style.color = '#06d6a0';
            status.style.display = 'block';
          }
        }
      } catch {}
    }

    function closeKidParentalControlsModal() {
      document.getElementById('kidParentalControlsModal').style.display = 'none';
    }

    function resetKidTodayTimer() {
      try {
        localStorage.removeItem(getKidWatchSecondsKey());
      } catch {}
      updateKidTimePill();
      hideKidTimeUpOverlay();
      const status = document.getElementById('kidPcStatusMsg');
      if (status) {
        status.textContent = "Today's screen time timer has been reset.";
        status.style.color = '#06d6a0';
        status.style.display = 'block';
      }
    }

    async function saveKidParentalControls(e) {
      e.preventDefault();
      const status = document.getElementById('kidPcStatusMsg');
      const btn = document.getElementById('kidPcSaveBtn');
      const hours = Math.max(0, Math.min(12, parseInt(document.getElementById('kidPcLimitHours').value || '0', 10) || 0));
      const mins = Math.max(0, Math.min(59, parseInt(document.getElementById('kidPcLimitMinutes').value || '0', 10) || 0));
      const dailyLimitMinutes = hours * 60 + mins;
      const ageRating = document.getElementById('kidPcAgeRating').value;
      const contentLanguage = document.getElementById('kidPcContentLanguage')?.value || 'all';
      const newPin = String(document.getElementById('kidPcNewPin').value || '').trim();

      if (!/^\d{4}$/.test(newPin)) {
        if (status) {
          status.textContent = 'Parent PIN must be exactly 4 digits.';
          status.style.color = '#ff6b8b';
          status.style.display = 'block';
        }
        return;
      }

      if (btn) btn.disabled = true;
      try {
        const res = await authFetch('/api/kids/parental-controls', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            currentPin: kidUnlockedPinCache || kidParentalSettings.parentPin || '1234',
            parentPin: newPin,
            dailyLimitMinutes,
            ageRating,
            contentLanguage,
            quietHoursEnabled: Boolean(document.getElementById('kidPcQuietHoursEnabled')?.checked),
            quietHoursStart: document.getElementById('kidPcQuietStart')?.value || '20:00',
            quietHoursEnd: document.getElementById('kidPcQuietEnd')?.value || '07:00',
            episodeLimitPerSession: Number(document.getElementById('kidPcEpisodeLimit')?.value || 0),
            toddlerLoopMinutes: Math.max(5, Math.min(60, parseInt(document.getElementById('kidPcToddlerLoop')?.value || '15', 10) || 15)),
            toddlerCooldownMinutes: Math.max(5, Math.min(240, parseInt(document.getElementById('kidPcToddlerCooldown')?.value || '30', 10) || 30))
          })
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          if (status) {
            status.textContent = json.message || 'Could not save parental controls.';
            status.style.color = '#ff6b8b';
            status.style.display = 'block';
          }
          return;
        }
        kidParentalSettings = { ...kidParentalSettings, ...(json.data || {}) };
        kidUnlockedPinCache = newPin;
        webSessionEpisodesWatched = 0;
        if (currentUser) {
          currentUser.ageRating = kidParentalSettings.ageRating;
          currentUser.contentLanguage = kidParentalSettings.contentLanguage;
          updateKidToolsVisibility(currentUser);
          if (currentUser.ageRating === 'TODDLER' && typeof renderKidHomeHub === 'function') {
            renderKidHomeHub(currentUser);
          }
        }
        updateKidTimePill();
        if (!isKidTimeUp()) hideKidTimeUpOverlay();
        if (status) {
          status.textContent = 'Parental controls saved and synced!';
          status.style.color = '#06d6a0';
          status.style.display = 'block';
        }
      } catch {
        if (status) {
          status.textContent = 'Network error while saving parental controls.';
          status.style.color = '#ff6b8b';
          status.style.display = 'block';
        }
      } finally {
        if (btn) btn.disabled = false;
      }
    }

    function getSearchGridColumns() {
      const resultsEl = document.getElementById('kidYouTubeSearchResults');
      const w = resultsEl?.clientWidth || window.innerWidth;
      // Matches .video-grid: repeat(auto-fill, minmax(320px, 1fr)) with 1.5rem (24px) gap
      return Math.max(1, Math.floor((w + 24) / (320 + 24)));
    }

    function getCuratedPageSize() {
      const cols = getSearchGridColumns();
      return cols === 1 ? 5 : cols * 2;
    }

    function getYouTubePageSize() {
      const cols = getSearchGridColumns();
      return cols === 1 ? 10 : cols * 4;
    }

    async function getCachedGpsCoords() {
      try {
        const cached = JSON.parse(sessionStorage.getItem('famitube_gps_coords') || 'null');
        if (cached && Date.now() - cached.ts < 10 * 60 * 1000) {
          return { lat: cached.lat, lon: cached.lon };
        }
      } catch {}
      if (!navigator.geolocation) return null;
      return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const coords = { lat: pos.coords.latitude, lon: pos.coords.longitude, ts: Date.now() };
            try { sessionStorage.setItem('famitube_gps_coords', JSON.stringify(coords)); } catch {}
            resolve({ lat: coords.lat, lon: coords.lon });
          },
          () => resolve(null),
          { enableHighAccuracy: false, timeout: 2500, maximumAge: 600000 }
        );
      });
    }

    async function runKidYouTubeSearch(e) {
      if (e) e.preventDefault();
      const input = document.getElementById('kidYouTubeSearchInput');
      const q = (input?.value || '').trim();
      if (!q) return;
      const resultsEl = document.getElementById('kidYouTubeSearchResults');
      const statusEl = document.getElementById('kidSearchStatusBanner');
      if (statusEl) statusEl.style.display = 'none';
      kidCuratedVisibleLimit = getCuratedPageSize();
      kidYtVisibleLimit = getYouTubePageSize();
      if (resultsEl) resultsEl.innerHTML = '<p style="color:var(--text-muted);">Searching curated and YouTube videos...</p>';

      try {
        const resolvedAge = currentUser?.role === 'CHILD'
          ? (!currentUser.ageRating || currentUser.ageRating === 'ALL' ? 'OLDER_KIDS' : currentUser.ageRating)
          : currentUser?.ageRating;
        const ageFilter = resolvedAge && resolvedAge !== 'ALL' ? `&ageRating=${encodeURIComponent(resolvedAge)}` : '';
        const gps = await getCachedGpsCoords();
        const navLocale = (navigator.language || 'en-US').split(/[-_]/);
        const autoLang = (navLocale[0] || '').toLowerCase();
        const autoRegion = (navLocale[1] || '').toUpperCase();
        const ytParams = new URLSearchParams({ q });
        if (gps) {
          ytParams.set('lat', String(gps.lat));
          ytParams.set('lon', String(gps.lon));
        }
        if (autoRegion && autoRegion.length === 2) ytParams.set('region', autoRegion);
        if (autoLang && autoLang.length === 2) ytParams.set('lang', autoLang);
        const [curatedRes, ytRes] = await Promise.all([
          fetch(apiUrl('/api/videos?search=' + encodeURIComponent(q) + ageFilter)).then(r => r.json()).catch(() => ({ success: false, data: [] })),
          authFetch('/api/kids/youtube-search?' + ytParams.toString()).then(r => r.json()).catch(() => ({ success: false, message: 'YouTube search unavailable' }))
        ]);

        kidCuratedSearchResults = curatedRes.success ? (curatedRes.data || []) : [];
        kidSearchResults = ytRes.success ? (ytRes.data?.results || []) : [];
        kidSearchChannels = ytRes.success ? (ytRes.data?.channels || []) : [];
        activeKidYtChannelDetail = null;
        const ytErrorMsg = !ytRes.success ? (ytRes.message || 'YouTube search unavailable') : null;

        if (ytRes.success && ytRes.data?.searchSettings) {
          if (currentUser) Object.assign(currentUser, ytRes.data.searchSettings);
          updateKidSearchQuotaBadge(ytRes.data.searchSettings);
        }

        renderKidYouTubeSearchResults(ytErrorMsg);
      } catch {
        if (resultsEl) resultsEl.innerHTML = '<p style="color:var(--text-muted);">Failed to search videos.</p>';
      }
    }

    function showMoreKidCurated() {
      kidCuratedVisibleLimit += getCuratedPageSize();
      renderKidYouTubeSearchResults();
    }

    function showMoreKidYouTube() {
      kidYtVisibleLimit += getYouTubePageSize();
      renderKidYouTubeSearchResults();
    }

    let kidSearchChannels = [];
    let kidYtSubscribedChannels = [];
    let activeKidYtChannelDetail = null;
    let activeKidYtChannelTab = 'videos'; // 'videos' | 'playlists'
    let activeKidYtPlaylistDetail = null; // { playlistId, title, videos }

    async function loadKidYouTubeSubscriptions() {
      if (!authToken) return;
      try {
        const res = await authFetch('/api/kids/youtube-subscriptions');
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          kidYtSubscribedChannels = json.data;
        }
      } catch {}
    }

    async function toggleKidYouTubeChannelSub(handle, title, avatarUrl, channelId, e) {
      if (e) e.stopPropagation();
      const norm = handle.startsWith('@') ? handle : `@${handle}`;
      const existing = kidYtSubscribedChannels.some((s) => s.handle.toLowerCase() === norm.toLowerCase()) ||
        kidSearchChannels.some((c) => c.handle.toLowerCase() === norm.toLowerCase() && c.isSubscribed);
      try {
        if (existing) {
          await authFetch('/api/kids/youtube-subscriptions/' + encodeURIComponent(norm), { method: 'DELETE' });
        } else {
          await authFetch('/api/kids/youtube-subscriptions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ handle: norm, title, avatarUrl, channelId })
          });
        }
        await loadKidYouTubeSubscriptions();
        const subSet = new Set(kidYtSubscribedChannels.map((s) => s.handle.toLowerCase()));
        kidSearchChannels = kidSearchChannels.map((c) => ({
          ...c,
          isSubscribed: subSet.has(c.handle.toLowerCase())
        }));
        if (activeKidYtChannelDetail?.channel && activeKidYtChannelDetail.channel.handle.toLowerCase() === norm.toLowerCase()) {
          activeKidYtChannelDetail.channel.isSubscribed = subSet.has(norm.toLowerCase());
        }
        renderKidYouTubeSearchResults();
      } catch {}
    }

    async function openKidYouTubeChannelVideos(handle) {
      const norm = handle.startsWith('@') ? handle : `@${handle}`;
      const resultsEl = document.getElementById('kidYouTubeSearchResults');
      if (resultsEl) {
        resultsEl.innerHTML = `<p style="color:var(--text-muted);">Loading videos from ${norm}...</p>`;
      }
      try {
        const res = await authFetch('/api/kids/youtube-channels/' + encodeURIComponent(norm));
        const json = await res.json();
        if (!json.success || !json.data) {
          if (resultsEl) resultsEl.innerHTML = `<p style="color:var(--primary);">${json.message || 'Could not load channel videos.'}</p>`;
          return;
        }
        activeKidYtChannelDetail = json.data;
        activeKidYtChannelTab = 'videos';
        activeKidYtPlaylistDetail = null;
        renderKidYouTubeSearchResults();
      } catch {
        if (resultsEl) resultsEl.innerHTML = '<p style="color:var(--text-muted);">Failed to load YouTube channel videos.</p>';
      }
    }

    function closeKidYouTubeChannelVideos() {
      activeKidYtChannelDetail = null;
      activeKidYtPlaylistDetail = null;
      activeKidYtChannelTab = 'videos';
      renderKidYouTubeSearchResults();
    }

    function setKidYtChannelTab(tab) {
      activeKidYtChannelTab = tab === 'playlists' ? 'playlists' : 'videos';
      activeKidYtPlaylistDetail = null;
      renderKidYouTubeSearchResults();
    }

    async function openKidYouTubePlaylist(playlistId, handle) {
      if (!playlistId) return;
      const resultsEl = document.getElementById('kidYouTubeSearchResults');
      if (resultsEl) {
        resultsEl.innerHTML = '<p style="color:var(--text-muted);">Loading playlist videos...</p>';
      }
      try {
        const q = handle ? `?handle=${encodeURIComponent(handle)}` : '';
        const res = await authFetch('/api/kids/youtube-playlists/' + encodeURIComponent(playlistId) + q);
        const json = await res.json();
        if (!json.success || !json.data) {
          if (resultsEl) resultsEl.innerHTML = `<p style="color:var(--primary);">${json.message || 'Could not load playlist.'}</p>`;
          return;
        }
        activeKidYtPlaylistDetail = json.data;
        renderKidYouTubeSearchResults();
      } catch {
        if (resultsEl) resultsEl.innerHTML = '<p style="color:var(--text-muted);">Failed to load playlist videos.</p>';
      }
    }

    function closeKidYouTubePlaylist() {
      activeKidYtPlaylistDetail = null;
      renderKidYouTubeSearchResults();
    }

    async function watchChannelYouTubeVideo(idx) {
      const targetList = activeKidYtPlaylistDetail?.videos || activeKidYtChannelDetail?.videos;
      const v = targetList?.[idx];
      if (!v) return;
      const prev = kidSearchResults;
      kidSearchResults = targetList;
      await watchSearchedYouTubeVideo(idx);
      if (activeKidYtPlaylistDetail) {
        activeKidYtPlaylistDetail.videos = kidSearchResults;
      } else if (activeKidYtChannelDetail) {
        activeKidYtChannelDetail.videos = kidSearchResults;
      }
      kidSearchResults = prev;
      renderKidYouTubeSearchResults();
    }

    function renderKidYouTubeSearchResults(ytErrorMsg = null) {
      const resultsEl = document.getElementById('kidYouTubeSearchResults');
      if (!resultsEl) return;

      const input = document.getElementById('kidYouTubeSearchInput');
      const q = (input?.value || '').trim();
      if (!activeKidYtChannelDetail && !q) {
        resultsEl.innerHTML = '';
        return;
      }

      if (activeKidYtChannelDetail && activeKidYtChannelDetail.channel) {
        const ch = activeKidYtChannelDetail.channel;
        const vids = activeKidYtChannelDetail.videos || [];
        const playlists = activeKidYtChannelDetail.playlists || [];
        const safeHandle = ch.handle.replace(/'/g, "\\'");
        const safeTitle = (ch.title || ch.handle).replace(/'/g, "\\'");
        const safeAvatar = (ch.avatarUrl || '').replace(/'/g, "\\'");
        const safeCid = (ch.channelId || '').replace(/'/g, "\\'");
        const renderVideoCardsHtml = (videoList) => !videoList.length
          ? '<p style="color:var(--text-muted);">No videos found.</p>'
          : `
            <div class="video-grid">
              ${videoList.map((v, idx) => {
                const badge = v.isCurated
                  ? '<span class="channel-type-badge ondemand">Curated</span>'
                  : v.approvalStatus === 'APPROVED' || v.inHistory
                    ? '<span class="channel-type-badge ondemand" style="background:rgba(6,214,160,0.16); color:var(--success);">Approved</span>'
                    : v.approvalStatus === 'PENDING'
                      ? '<span class="channel-type-badge live">Pending Approval</span>'
                      : v.approvalStatus === 'REJECTED'
                        ? '<span class="channel-type-badge live">Declined</span>'
                        : '<span class="channel-type-badge ondemand">YouTube</span>';
                return `
                  <div class="card video-card" style="display:flex; flex-direction:column;">
                    <div class="video-thumb" onclick="watchChannelYouTubeVideo(${idx})" style="cursor:pointer;">
                      <img src="${v.thumbnailUrl}" alt="${v.title}" loading="lazy">
                      <div class="play-overlay"><span class="material-symbols-rounded">play_arrow</span></div>
                    </div>
                    <div class="video-info" style="flex:1; display:flex; flex-direction:column; gap:0.4rem;">
                      <div style="display:flex; justify-content:space-between; align-items:center; gap:0.4rem;">
                        <span style="font-size:0.76rem; color:var(--text-muted);">${ch.handle}</span>
                        ${badge}
                      </div>
                      <div class="video-title" onclick="watchChannelYouTubeVideo(${idx})" style="cursor:pointer;">${v.title}</div>
                      <div style="margin-top:auto; padding-top:0.35rem;">
                        <button type="button" class="btn btn-primary btn-sm" onclick="watchChannelYouTubeVideo(${idx})">
                          ${v.isCurated || v.approvalStatus === 'APPROVED' || v.inHistory ? 'Watch Now' : 'Watch / Request'}
                        </button>
                      </div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          `;

        const renderPlaylistsHtml = () => !playlists.length
          ? '<p style="color:var(--text-muted);">No playlists found for this channel.</p>'
          : `
            <div class="video-grid">
              ${playlists.map((pl) => {
                const safePid = String(pl.playlistId || '').replace(/'/g, "\\'");
                return `
                  <div class="card video-card" onclick="openKidYouTubePlaylist('${safePid}', '${safeHandle}')" style="display:flex; flex-direction:column; cursor:pointer;">
                    <div class="video-thumb">
                      <img src="${pl.thumbnailUrl}" alt="${pl.title}" loading="lazy">
                      <div class="duration-badge">${pl.videoCount || 0} videos</div>
                      <div class="play-overlay"><span class="material-symbols-rounded">playlist_play</span></div>
                    </div>
                    <div class="video-info" style="flex:1; display:flex; flex-direction:column; gap:0.4rem;">
                      <div style="display:flex; justify-content:space-between; align-items:center; gap:0.4rem;">
                        <span style="font-size:0.76rem; color:var(--text-muted);">${ch.handle}</span>
                        <span class="channel-type-badge ondemand">Playlist</span>
                      </div>
                      <div class="video-title">${pl.title}</div>
                      <div style="margin-top:auto; padding-top:0.35rem;">
                        <button type="button" class="btn btn-secondary btn-sm">
                          Open Playlist (${pl.videoCount || 0})
                        </button>
                      </div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          `;

        resultsEl.innerHTML = `
          <div style="margin-bottom:1rem; display:flex; align-items:center; gap:0.6rem; flex-wrap:wrap;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="closeKidYouTubeChannelVideos()">
              <span class="material-symbols-rounded" style="font-size:1rem;">arrow_back</span> Back to Search Results
            </button>
            ${activeKidYtPlaylistDetail ? `
              <button type="button" class="btn btn-secondary btn-sm" onclick="closeKidYouTubePlaylist()">
                <span class="material-symbols-rounded" style="font-size:1rem;">playlist_play</span> Back to ${ch.handle} Playlists
              </button>
            ` : ''}
          </div>
          <div class="card" style="padding:1.1rem 1.25rem; margin-bottom:1rem; display:flex; align-items:center; justify-content:space-between; gap:1rem; flex-wrap:wrap;">
            <div style="display:flex; align-items:center; gap:0.85rem;">
              <img src="${ch.avatarUrl}" alt="${ch.handle}" style="width:56px; height:56px; border-radius:50%; object-fit:cover; border:2px solid var(--accent);">
              <div>
                <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                  <span style="font-weight:800; font-size:1.1rem;">${ch.title}</span>
                  ${ch.trustLevel === 'TRUSTED'
                    ? '<span style="font-size:0.72rem; padding:2px 8px; border-radius:99px; background:rgba(6,214,160,0.16); color:var(--success); font-weight:700;">✓ Parent-Trusted</span>'
                    : '<span style="font-size:0.72rem; padding:2px 8px; border-radius:99px; background:rgba(255,209,102,0.16); color:#ffd166; font-weight:700;">Supervised</span>'}
                </div>
                <div style="font-size:0.82rem; color:var(--accent); font-weight:700;">${ch.handle} • ${vids.length} videos • ${playlists.length} playlists</div>
              </div>
            </div>
            <button type="button" class="btn ${ch.isSubscribed ? 'btn-secondary' : 'btn-primary'} btn-sm" onclick="toggleKidYouTubeChannelSub('${safeHandle}', '${safeTitle}', '${safeAvatar}', '${safeCid}', event)">
              <span class="material-symbols-rounded" style="font-size:1rem;">${ch.isSubscribed ? 'check' : 'add'}</span>
              ${ch.isSubscribed ? 'Subscribed' : 'Subscribe'}
            </button>
          </div>
          <div style="display:flex; gap:0.5rem; margin-bottom:1.1rem; flex-wrap:wrap;">
            <button type="button" class="btn ${!activeKidYtPlaylistDetail && activeKidYtChannelTab === 'videos' ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="setKidYtChannelTab('videos')">
              <span class="material-symbols-rounded" style="font-size:1rem;">video_library</span> Videos (${vids.length})
            </button>
            ${!isSimpleKidUser(currentUser) ? `
              <button type="button" class="btn ${(activeKidYtPlaylistDetail || activeKidYtChannelTab === 'playlists') ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="setKidYtChannelTab('playlists')">
                <span class="material-symbols-rounded" style="font-size:1rem;">playlist_play</span> Playlists (${playlists.length})
              </button>
            ` : ''}
          </div>
          ${activeKidYtPlaylistDetail ? `
            <div style="margin-bottom:0.85rem; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:0.5rem;">
              <h4 style="margin:0; font-size:1.05rem; color:#ffd166;">Playlist: ${activeKidYtPlaylistDetail.title}</h4>
              <span style="font-size:0.82rem; color:var(--text-muted);">${(activeKidYtPlaylistDetail.videos || []).length} videos</span>
            </div>
            ${renderVideoCardsHtml(activeKidYtPlaylistDetail.videos || [])}
          ` : activeKidYtChannelTab === 'playlists'
            ? renderPlaylistsHtml()
            : renderVideoCardsHtml(vids)
          }
        `;
        return;
      }

      const visibleCurated = kidCuratedSearchResults.slice(0, kidCuratedVisibleLimit);
      const visibleYt = kidSearchResults.slice(0, kidYtVisibleLimit);

      const curatedHtml = !kidCuratedSearchResults.length
        ? '<p style="color:var(--text-muted); margin-bottom:1.5rem;">No matching curated videos found.</p>'
        : `
          <div class="video-grid" style="margin-bottom:0.85rem;">
            ${visibleCurated.map((v) => `
              <div class="card video-card" onclick="openPlayer('${v.id}')" style="cursor:pointer;">
                <div class="video-thumb" style="position:relative;">
                  <img src="${v.thumbnailUrl}" alt="${v.title}" loading="lazy">
                  <div class="badge-type">${v.sourceType}</div>
                  <div class="badge-age">${v.ageRating}</div>
                  <div class="play-overlay"><span class="material-symbols-rounded">play_arrow</span></div>
                  ${isKidFavorite(v.id) ? `<div style="position:absolute; bottom:6px; right:6px; width:26px; height:26px; border-radius:50%; background:rgba(255,46,147,0.92); color:#fff; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 5px rgba(0,0,0,0.4);"><span class="material-symbols-rounded" style="font-size:16px;">favorite</span></div>` : ''}
                </div>
                <div class="video-info">
                  <div style="font-size:0.76rem; color:var(--text-muted); margin-bottom:0.25rem;">${v.channelTitle}</div>
                  <div class="video-title">${v.title}</div>
                </div>
              </div>
            `).join('')}
          </div>
          ${kidCuratedSearchResults.length > kidCuratedVisibleLimit ? `
            <div style="margin-bottom:1.75rem;">
              <button type="button" class="btn btn-secondary" onclick="showMoreKidCurated()" style="width:100%; justify-content:center;">
                Show More Curated (${kidCuratedSearchResults.length - kidCuratedVisibleLimit} more)
              </button>
            </div>
          ` : '<div style="margin-bottom:1.5rem;"></div>'}
        `;

      const ytHtml = ytErrorMsg
        ? `<p style="color:var(--primary);">${ytErrorMsg}</p>`
        : !kidSearchResults.length
          ? '<p style="color:var(--text-muted);">No YouTube results found.</p>'
          : `
            <div class="video-grid" style="margin-bottom:0.85rem;">
              ${visibleYt.map((v, idx) => {
                const badge = v.isCurated
                  ? '<span class="channel-type-badge ondemand">Curated</span>'
                  : v.approvalStatus === 'APPROVED' || v.inHistory
                    ? '<span class="channel-type-badge ondemand" style="background:rgba(6,214,160,0.16); color:var(--success);">Approved</span>'
                    : v.approvalStatus === 'PENDING'
                      ? '<span class="channel-type-badge live">Pending Approval</span>'
                      : v.approvalStatus === 'REJECTED'
                        ? '<span class="channel-type-badge live">Declined</span>'
                        : '<span class="channel-type-badge ondemand">YouTube</span>';
                return `
                  <div class="card video-card" style="display:flex; flex-direction:column;">
                    <div class="video-thumb" onclick="watchSearchedYouTubeVideo(${idx})" style="cursor:pointer;">
                      <img src="${v.thumbnailUrl}" alt="${v.title}" loading="lazy">
                      <div class="play-overlay"><span class="material-symbols-rounded">play_arrow</span></div>
                    </div>
                    <div class="video-info" style="flex:1; display:flex; flex-direction:column; gap:0.4rem;">
                      <div style="display:flex; justify-content:space-between; align-items:center; gap:0.4rem;">
                        <span style="font-size:0.76rem; color:var(--text-muted);">${v.channelTitle}</span>
                        ${badge}
                      </div>
                      <div class="video-title" onclick="watchSearchedYouTubeVideo(${idx})" style="cursor:pointer;">${v.title}</div>
                      <div style="margin-top:auto; padding-top:0.35rem; display:flex; gap:0.4rem; flex-wrap:wrap;">
                        <button type="button" class="btn btn-primary btn-sm" onclick="watchSearchedYouTubeVideo(${idx})">
                          ${v.isCurated || v.approvalStatus === 'APPROVED' || v.inHistory ? 'Watch Now' : 'Watch / Request'}
                        </button>
                      </div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
            ${kidSearchResults.length > kidYtVisibleLimit ? `
              <div>
                <button type="button" class="btn btn-secondary" onclick="showMoreKidYouTube()" style="width:100%; justify-content:center;">
                  Show More YouTube (${kidSearchResults.length - kidYtVisibleLimit} more)
                </button>
              </div>
            ` : ''}
          `;

      const ytChannelsHtml = !kidSearchChannels.length
        ? ''
        : `
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.75rem;">
            <h4 style="margin:0; color:var(--primary); font-size:1.05rem;">YouTube Channels (@)</h4>
            <span style="font-size:0.82rem; color:var(--text-muted);">${kidSearchChannels.length} channels</span>
          </div>
          <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(270px, 1fr)); gap:0.85rem; margin-bottom:1.5rem;">
            ${kidSearchChannels.map((ch) => {
              const safeHandle = (ch.handle || '').replace(/'/g, "\\'");
              const safeTitle = (ch.title || ch.handle || '').replace(/'/g, "\\'");
              const safeAvatar = (ch.avatarUrl || '').replace(/'/g, "\\'");
              const safeCid = (ch.channelId || '').replace(/'/g, "\\'");
              return `
                <div class="card" onclick="openKidYouTubeChannelVideos('${safeHandle}')" style="padding:0.9rem 1rem; display:flex; align-items:center; justify-content:space-between; gap:0.75rem; cursor:pointer;">
                  <div style="display:flex; align-items:center; gap:0.7rem; min-width:0; flex:1;">
                    <img src="${ch.avatarUrl}" alt="${ch.handle}" style="width:44px; height:44px; border-radius:50%; object-fit:cover; flex-shrink:0; border:2px solid var(--primary);">
                    <div style="min-width:0;">
                      <div style="font-weight:800; font-size:0.9rem; color:var(--accent); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${ch.handle}</div>
                      <div style="font-size:0.78rem; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${ch.title}</div>
                    </div>
                  </div>
                  <button type="button" class="btn ${ch.isSubscribed ? 'btn-secondary' : 'btn-primary'} btn-sm" onclick="toggleKidYouTubeChannelSub('${safeHandle}', '${safeTitle}', '${safeAvatar}', '${safeCid}', event)" style="flex-shrink:0;">
                    ${ch.isSubscribed ? 'Subscribed' : 'Subscribe'}
                  </button>
                </div>
              `;
            }).join('')}
          </div>
        `;

      const subscribedYtChannelsHtml = !kidYtSubscribedChannels.length
        ? ''
        : `
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.65rem;">
            <h4 style="margin:0; color:#ffd166; font-size:1rem;">My Subscribed YouTube Channels (@)</h4>
            <span style="font-size:0.8rem; color:var(--text-muted);">${kidYtSubscribedChannels.length} subscribed</span>
          </div>
          <div style="display:flex; gap:0.6rem; overflow-x:auto; padding-bottom:0.5rem; margin-bottom:1.25rem;">
            ${kidYtSubscribedChannels.map((ch) => {
              const safeHandle = (ch.handle || '').replace(/'/g, "\\'");
              const isTrusted = ch.trustLevel === 'TRUSTED';
              return `
                <button type="button" class="filter-pill" onclick="openKidYouTubeChannelVideos('${safeHandle}')" style="display:inline-flex; align-items:center; gap:0.5rem; white-space:nowrap;">
                  ${ch.avatarUrl ? `<img src="${ch.avatarUrl}" alt="" style="width:22px; height:22px; border-radius:50%; object-fit:cover;">` : ''}
                  <span style="font-weight:700;">${ch.handle}</span>
                  ${isTrusted ? '<span style="font-size:0.7rem; color:var(--success); font-weight:800;" title="Parent-Trusted (Auto-Approved)">✓ Trusted</span>' : ''}
                </button>
              `;
            }).join('')}
          </div>
        `;

      resultsEl.innerHTML = `
        ${subscribedYtChannelsHtml}
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.75rem;">
          <h4 style="margin:0; color:var(--success); font-size:1.05rem;">Curated Safe Videos</h4>
          <span style="font-size:0.82rem; color:var(--text-muted);">${visibleCurated.length} of ${kidCuratedSearchResults.length}</span>
        </div>
        ${curatedHtml}
        ${ytChannelsHtml}
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.75rem;">
          <h4 style="margin:0; color:var(--accent); font-size:1.05rem;">YouTube Videos</h4>
          ${kidSearchResults.length ? `<span style="font-size:0.82rem; color:var(--text-muted);">${visibleYt.length} of ${kidSearchResults.length}</span>` : ''}
        </div>
        ${ytHtml}
      `;
    }

    async function watchSearchedYouTubeVideo(idx) {
      const v = kidSearchResults[idx];
      if (!v) return;
      const statusEl = document.getElementById('kidSearchStatusBanner');
      if (currentUser?.role === 'CHILD' && currentUser?.ageRating === 'TODDLER' && !(v.isCurated || v.approvalStatus === 'APPROVED' || v.inHistory)) {
        if (statusEl) {
          statusEl.style.display = 'block';
          statusEl.style.background = 'rgba(255, 51, 102, 0.14)';
          statusEl.style.border = '1px solid rgba(255, 51, 102, 0.35)';
          statusEl.textContent = 'Toddlers cannot request video approvals.';
        } else {
          alert('Toddlers cannot request video approvals.');
        }
        return;
      }
      try {
        const res = await authFetch('/api/kids/youtube-search/watch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            youtubeVideoId: v.youtubeVideoId,
            title: v.title,
            channelTitle: v.channelTitle,
            thumbnailUrl: v.thumbnailUrl
          })
        });
        const json = await res.json();
        if (!json.success) {
          alert(json.message || 'Unable to open video');
          return;
        }
        const data = json.data || {};
        if (data.searchSettings) {
          if (currentUser) Object.assign(currentUser, data.searchSettings);
          updateKidSearchQuotaBadge(data.searchSettings);
        }
        if (data.allowed) {
          v.inHistory = true;
          if (!v.isCurated) v.approvalStatus = 'APPROVED';
          renderKidYouTubeSearchResults();
          previewVideo({
            id: v.curatedVideoId || v.youtubeVideoId,
            youtubeVideoId: v.youtubeVideoId,
            sourceType: 'YOUTUBE',
            sourceUrl: v.sourceUrl,
            title: v.title,
            channelTitle: v.channelTitle,
            thumbnailUrl: v.thumbnailUrl,
            description: `From ${v.channelTitle}`
          });
          return;
        }
        if (data.reason === 'APPROVAL_REQUIRED') {
          v.approvalStatus = 'PENDING';
          renderKidYouTubeSearchResults();
        }
        if (statusEl) {
          statusEl.style.display = 'block';
          statusEl.style.background = 'rgba(76, 201, 240, 0.14)';
          statusEl.style.border = '1px solid rgba(76, 201, 240, 0.3)';
          statusEl.textContent = data.message || 'Permission request sent to your parent!';
        } else {
          alert(data.message || 'Permission request sent to your parent!');
        }
      } catch {
        alert('Failed to check video permission.');
      }
    }

    async function recordKidHistoryItem(video) {
      if (!authToken || !video) return;
      try {
        await authFetch('/api/kids/history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            itemKey: video.youtubeVideoId || video.id,
            youtubeVideoId: video.youtubeVideoId,
            videoId: video.id,
            title: video.title,
            channelTitle: video.channelTitle || 'FamiTube',
            thumbnailUrl: video.thumbnailUrl || '',
            sourceType: video.sourceType || 'YOUTUBE',
            sourceUrl: video.sourceUrl || ''
          })
        });
      } catch {}
    }

    async function loadKidHistory() {
      const grid = document.getElementById('kidHistoryGrid');
      if (!grid || !authToken) return;
      if (!kidHistoryItems.length) grid.innerHTML = '<p style="color:var(--text-muted);">Loading history...</p>';
      try {
        const [histRes, plRes] = await Promise.all([
          authFetch('/api/kids/history'),
          authFetch('/api/kids/playlists')
        ]);
        const histJson = await histRes.json();
        const plJson = await plRes.json();
        kidHistoryItems = histJson.success ? (histJson.data || []) : [];
        kidPlaylists = plJson.success ? (plJson.data || []) : [];
        kidHistoryVisibleLimit = Math.max(kidHistoryVisibleLimit, getYouTubePageSize());
        renderKidHistory();
      } catch {
        grid.innerHTML = '<p style="color:var(--text-muted);">Unable to load watch history.</p>';
      }
    }

    function renderKidHistory() {
      const grid = document.getElementById('kidHistoryGrid');
      if (!grid) return;
      if (!kidHistoryItems.length) {
        grid.innerHTML = '<p style="color:var(--text-muted);">No videos in your history yet. Watch a curated video or request a YouTube search video!</p>';
        return;
      }
      const more = document.getElementById('kidHistoryMore');
      const visibleHist = kidHistoryItems.slice(0, kidHistoryVisibleLimit || getYouTubePageSize());
      if (more) more.innerHTML = kidHistoryItems.length > visibleHist.length ? `<button type="button" class="btn btn-secondary" onclick="showMoreKidHistory()" style="width:100%; justify-content:center;">Show More History (${kidHistoryItems.length - visibleHist.length} more)</button>` : '';
      grid.innerHTML = visibleHist.map((h, idx) => `
        <div class="card video-card" style="display:flex; flex-direction:column;">
          <div class="video-thumb" onclick="playKidHistoryItem(${idx})" style="cursor:pointer;">
            <img src="${h.thumbnailUrl}" alt="${h.title}" loading="lazy">
            <div class="play-overlay"><span class="material-symbols-rounded">play_arrow</span></div>
          </div>
          <div class="video-info" style="flex:1; display:flex; flex-direction:column; gap:0.4rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:0.4rem;">
              <span style="font-size:0.76rem; color:var(--text-muted);">${h.channelTitle}</span>
              ${h.isApprovedSearch ? '<span class="channel-type-badge ondemand" style="background:rgba(6,214,160,0.16); color:var(--success);">Approved</span>' : ''}
            </div>
            <div class="video-title" onclick="playKidHistoryItem(${idx})" style="cursor:pointer;">${h.title}</div>
            <div style="margin-top:auto; padding-top:0.4rem; display:flex; gap:0.4rem; flex-wrap:wrap; align-items:center;">
              <button type="button" class="btn btn-primary btn-sm" onclick="playKidHistoryItem(${idx})">Watch</button>
              ${kidPlaylists.length ? `
                <select id="histPlSelect_${idx}" style="padding:0.28rem 0.45rem; border-radius:4px; border:1px solid var(--border); background:var(--bg); color:var(--text); font-size:0.76rem; max-width:130px;">
                  ${kidPlaylists.map(pl => `<option value="${pl.id}">${pl.title}</option>`).join('')}
                </select>
                <button type="button" class="btn btn-secondary btn-sm" onclick="addHistoryItemToPlaylist(${idx})">+ List</button>
              ` : `<button type="button" class="btn btn-secondary btn-sm" onclick="switchKidShowcaseTab('favorites')">See Favorites</button>`}
            </div>
          </div>
        </div>
      `).join('');
    }

    function showMoreKidHistory() {
      kidHistoryVisibleLimit = (kidHistoryVisibleLimit || getYouTubePageSize()) + getYouTubePageSize();
      renderKidHistory();
    }

    function playKidHistoryItem(idx) {
      const h = kidHistoryItems[idx];
      if (!h) return;
      previewVideo({
        id: h.videoId || h.itemKey,
        youtubeVideoId: h.youtubeVideoId,
        sourceType: h.sourceType || 'YOUTUBE',
        sourceUrl: h.sourceUrl,
        title: h.title,
        channelTitle: h.channelTitle,
        thumbnailUrl: h.thumbnailUrl,
        description: `Watched from ${h.channelTitle}`
      });
    }

    async function addHistoryItemToPlaylist(idx) {
      const h = kidHistoryItems[idx];
      const sel = document.getElementById(`histPlSelect_${idx}`);
      const playlistId = sel?.value;
      if (!h || !playlistId) return;
      const r = await addVideoToKidList(playlistId, {
        id: h.videoId || h.itemKey, youtubeVideoId: h.youtubeVideoId, title: h.title,
        channelTitle: h.channelTitle, thumbnailUrl: h.thumbnailUrl, sourceType: h.sourceType, sourceUrl: h.sourceUrl
      });
      alert(r.ok ? 'Added to list!' : r.message);
    }

    async function loadKidPlaylists() {
      if (!authToken) return;
      try {
        const res = await authFetch('/api/kids/playlists');
        const json = await res.json();
        kidPlaylists = json.success ? (json.data || []) : [];
      } catch {}
      if (activeKidTab === 'favorites') renderKidFavorites();
    }

    function playKidPlaylistItem(playlistId, iIdx) {
      const pl = kidPlaylists.find(p => p.id === playlistId);
      const item = pl?.items?.[iIdx];
      if (!item) return;
      previewVideo({
        id: item.videoId || item.key,
        youtubeVideoId: item.youtubeVideoId,
        sourceType: item.sourceType || 'YOUTUBE',
        sourceUrl: item.sourceUrl,
        title: item.title,
        channelTitle: item.channelTitle,
        thumbnailUrl: item.thumbnailUrl,
        description: `From list: ${pl.title}`
      });
    }

    async function removeKidPlaylistItem(playlistId, itemKey) {
      const res = await authFetch(`/api/kids/playlists/${playlistId}/items/${encodeURIComponent(itemKey)}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) await loadKidPlaylists();
    }

    async function deleteKidPlaylist(playlistId) {
      if (!confirm('Delete this list? Your videos stay in Favorites.')) return;
      const res = await authFetch(`/api/kids/playlists/${playlistId}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) { kidFavActiveList = null; await loadKidPlaylists(); }
    }

    async function populateModalPlaylistBar() {
      const bar = document.getElementById('modalPlaylistBar');
      const sel = document.getElementById('modalPlaylistSelect');
      const status = document.getElementById('modalPlaylistStatus');
      if (!bar || !sel) return;
      if (isSimpleKidUser(currentUser)) {
        bar.style.display = 'none';
        return;
      }
      if (status) status.textContent = '';
      await loadKidPlaylists();
      if (!kidPlaylists.length) {
        sel.innerHTML = '<option value="">(Create a list in My Favorites first)</option>';
      } else {
        sel.innerHTML = kidPlaylists.map(pl => `<option value="${kidEsc(pl.id)}">${kidEsc(pl.title)}</option>`).join('');
      }
      bar.style.display = 'flex';
    }

    async function addCurrentModalVideoToPlaylist() {
      if (isSimpleKidUser(currentUser)) return;
      const sel = document.getElementById('modalPlaylistSelect');
      const status = document.getElementById('modalPlaylistStatus');
      const playlistId = sel?.value;
      if (!playlistId || !activeModalVideo) return;
      const r = await addVideoToKidList(playlistId, activeModalVideo);
      if (status) status.textContent = r.ok ? 'Saved!' : r.message;
    }

    async function loadModalParentReviews(video) {
      const bar = document.getElementById('modalParentReviewBar');
      const formWrap = document.getElementById('modalParentReviewFormWrap');
      const summaryEl = document.getElementById('modalReviewSummaryBadge');
      const listEl = document.getElementById('modalParentReviewsList');
      const statusEl = document.getElementById('modalReviewStatus');
      const commentInput = document.getElementById('modalReviewCommentInput');
      if (!bar || !video) return;

      const key = video.id || video.youtubeVideoId;
      bar.style.display = 'block';
      if (statusEl) statusEl.textContent = '';
      if (commentInput) commentInput.value = '';
      if (formWrap) {
        formWrap.style.display = (authToken && currentUser?.role === 'PARENT') ? 'block' : 'none';
      }

      try {
        const res = await fetch(apiUrl(`/api/videos/${encodeURIComponent(key)}/reviews`));
        const json = await res.json();
        const reviews = json.success ? (json.data?.reviews || []) : [];
        const sum = json.data?.summary || { recommendedCount: 0, cautionCount: 0 };
        if (summaryEl) {
          summaryEl.textContent = `${sum.recommendedCount} Recommended • ${sum.cautionCount} Caution`;
        }
        if (listEl) {
          if (!reviews.length) {
            listEl.innerHTML = '<div style="font-size:0.8rem; color:var(--text-muted);">No parent reviews yet.</div>';
          } else {
            listEl.innerHTML = reviews.map(r => `
              <div style="padding:0.5rem 0.65rem; border-radius:6px; background:var(--bg); border:1px solid var(--border); font-size:0.8rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem;">
                  <strong>${r.parentName}</strong>
                  <span style="font-weight:700; color:${r.rating === 'RECOMMENDED' ? 'var(--success)' : 'var(--primary)'};">
                    ${r.rating === 'RECOMMENDED' ? 'Recommended' : 'Caution'}
                  </span>
                </div>
                <div style="color:var(--text-muted); margin-top:0.2rem;">${r.comment}</div>
              </div>
            `).join('');
          }
        }
      } catch {
        if (listEl) listEl.innerHTML = '';
      }
    }

    async function submitModalParentReview() {
      if (!activeModalVideo || !authToken || currentUser?.role !== 'PARENT') return;
      const key = activeModalVideo.id || activeModalVideo.youtubeVideoId;
      const ratingEl = document.querySelector('input[name="modalReviewRating"]:checked');
      const rating = ratingEl ? ratingEl.value : 'RECOMMENDED';
      const comment = (document.getElementById('modalReviewCommentInput')?.value || '').trim();
      const statusEl = document.getElementById('modalReviewStatus');
      if (!comment) {
        alert('Please write a comment explaining your rating.');
        return;
      }
      const res = await authFetch(`/api/parent/videos/${encodeURIComponent(key)}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating,
          comment,
          videoId: activeModalVideo.id,
          youtubeVideoId: activeModalVideo.youtubeVideoId,
          videoTitle: activeModalVideo.title,
          channelTitle: activeModalVideo.channelTitle || 'FamiTube',
          thumbnailUrl: activeModalVideo.thumbnailUrl || '',
          sourceType: activeModalVideo.sourceType || 'YOUTUBE',
          sourceUrl: activeModalVideo.sourceUrl || ''
        })
      });
      const json = await res.json();
      if (!json.success) return alert(json.message || 'Failed to save review');
      if (statusEl) statusEl.textContent = 'Review saved to community advisory list!';
      await loadModalParentReviews(activeModalVideo);
    }

    let advisoryListsCache = { recommended: [], caution: [] };

    async function loadParentAdvisoryLists() {
      const recEl = document.getElementById('advisoryRecommendedList');
      const cauEl = document.getElementById('advisoryCautionList');
      if (!recEl || !cauEl || !authToken) return;
      recEl.innerHTML = '<div style="color:var(--text-muted); font-size:0.85rem;">Loading...</div>';
      cauEl.innerHTML = '<div style="color:var(--text-muted); font-size:0.85rem;">Loading...</div>';
      try {
        const res = await authFetch('/api/parent/advisory-lists');
        const json = await res.json();
        advisoryListsCache = json.success && json.data ? json.data : { recommended: [], caution: [] };
        renderAdvisoryList('recommended', recEl, advisoryListsCache.recommended || []);
        renderAdvisoryList('caution', cauEl, advisoryListsCache.caution || []);
      } catch {
        recEl.innerHTML = '<div style="color:var(--text-muted); font-size:0.85rem;">Unable to load recommended list.</div>';
        cauEl.innerHTML = '<div style="color:var(--text-muted); font-size:0.85rem;">Unable to load caution list.</div>';
      }
    }

    function renderAdvisoryList(kind, container, items) {
      if (!items.length) {
        container.innerHTML = `<div style="color:var(--text-muted); font-size:0.85rem;">No ${kind === 'recommended' ? 'recommended' : 'caution'} videos yet. Preview any video to add your rating and comment!</div>`;
        return;
      }
      const writableChannels = (allChannels || []).filter(c => c.role === 'OWNER' || c.permissions?.canAddVideo);
      container.innerHTML = items.map((entry, idx) => `
        <div class="schedule-item" style="flex-direction:column; align-items:stretch; gap:0.55rem;">
          <div style="display:flex; gap:0.7rem; align-items:flex-start;">
            <img src="${entry.thumbnailUrl}" style="width:88px; height:52px; object-fit:cover; border-radius:6px; flex-shrink:0; cursor:pointer;" onclick="previewAdvisoryVideo('${kind}', ${idx})">
            <div style="min-width:0; flex:1;">
              <div style="font-weight:700; font-size:0.88rem; cursor:pointer;" onclick="previewAdvisoryVideo('${kind}', ${idx})">${entry.videoTitle}</div>
              <div style="font-size:0.76rem; color:var(--text-muted); margin-top:0.15rem;">
                ${entry.channelTitle} &bull; 👍 ${entry.recommendedCount} &bull; ⚠️ ${entry.cautionCount}
              </div>
            </div>
          </div>
          <div style="display:flex; flex-direction:column; gap:0.3rem;">
            ${entry.reviews.slice(0, 3).map(r => `
              <div style="font-size:0.78rem; padding:0.35rem 0.55rem; border-radius:4px; background:var(--surface); border:1px solid var(--border);">
                <strong>${r.parentName}</strong> (${r.rating === 'RECOMMENDED' ? 'Recommended' : 'Caution'}): ${r.comment}
              </div>
            `).join('')}
          </div>
          <div style="display:flex; gap:0.45rem; flex-wrap:wrap; align-items:center;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="previewAdvisoryVideo('${kind}', ${idx})">Preview</button>
            ${kind === 'recommended' && writableChannels.length && entry.videoId ? `
              <select id="advChanSelect_${idx}" style="padding:0.28rem 0.45rem; border-radius:4px; border:1px solid var(--border); background:var(--bg); color:var(--text); font-size:0.76rem; max-width:160px;">
                ${writableChannels.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
              </select>
              <button type="button" class="btn btn-primary btn-sm" onclick="addRecommendedVideoToChannel(${idx})">+ Add to Channel</button>
            ` : ''}
          </div>
        </div>
      `).join('');
    }

    function previewAdvisoryVideo(kind, idx) {
      const entry = (advisoryListsCache[kind] || [])[idx];
      if (!entry) return;
      previewVideo({
        id: entry.videoId || entry.videoKey,
        youtubeVideoId: entry.youtubeVideoId,
        sourceType: entry.sourceType || 'YOUTUBE',
        sourceUrl: entry.sourceUrl,
        title: entry.videoTitle,
        channelTitle: entry.channelTitle,
        thumbnailUrl: entry.thumbnailUrl,
        description: `Community ${kind} video from ${entry.channelTitle}`
      });
    }

    async function addRecommendedVideoToChannel(idx) {
      const entry = (advisoryListsCache.recommended || [])[idx];
      const channelId = document.getElementById(`advChanSelect_${idx}`)?.value;
      if (!entry?.videoId || !channelId) return;
      const res = await authFetch(`/api/channels/${channelId}/videos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: entry.videoId })
      });
      const json = await res.json();
      if (json.success) {
        alert('Added recommended video to your channel!');
        await loadChannels();
      } else {
        alert(json.message || 'Could not add video to channel');
      }
    }

    const THEME_PREF_KEY = 'FamiTube_theme';
    const LANG_PREF_KEY = 'FamiTube_lang';

    const I18N = {
      en: {
        nav_home: 'Home',
        nav_channels: 'Channels',
        nav_studio: 'Curate Catalog',
        sign_in: 'Sign In',
        guest_visitor: 'Guest Visitor',
        guest_sub: 'Sign in as Parent or Pair Kid Device',
        guest_child_title: 'Calm, 100% Parent-Curated Video for Every Stage of Childhood',
        guest_child_desc: 'Turn YouTube into a calm, distraction-free video space for Toddlers (1.5–3), Young Kids (4–6), and Older Kids (7+)—with Toddler TV Nap Cooldown, supervised @YouTube channels, and $0 curated videos forever.',
        guest_child_login_cta: 'Start Free as a Parent',
        guest_child_note: 'No emails or passwords needed for kids — add child profiles in seconds and switch anytime with "Who\'s Watching?".',
        guest_pill_yt_title: 'Curated Safe Channels',
        guest_pill_yt_desc: 'Hand-picked cartoons, science, music, and 24H Live TV.',
        guest_pill_web_title: 'Calm Toddler TV',
        guest_pill_web_desc: 'Slow-paced linear channels with gentle loops and Nap Cooldown.',
        guest_pill_stars_title: 'Calm by Design',
        guest_pill_stars_desc: 'Zero streaks, zero dopamine traps—just parent-approved videos & lists.',
        guest_parent_title: 'Learn more how FamiTube protects your children on the internet',
        guest_parent_desc: "Discover FamiTube's unique value proposition—100% parent-curated channels, age-rated child accounts, Calm Mode, and zero self-registration for kids.",
        guest_parent_learn_cta: 'Learn More',
        parent_sign_in: 'Parent / Curator Sign In',
        kids_sign_in: 'Pair Kid Device',
        language_label: 'Language',
        theme_label: 'Theme',
        theme_system: 'System',
        theme_light: 'Light',
        theme_dark: 'Dark',
        notifications_title: 'Notifications',
        logout: 'Logout',
        hero_title: 'Safe, Curated Kids Channels & Educational Videos',
        hero_desc: 'Pick a themed channel below to explore hand-picked, kid-friendly YouTube and educational videos. To add or manage content, switch to Curator Studio.',
        hero_safety_narration: "Discover how FamiTube protects your children from inappropriate content — it's the YouTube every parent wishes for.",
        hero_learn_more: 'Learn More >',
        nav_plans: 'Family Pass',
        nav_faq: 'FAQ',
        hero_compare_plans: 'Free vs. Family Pass >',
        hero_s1_badge: '100% Parent-Curated',
        hero_s1_title: 'Safe Video Without the Rabbit Hole',
        hero_s1_desc: 'Kids only see channels and videos explicitly approved by parents and trusted educators—no random autoplay, no toxic comments, and no algorithmic surprises.',
        hero_s1_cta: 'Explore Safe Channels',
        hero_s2_badge: 'Calm Mode & No Shorts',
        hero_s2_title: 'Designed for Focus, Not Endless Scrolling',
        hero_s2_desc: 'Block addictive Shorts, filter out hyper-stimulating content, and set daily watch limits with gentle bedtime lockouts.',
        hero_s2_cta: 'See Safety Controls',
        hero_s3_badge: 'Age Tiers & Calm Viewing',
        hero_s3_title: 'Turn Screen Time into Curiosity & Learning',
        hero_s3_desc: 'Tailor feeds across Toddlers (1.5–3), Young Kids (4–6), and Older Kids (7+) with Calm Mode, Study Mode, and tag filters parents control.',
        hero_s3_cta: 'Open Curator Studio',
        hero_s4_badge: 'Videos Free Forever',
        hero_s4_title: 'Every Video Is Free. Pay Only for Family Scale.',
        hero_s4_desc: 'Watch all curated videos at $0 with zero paywalls. Upgrade to Family Pass only when you want unlimited child profiles, custom tag rules, and private family channels.',
        hero_s4_cta: 'Compare Free vs. Family Pass',
        featured_channels: 'Featured Channels',
        channel_search_title: 'Browse & Search Channels',
        channel_search_desc: 'Filter safe, curated channels by category or search by channel name and topic.',
        filter_all_types: 'All Types',
        filter_live_tv: 'Live TV (24H)',
        filter_on_demand: 'On Demand',
        filter_all_categories: 'All Categories'
      },
      id: {
        nav_home: 'Beranda',
        nav_channels: 'Saluran',
        nav_studio: 'Kelola Katalog',
        sign_in: 'Masuk',
        guest_visitor: 'Tamu',
        guest_sub: 'Masuk sebagai Orang Tua atau Tautkan Perangkat Anak',
        guest_child_title: 'Video Tenang & 100% Terkurasi Orang Tua untuk Setiap Tahap Tumbuh Kembang Anak',
        guest_child_desc: 'Ubah YouTube menjadi ruang video yang tenang dan bebas distraksi untuk Balita (1.5–3), Anak Kecil (4–6), dan Anak Lebih Besar (7+)—lengkap dengan Jeda Tidur TV Balita, saluran @YouTube terawasi, dan video terkurasi Rp 0 selamanya.',
        guest_child_login_cta: 'Mulai Gratis sebagai Orang Tua',
        guest_child_note: 'Tanpa email atau kata sandi untuk anak — buat profil anak dalam hitungan detik dan ganti kapan saja melalui "Siapa yang Menonton?".',
        guest_pill_yt_title: 'Saluran Aman Terkurasi',
        guest_pill_yt_desc: 'Kartun pilihan, sains, musik, dan TV Langsung 24 Jam.',
        guest_pill_web_title: 'TV Balita Tenang',
        guest_pill_web_desc: 'Saluran linear bertempo lambat dengan loop lembut dan Nap Cooldown.',
        guest_pill_stars_title: 'Tenang Sejak Awal',
        guest_pill_stars_desc: 'Tanpa streak atau jebakan dopamin—hanya video & daftar pilihan orang tua.',
        guest_parent_title: 'Pelajari bagaimana FamiTube melindungi anak Anda di internet',
        guest_parent_desc: 'Temukan keunggulan unik FamiTube—100% saluran terkurasi orang tua, akun anak berdasarkan usia, Mode Tenang, dan tanpa pendaftaran mandiri untuk anak.',
        guest_parent_learn_cta: 'Pelajari Lebih Lanjut',
        parent_sign_in: 'Masuk Orang Tua / Kurator',
        kids_sign_in: 'Tautkan Perangkat Anak',
        language_label: 'Bahasa',
        theme_label: 'Tema',
        theme_system: 'Sistem',
        theme_light: 'Terang',
        theme_dark: 'Gelap',
        notifications_title: 'Notifikasi',
        logout: 'Keluar',
        hero_title: 'Saluran Anak Terkurasi & Video Edukatif yang Aman',
        hero_desc: 'Pilih saluran di bawah untuk menonton video YouTube dan edukatif ramah anak pilihan. Untuk mengelola konten, buka Studio Kurator.',
        hero_safety_narration: 'Pelajari bagaimana FamiTube melindungi anak Anda dari konten tidak pantas — YouTube impian setiap orang tua.',
        hero_learn_more: 'Pelajari Lebih Lanjut >',
        nav_plans: 'Family Pass',
        nav_faq: 'FAQ',
        hero_compare_plans: 'Gratis vs. Family Pass >',
        hero_s1_badge: '100% Terkurasi Orang Tua',
        hero_s1_title: 'Tontonan Aman Tanpa Jebakan Algoritma',
        hero_s1_desc: 'Anak hanya melihat saluran dan video yang disetujui orang tua serta pendidik tepercaya—tanpa autoplay acak, tanpa komentar negatif, dan tanpa kejutan algoritma.',
        hero_s1_cta: 'Jelajahi Saluran Aman',
        hero_s2_badge: 'Mode Tenang & Tanpa Shorts',
        hero_s2_title: 'Dirancang untuk Fokus, Bukan Gulir Tanpa Henti',
        hero_s2_desc: 'Blokir Shorts yang adiktif, saring tontonan hiper-stimulasi, dan atur batas waktu harian dengan kunci waktu tidur yang lembut.',
        hero_s2_cta: 'Lihat Kontrol Keamanan',
        hero_s3_badge: 'Tingkatan Usia & Tontonan Tenang',
        hero_s3_title: 'Ubah Waktu Layar Menjadi Belajar & Eksplorasi',
        hero_s3_desc: 'Sesuaikan feed untuk Balita (1,5–3), Anak Kecil (4–6), dan Anak Lebih Besar (7+) dengan Mode Tenang, Mode Belajar, dan filter tag yang dikontrol orang tua.',
        hero_s3_cta: 'Buka Studio Kurator',
        hero_s4_badge: 'Video Gratis Selamanya',
        hero_s4_title: 'Semua Video Gratis. Bayar Hanya untuk Skala Keluarga.',
        hero_s4_desc: 'Tonton semua video terkurasi Rp 0 tanpa paywall. Upgrade ke Family Pass hanya jika Anda butuh profil banyak anak, aturan tag kustom, dan saluran keluarga privat.',
        hero_s4_cta: 'Bandingkan Gratis vs. Family Pass',
        featured_channels: 'Saluran Unggulan',
        channel_search_title: 'Jelajahi & Cari Saluran',
        channel_search_desc: 'Filter saluran terkurasi berdasarkan kategori atau cari berdasarkan nama dan topik.',
        filter_all_types: 'Semua Tipe',
        filter_live_tv: 'TV Langsung (24J)',
        filter_on_demand: 'Sesuai Permintaan',
        filter_all_categories: 'Semua Kategori'
      }
    };

    function applyTheme(pref) {
      const choice = ['light', 'dark', 'system'].includes(pref) ? pref : 'light';
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      const resolved = choice === 'system' ? (prefersDark ? 'dark' : 'light') : choice;
      document.documentElement.setAttribute('data-theme', resolved);
      ['guestThemeSelect', 'userThemeSelect'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = choice;
      });
    }

    function setThemePreference(pref) {
      localStorage.setItem(THEME_PREF_KEY, pref);
      applyTheme(pref);
    }

    function applyLanguage(lang) {
      const choice = lang === 'id' ? 'id' : 'en';
      const dict = I18N[choice];
      document.documentElement.lang = choice;
      document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (dict[key]) el.textContent = dict[key];
      });
      ['guestLangSelect', 'userLangSelect'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = choice;
      });
    }

    function setLanguagePreference(lang) {
      localStorage.setItem(LANG_PREF_KEY, lang);
      applyLanguage(lang);
    }

    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if ((localStorage.getItem(THEME_PREF_KEY) || 'light') === 'system') {
          applyTheme('system');
        }
      });
    }

    // Init: show public showcase by default; Curator Studio stays behind login wall
    async function initApp() {
      applyTheme(localStorage.getItem(THEME_PREF_KEY) || 'light');
      applyLanguage(localStorage.getItem(LANG_PREF_KEY) || 'en');

      const initParams = new URLSearchParams(window.location.search);
      const googleAuthToken = initParams.get('google_auth_token');
      const googleAuthError = initParams.get('google_auth_error');
      const googleLoginRole = initParams.get('login_role');

      if (googleAuthToken || googleAuthError) {
        initParams.delete('google_auth_token');
        initParams.delete('google_auth_error');
        initParams.delete('login_role');
        const cleanQuery = initParams.toString();
        const cleanUrl = window.location.pathname + (cleanQuery ? `?${cleanQuery}` : '') + window.location.hash;
        history.replaceState(null, '', cleanUrl);
      }

      if (googleAuthToken) {
        authToken = googleAuthToken;
        localStorage.setItem(AUTH_TOKEN_KEY, authToken);
      }

      if (authToken) {
        try {
          const cachedUserRaw = localStorage.getItem(AUTH_USER_KEY);
          if (cachedUserRaw) {
            currentUser = JSON.parse(cachedUserRaw);
            applyUserHeaderUI(currentUser);
          }
        } catch {
          localStorage.removeItem(AUTH_USER_KEY);
        }
        try {
          const res = await fetch(apiUrl('/api/auth/me'), {
            headers: { Authorization: `Bearer ${authToken}` }
          });
          const json = await res.json();
          if (res.ok && json.success) {
            currentUser = json.user;
            localStorage.setItem(AUTH_USER_KEY, JSON.stringify(json.user));
            applyUserHeaderUI(json.user);
            if (googleAuthToken) {
              handleAuthenticatedUser(json.user);
              return;
            }
          } else if (res.status === 401 || res.status === 403) {
            authToken = '';
            currentUser = null;
            localStorage.removeItem(AUTH_TOKEN_KEY);
            localStorage.removeItem(AUTH_USER_KEY);
            document.getElementById('userBar').style.display = 'none';
            document.getElementById('loggedInWelcomeBanner').style.display = 'none';
            document.getElementById('guestProfileMenu').style.display = 'flex';
            document.getElementById('btnModeStudio').style.display = 'none';
          }
        } catch {
          // keep cached session UI if API is temporarily unreachable
        }
      }

      if (googleAuthError) {
        showAuthGate(googleLoginRole === 'CHILD' ? 'CHILD' : 'PARENT');
        showAuthAlert(googleAuthError, true);
        return;
      }

      const modeParam = new URLSearchParams(window.location.search).get('mode');
      if (modeParam === 'studio' && currentUser?.role !== 'CHILD') {
        await openStudio();
      } else if (window.location.hash.startsWith('#channel/')) {
        const chId = window.location.hash.replace('#channel/', '');
        openChannelPage(chId);
      } else if (window.location.hash === '#channels' || modeParam === 'channels') {
        openChannelsNav();
      } else {
        openHome(currentUser?.role === 'CHILD');
      }
      checkInviteQueryParam();
    }

    window.addEventListener('hashchange', () => {
      if (window.location.hash.startsWith('#channel/')) {
        const chId = window.location.hash.replace('#channel/', '');
        openChannelPage(chId);
      } else if (window.location.hash === '#channels') {
        openChannelsNav();
      }
    });

    initApp();

    (function initHeroCarousel() {
      const card = document.getElementById('showcaseHeroCard');
      if (!card) return;
      const slides = Array.from(card.querySelectorAll('.hero-slide'));
      const dots = Array.from(card.querySelectorAll('.hero-dot'));
      const prevBtn = document.getElementById('heroPrevBtn');
      const nextBtn = document.getElementById('heroNextBtn');
      if (!slides.length) return;

      let activeIdx = 0;
      let timer = null;

      function showSlide(idx) {
        activeIdx = (idx + slides.length) % slides.length;
        slides.forEach((s, i) => s.classList.toggle('active', i === activeIdx));
        dots.forEach((d, i) => d.classList.toggle('active', i === activeIdx));
      }

      function startAuto() {
        stopAuto();
        timer = setInterval(() => showSlide(activeIdx + 1), 6000);
      }

      function stopAuto() {
        if (timer) {
          clearInterval(timer);
          timer = null;
        }
      }

      dots.forEach((dot, i) => {
        dot.addEventListener('click', () => {
          showSlide(i);
          startAuto();
        });
      });

      prevBtn?.addEventListener('click', () => {
        showSlide(activeIdx - 1);
        startAuto();
      });

      nextBtn?.addEventListener('click', () => {
        showSlide(activeIdx + 1);
        startAuto();
      });

      card.addEventListener('mouseenter', stopAuto);
      card.addEventListener('mouseleave', startAuto);
      card.addEventListener('focusin', stopAuto);
      card.addEventListener('focusout', startAuto);

      startAuto();
    })();

    // ==========================================
    // STORYBOOKS & MIC-LOCKED READ-ALONG (WEB + STUDIO)
    // ==========================================
