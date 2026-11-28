    let FALLBACK_STORY_BOOKS = [];
    let fallbackStoriesLoadPromise = null;
    async function ensureFallbackStoryBooksLoaded() {
      if (FALLBACK_STORY_BOOKS.length > 0) return FALLBACK_STORY_BOOKS;
      if (!fallbackStoriesLoadPromise) {
        fallbackStoriesLoadPromise = fetch('assets/fallback-stories.json')
          .then(r => (r.ok ? r.json() : []))
          .then(data => {
            if (Array.isArray(data)) FALLBACK_STORY_BOOKS = data;
            return FALLBACK_STORY_BOOKS;
          })
          .catch(() => []);
      }
      return fallbackStoriesLoadPromise;
    }

    let kidStoriesCache = [];
    let kidStoryLangFilter = 'all';
    let kidStoryCategoryFilter = 'all';
    let kidStorySearchQuery = '';
    let kidStoryCurrentPage = 1;
    let kidStoryPageLimit = 24;
    let kidStoryTotalPages = 1;
    let kidStoryTotalCount = 0;
    let kidStoryBrowseAll = false;
    let kidStorySearchDebounceTimer = null;
    let activeStoryBook = null;
    let activeStoryPageIdx = 0;
    let activeStoryMode = 'FLIP';
    let activeStoryCompletedPages = new Set();
    let activeStoryWordIdx = 0;
    let activeStoryStuckAttempts = 0;
    let activeStoryLastTranscript = '';
    let activeStoryHintMsg = '';
    let activeStoryFlipDir = '';
    let activeStoryCompletionResult = null;
    let storyMicRecognition = null;
    let storyMicListening = false;
    let storyTouchStartX = null;

    const STORY_NUMBER_SYNONYMS = {
      '0': ['zero', 'nol'], '1': ['one', 'satu'], '2': ['two', 'dua'], '3': ['three', 'tiga'],
      '4': ['four', 'empat'], '5': ['five', 'lima'], '6': ['six', 'enam'], '7': ['seven', 'tujuh'],
      '8': ['eight', 'delapan'], '9': ['nine', 'sembilan'], '10': ['ten', 'sepuluh']
    };

    function normalizeStoryWord(raw) {
      return String(raw || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    function storyLevenshtein(a, b) {
      if (a === b) return 0;
      const m = a.length, n = b.length;
      if (!m) return n;
      if (!n) return m;
      const dp = Array.from({ length: n + 1 }, (_, j) => j);
      for (let i = 1; i <= m; i++) {
        let prev = dp[0];
        dp[0] = i;
        for (let j = 1; j <= n; j++) {
          const tmp = dp[j];
          dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
          prev = tmp;
        }
      }
      return dp[n];
    }

    function storyWordsMatch(targetRaw, spokenRaw) {
      const target = normalizeStoryWord(targetRaw);
      const spoken = normalizeStoryWord(spokenRaw);
      if (!target || !spoken) return false;
      if (target === spoken) return true;
      for (const [digit, words] of Object.entries(STORY_NUMBER_SYNONYMS)) {
        if ((target === digit || words.includes(target)) && (spoken === digit || words.includes(spoken))) {
          return true;
        }
      }
      const dist = storyLevenshtein(target, spoken);
      if (target.length >= 7 && dist <= 2) return true;
      if (target.length >= 4 && dist <= 1) return true;
      return false;
    }

    function getActiveStoryPageWords() {
      const page = activeStoryBook?.pages?.[activeStoryPageIdx];
      return String(page?.text || '').trim().split(/\s+/).filter(Boolean);
    }

    function stopStoryAudioAndMic() {
      try { window.speechSynthesis?.cancel(); } catch {}
      if (storyMicRecognition) {
        try { storyMicRecognition.onend = null; storyMicRecognition.stop(); } catch {}
        storyMicRecognition = null;
      }
      storyMicListening = false;
    }

    let cachedStoryVoices = [];
    function initStoryVoices() {
      if (!window.speechSynthesis) return;
      cachedStoryVoices = window.speechSynthesis.getVoices() || [];
      if (typeof window.speechSynthesis.onvoiceschanged !== 'undefined') {
        window.speechSynthesis.onvoiceschanged = () => {
          cachedStoryVoices = window.speechSynthesis.getVoices() || [];
        };
      }
    }
    initStoryVoices();

    function getBestStoryVoice(lang) {
      if (!window.speechSynthesis) return null;
      if (!cachedStoryVoices.length) {
        cachedStoryVoices = window.speechSynthesis.getVoices() || [];
      }
      const targetPrefix = lang === 'id' ? 'id' : 'en';
      const matching = cachedStoryVoices.filter(v => v.lang && v.lang.toLowerCase().replace('_', '-').startsWith(targetPrefix));
      if (!matching.length) return null;

      const scored = matching.map(v => {
        const name = (v.name || '').toLowerCase();
        let score = 0;
        // Priority for natural, neural, and high-fidelity cloud/local voices
        if (name.includes('natural')) score += 60;
        if (name.includes('neural')) score += 55;
        if (name.includes('online')) score += 40;
        if (name.includes('google')) score += 35;
        if (name.includes('enhanced') || name.includes('premium')) score += 30;
        // Warm, friendly storytelling voices (Edge Natural Jenny/Aria/Gadis, Apple Samantha/Karen, Android Google)
        if (name.includes('jenny') || name.includes('aria') || name.includes('gadis') || name.includes('samantha') || name.includes('karen') || name.includes('victoria') || name.includes('steffi')) score += 25;
        if (name.includes('female')) score += 10;
        // Penalize tinny, robotic legacy desktop voices
        if (name.includes('desktop') || name.includes('david') || name.includes('mark') || name.includes('espeak')) score -= 40;
        return { voice: v, score };
      });
      scored.sort((a, b) => b.score - a.score);
      return scored[0]?.voice || matching[0];
    }

    function speakStoryText(text, lang) {
      if (!window.speechSynthesis || !text) return;
      try {
        window.speechSynthesis.cancel();
        // Insert gentle micro-pause after periods/commas for conversational breath
        const naturalText = String(text).replace(/([.?!])\s+/g, '$1  ');
        const utter = new SpeechSynthesisUtterance(naturalText);
        utter.lang = lang === 'id' ? 'id-ID' : 'en-US';
        const bestVoice = getBestStoryVoice(lang);
        if (bestVoice) {
          utter.voice = bestVoice;
        }
        // Human storytelling cadence: slightly warmer, gentle pitch and smooth pacing
        utter.rate = 0.92;
        utter.pitch = 1.08;
        window.speechSynthesis.speak(utter);
      } catch {}
    }

    function playStoryChime() {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        [523.25, 659.25, 783.99].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.08, ctx.currentTime + idx * 0.09);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.09 + 0.25);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(ctx.currentTime + idx * 0.09);
          osc.stop(ctx.currentTime + idx * 0.09 + 0.26);
        });
      } catch {}
    }

    function escapeHtml(str) {
      return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }

    async function loadAndRenderKidStories(resetPage = false) {
      const panel = document.getElementById('kidStoriesPanel');
      if (!panel) return;
      if (resetPage) kidStoryCurrentPage = 1;
      const ageRating = currentUser?.ageRating || 'YOUNG_KIDS';
      try {
        const params = new URLSearchParams();
        params.set('ageRating', ageRating);
        if (kidStoryBrowseAll) params.set('includeAllAges', 'true');
        if (kidStoryCategoryFilter !== 'all') params.set('category', kidStoryCategoryFilter);
        if (kidStorySearchQuery.trim()) params.set('search', kidStorySearchQuery.trim());
        params.set('page', String(kidStoryCurrentPage));
        params.set('limit', String(kidStoryPageLimit));

        const res = await authFetch('/api/stories?' + params.toString());
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          kidStoriesCache = json.data;
          kidStoryTotalCount = typeof json.total === 'number' ? json.total : json.data.length;
          kidStoryTotalPages = typeof json.totalPages === 'number' ? json.totalPages : Math.max(1, Math.ceil(kidStoryTotalCount / kidStoryPageLimit));
          kidStoryCurrentPage = typeof json.page === 'number' ? json.page : kidStoryCurrentPage;
        } else {
          await ensureFallbackStoryBooksLoaded();
          kidStoriesCache = filterFallbackStories(ageRating, kidStoryBrowseAll, kidStorySearchQuery.trim(), kidStoryCategoryFilter, 'all');
          kidStoryTotalCount = kidStoriesCache.length;
          kidStoryTotalPages = 1;
        }
      } catch {
        await ensureFallbackStoryBooksLoaded();
        kidStoriesCache = filterFallbackStories(ageRating, kidStoryBrowseAll, kidStorySearchQuery.trim(), kidStoryCategoryFilter, 'all');
        kidStoryTotalCount = kidStoriesCache.length;
        kidStoryTotalPages = 1;
      }
      renderKidStoriesPanel();
    }

    function changeKidStoryPage(delta) {
      const target = kidStoryCurrentPage + delta;
      if (target >= 1 && target <= kidStoryTotalPages) {
        kidStoryCurrentPage = target;
        loadAndRenderKidStories(false);
      }
    }

    function onKidStorySearchInput(val) {
      kidStorySearchQuery = val;
      clearTimeout(kidStorySearchDebounceTimer);
      kidStorySearchDebounceTimer = setTimeout(() => {
        loadAndRenderKidStories(true);
      }, 250);
    }

    function filterFallbackStories(ageRating, includeAll, search, category, lang) {
      let books = FALLBACK_STORY_BOOKS.slice();
      if (!includeAll) {
        if (ageRating === 'TODDLER') books = books.filter(b => b.ageRating === 'TODDLER');
        else if (ageRating === 'YOUNG_KIDS') books = books.slice().sort((a, b) => (a.ageRating === b.ageRating ? 0 : a.ageRating === 'YOUNG_KIDS' ? -1 : 1));
        else books = [];
      }
      if (lang && lang !== 'all') books = books.filter(b => b.language === lang);
      if (category && category !== 'all') books = books.filter(b => b.category?.toLowerCase().includes(category.toLowerCase()));
      if (search) {
        const s = search.toLowerCase();
        books = books.filter(b =>
          b.title.toLowerCase().includes(s) ||
          b.author?.toLowerCase().includes(s) ||
          b.description?.toLowerCase().includes(s) ||
          (Array.isArray(b.tags) && b.tags.some(t => String(t).toLowerCase().includes(s))) ||
          (b.pages || []).some(p => p.text?.toLowerCase().includes(s))
        );
      }
      return books;
    }

    function openStoryBook(storyId) {
      const book = kidStoriesCache.find(b => b.id === storyId) || FALLBACK_STORY_BOOKS.find(b => b.id === storyId);
      if (!book) return;
      stopStoryAudioAndMic();
      activeStoryBook = book;
      activeStoryPageIdx = 0;
      const effectiveAge = currentUser?.ageRating || 'YOUNG_KIDS';
      activeStoryMode = effectiveAge === 'TODDLER' ? 'FLIP' : 'READ_ALONG';
      activeStoryCompletedPages = new Set();
      activeStoryWordIdx = 0;
      activeStoryStuckAttempts = 0;
      activeStoryLastTranscript = '';
      activeStoryHintMsg = '';
      activeStoryFlipDir = '';
      activeStoryCompletionResult = null;
      document.body.style.overflow = 'hidden';
      renderKidStoriesPanel();
      if (activeStoryMode === 'READ_ALONG') {
        setTimeout(() => toggleStoryMic(true), 350);
      }
    }

    function closeStoryBook() {
      stopStoryAudioAndMic();
      if (document.fullscreenElement) {
        try { document.exitFullscreen(); } catch {}
      }
      document.body.style.overflow = '';
      activeStoryBook = null;
      activeStoryCompletionResult = null;
      renderKidStoriesPanel();
    }

    function toggleStoryFullscreen() {
      const el = document.getElementById('storyImmersiveOverlay');
      if (!el) return;
      if (!document.fullscreenElement) {
        if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      } else {
        if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      }
    }

    window.addEventListener('keydown', (e) => {
      if (!activeStoryBook) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        flipStoryPage(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        flipStoryPage(-1);
      } else if (e.key === 'Escape') {
        if (document.fullscreenElement) {
          try { document.exitFullscreen(); } catch {}
        } else {
          closeStoryBook();
        }
      }
    });

    function setStoryReadingMode(mode) {
      stopStoryAudioAndMic();
      activeStoryMode = mode === 'READ_ALONG' ? 'READ_ALONG' : 'FLIP';
      activeStoryWordIdx = 0;
      activeStoryStuckAttempts = 0;
      activeStoryLastTranscript = '';
      activeStoryHintMsg = '';
      renderKidStoriesPanel();
      if (activeStoryMode === 'READ_ALONG' && !isActiveStoryPageUnlocked()) {
        setTimeout(() => toggleStoryMic(true), 350);
      }
    }

    function isActiveStoryPageUnlocked() {
      if (activeStoryMode !== 'READ_ALONG') return true;
      if (activeStoryCompletedPages.has(activeStoryPageIdx)) return true;
      const words = getActiveStoryPageWords();
      return words.length === 0 || activeStoryWordIdx >= words.length;
    }

    function flipStoryPage(delta) {
      if (!activeStoryBook) return;
      if (delta > 0 && !isActiveStoryPageUnlocked()) {
        const btn = document.getElementById('storyNextPageBtn');
        if (btn) {
          btn.classList.remove('story-shake');
          void btn.offsetWidth;
          btn.classList.add('story-shake');
        }
        activeStoryHintMsg = '🎤 Read all words on this page aloud to unlock the next page!';
        renderKidStoriesPanel();
        return;
      }
      const nextIdx = activeStoryPageIdx + delta;
      if (nextIdx < 0 || nextIdx >= activeStoryBook.pages.length) return;
      stopStoryAudioAndMic();
      activeStoryFlipDir = delta > 0 ? 'next' : 'prev';
      activeStoryPageIdx = nextIdx;
      const words = getActiveStoryPageWords();
      activeStoryWordIdx = activeStoryCompletedPages.has(nextIdx) ? words.length : 0;
      activeStoryStuckAttempts = 0;
      activeStoryLastTranscript = '';
      activeStoryHintMsg = '';
      renderKidStoriesPanel();
      if (activeStoryMode === 'READ_ALONG' && !isActiveStoryPageUnlocked()) {
        setTimeout(() => toggleStoryMic(true), 350);
      }
    }

    function matchSpokenToStoryPage(transcript, isFinal) {
      const words = getActiveStoryPageWords();
      if (!words.length || activeStoryWordIdx >= words.length) return;
      const spokenTokens = String(transcript || '').trim().split(/\s+/).filter(Boolean);
      if (!spokenTokens.length) return;
      activeStoryLastTranscript = transcript;

      let idx = activeStoryWordIdx;
      let advanced = false;
      for (const tok of spokenTokens) {
        if (idx >= words.length) break;
        if (storyWordsMatch(words[idx], tok)) {
          idx++;
          advanced = true;
        }
      }

      if (advanced) {
        activeStoryWordIdx = idx;
        activeStoryStuckAttempts = 0;
        if (idx >= words.length) {
          activeStoryCompletedPages.add(activeStoryPageIdx);
          playStoryChime();
          stopStoryAudioAndMic();
          const isLast = activeStoryPageIdx >= (activeStoryBook.pages || []).length - 1;
          activeStoryHintMsg = isLast ? '🎉 Awesome reading! Finishing story...' : '🎉 Awesome reading! Turning page...';
          renderKidStoriesPanel();
          setTimeout(() => {
            if (!activeStoryBook) return;
            if (isLast) finishActiveStoryBook();
            else flipStoryPage(1);
          }, 1200);
          return;
        } else {
          activeStoryHintMsg = '';
        }
      } else if (isFinal) {
        activeStoryStuckAttempts += 1;
        if (activeStoryStuckAttempts >= 3) {
          const stuckWord = words[activeStoryWordIdx];
          speakStoryText(stuckWord, activeStoryBook.language);
          activeStoryWordIdx += 1;
          activeStoryStuckAttempts = 0;
          if (activeStoryWordIdx >= words.length) {
            activeStoryCompletedPages.add(activeStoryPageIdx);
            playStoryChime();
            stopStoryAudioAndMic();
            const isLast = activeStoryPageIdx >= (activeStoryBook.pages || []).length - 1;
            activeStoryHintMsg = isLast ? '⭐ Nice try! Finishing story...' : '⭐ Nice try! Turning page...';
            renderKidStoriesPanel();
            setTimeout(() => {
              if (!activeStoryBook) return;
              if (isLast) finishActiveStoryBook();
              else flipStoryPage(1);
            }, 1200);
            return;
          } else {
            activeStoryHintMsg = `⭐ Nice try! "${stuckWord}" got a helper boost.`;
          }
        } else {
          activeStoryHintMsg = `Try saying "${words[activeStoryWordIdx]}" (attempt ${activeStoryStuckAttempts}/3) — or tap the word to hear it!`;
        }
      }
      renderKidStoriesPanel();
    }

    function toggleStoryMic(forceStart = false) {
      if (storyMicListening) {
        if (forceStart) return;
        stopStoryAudioAndMic();
        renderKidStoriesPanel();
        return;
      }
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) {
        activeStoryHintMsg = 'Speech recognition is not supported in this browser. Use the tap-word practice button below!';
        renderKidStoriesPanel();
        return;
      }
      try {
        const rec = new SR();
        rec.lang = activeStoryBook?.language === 'id' ? 'id-ID' : 'en-US';
        rec.continuous = true;
        rec.interimResults = true;
        rec.onresult = (event) => {
          let latest = '';
          let isFinal = false;
          for (let i = event.resultIndex; i < event.results.length; i++) {
            latest += event.results[i][0].transcript + ' ';
            if (event.results[i].isFinal) isFinal = true;
          }
          if (latest.trim()) matchSpokenToStoryPage(latest.trim(), isFinal);
        };
        rec.onerror = (e) => {
          if (e.error === 'not-allowed') {
            activeStoryHintMsg = 'Microphone permission denied. Please allow mic access or tap the practice button.';
            stopStoryAudioAndMic();
            renderKidStoriesPanel();
          }
        };
        rec.onend = () => {
          if (storyMicListening && activeStoryBook && activeStoryMode === 'READ_ALONG' && !isActiveStoryPageUnlocked()) {
            try { rec.start(); } catch { storyMicListening = false; renderKidStoriesPanel(); }
          } else {
            storyMicListening = false;
            renderKidStoriesPanel();
          }
        };
        storyMicRecognition = rec;
        storyMicListening = true;
        activeStoryHintMsg = '🎙️ Listening... Read each highlighted word aloud!';
        rec.start();
        renderKidStoriesPanel();
      } catch {
        storyMicListening = false;
        activeStoryHintMsg = 'Could not start microphone.';
        renderKidStoriesPanel();
      }
    }

    function markActiveStoryWordManualFallback() {
      const words = getActiveStoryPageWords();
      if (activeStoryWordIdx >= words.length) return;
      speakStoryText(words[activeStoryWordIdx], activeStoryBook.language);
      activeStoryWordIdx += 1;
      activeStoryStuckAttempts = 0;
      if (activeStoryWordIdx >= words.length) {
        activeStoryCompletedPages.add(activeStoryPageIdx);
        playStoryChime();
        stopStoryAudioAndMic();
        const isLast = activeStoryPageIdx >= (activeStoryBook.pages || []).length - 1;
        activeStoryHintMsg = isLast ? '🎉 Page complete! Finishing story...' : '🎉 Page complete! Turning page...';
        renderKidStoriesPanel();
        setTimeout(() => {
          if (!activeStoryBook) return;
          if (isLast) finishActiveStoryBook();
          else flipStoryPage(1);
        }, 1200);
        return;
      }
      renderKidStoriesPanel();
    }

    async function finishActiveStoryBook() {
      if (!activeStoryBook || !isActiveStoryPageUnlocked()) return;
      stopStoryAudioAndMic();
      playStoryChime();
      if (authToken) {
        try {
          await authFetch(`/api/kids/stories/${encodeURIComponent(activeStoryBook.id)}/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: activeStoryMode })
          });
        } catch {}
      }
      activeStoryCompletionResult = { completed: true };
      renderKidStoriesPanel();
    }

    function renderKidStoriesPanel() {
      const panel = document.getElementById('kidStoriesPanel');
      if (!panel) return;

      if (activeStoryBook) {
        if (activeStoryCompletionResult) {
          panel.innerHTML = `
            <div id="storyImmersiveOverlay" class="story-immersive-container" style="justify-content:center; align-items:center; padding:1.5rem;">
              <div class="story-backdrop-blur" style="background-image:url('${activeStoryBook.coverUrl}');"></div>
              <div class="story-backdrop-scrim"></div>
              <div class="card story-completion-card">
                <div style="font-size:3.8rem; margin-bottom:0.6rem;">🎉📖</div>
                <h2 style="font-family:'Fredoka',cursive; font-size:2rem; margin-bottom:0.4rem; color:inherit;">Story Complete!</h2>
                <p style="color:var(--text-muted); margin-bottom:1.5rem;">Awesome job finishing <strong>${activeStoryBook.title}</strong> in ${activeStoryMode === 'READ_ALONG' ? 'Read Aloud' : 'Read to Me'} mode!</p>
                <div style="display:flex; justify-content:center; gap:0.85rem; flex-wrap:wrap;">
                  <button type="button" class="btn btn-secondary" onclick="openStoryBook('${activeStoryBook.id}')">Read Again</button>
                  <button type="button" class="btn btn-primary" onclick="closeStoryBook()">Back to Story Shelf</button>
                </div>
              </div>
            </div>
          `;
          return;
        }

        const pages = activeStoryBook.pages || [];
        const page = pages[activeStoryPageIdx] || {};
        const words = getActiveStoryPageWords();
        const isLastPage = activeStoryPageIdx >= pages.length - 1;
        const unlocked = isActiveStoryPageUnlocked();
        const srSupported = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
        const flipClass = activeStoryFlipDir === 'next' ? 'flipping-next' : activeStoryFlipDir === 'prev' ? 'flipping-prev' : '';
        activeStoryFlipDir = '';

        panel.innerHTML = `
          <div id="storyImmersiveOverlay" class="story-immersive-container">
            <div class="story-backdrop-blur" style="background-image:url('${page.imageUrl || activeStoryBook.coverUrl}');"></div>
            <div class="story-backdrop-scrim"></div>

            <!-- Top Floating Header Overlay -->
            <div class="story-overlay-header">
              <button type="button" class="btn btn-secondary btn-sm story-overlay-pill" onclick="closeStoryBook()" style="cursor:pointer;">
                <span class="material-symbols-rounded" style="font-size:1.1rem; margin-right:4px;">arrow_back</span> Story Shelf
              </button>
              <div style="display:flex; align-items:center; gap:0.6rem; min-width:0;">
                <span class="story-overlay-title">${activeStoryBook.title}</span>
                <span class="story-overlay-pill story-overlay-page-badge">Page ${activeStoryPageIdx + 1} / ${pages.length}</span>
              </div>
              <div style="display:flex; align-items:center; gap:0.5rem; flex-shrink:0;">
                <div class="story-overlay-pill" style="padding:2px 4px; gap:4px;">
                  <button type="button" class="btn btn-sm ${activeStoryMode === 'FLIP' ? 'btn-primary' : 'btn-secondary'}" style="border-radius:99px; border:none; padding:4px 10px; font-size:0.78rem;" onclick="setStoryReadingMode('FLIP')">🎧 Read to Me</button>
                  <button type="button" class="btn btn-sm ${activeStoryMode === 'READ_ALONG' ? 'btn-primary' : 'btn-secondary'}" style="border-radius:99px; border:none; padding:4px 10px; font-size:0.78rem;" onclick="setStoryReadingMode('READ_ALONG')">🎙️ Read Aloud</button>
                </div>
                <button type="button" class="btn btn-secondary btn-sm story-overlay-pill" onclick="toggleStoryFullscreen()" title="Toggle Fullscreen" style="padding:6px; width:36px; height:36px; justify-content:center; cursor:pointer;">
                  <span class="material-symbols-rounded" style="font-size:1.25rem;">fullscreen</span>
                </button>
              </div>
            </div>

            <!-- Center Stage with Overlay Navigation Chevrons -->
            <div class="story-overlay-stage">
              <!-- Left Floating Chevron -->
              <button type="button" class="story-overlay-nav-btn story-overlay-nav-prev" ${activeStoryPageIdx === 0 ? 'disabled' : ''} onclick="flipStoryPage(-1)" title="Previous Page">
                <span class="material-symbols-rounded" style="font-size:2.2rem;">chevron_left</span>
              </button>

              <!-- Page Illustration Card with Integrated Story Text -->
              <div class="story-stage-image-card ${flipClass}" ontouchstart="storyTouchStartX=event.touches[0].clientX" ontouchend="if(storyTouchStartX!==null){ const dx=event.changedTouches[0].clientX-storyTouchStartX; storyTouchStartX=null; if(dx<-50) flipStoryPage(1); else if(dx>50) flipStoryPage(-1); }">
                <div class="story-img-container">
                  <img src="${page.imageUrl || activeStoryBook.coverUrl}" alt="Page ${activeStoryPageIdx + 1}" onerror="this.style.display='none'">
                  ${page.illustrationEmoji ? `<span style="position:absolute; top:16px; right:18px; font-size:2.8rem; filter:drop-shadow(0 3px 8px rgba(0,0,0,0.85));">${page.illustrationEmoji}</span>` : ''}
                </div>

                <!-- Story Text Banner right on the story page -->
                <div class="story-text-banner">
                  <div class="story-words-wrap" style="justify-content:center; margin-bottom:0.45rem;">
                    ${words.map((w, idx) => {
                      const cls = activeStoryMode === 'READ_ALONG'
                        ? (idx < activeStoryWordIdx ? 'is-read' : idx === activeStoryWordIdx ? 'is-current' : '')
                        : '';
                      const safeWord = w.replace(/'/g, "\\'");
                      return `<button type="button" class="story-word-btn ${cls}" onclick="speakStoryText('${safeWord}', '${activeStoryBook.language}')" title="Tap to hear word">${w}</button>`;
                    }).join('')}
                  </div>
                  <div style="text-align:center; font-size:0.8rem; color:var(--text-muted);">
                    💡 Tap any word to hear how it sounds!
                  </div>
                </div>
              </div>

              <!-- Right Floating Chevron -->
              <button type="button" id="storyNextPageOverlayBtn" class="story-overlay-nav-btn story-overlay-nav-next" onclick="${isLastPage ? (unlocked ? 'finishActiveStoryBook()' : 'flipStoryPage(1)') : 'flipStoryPage(1)'}" title="${isLastPage ? (unlocked ? 'Finish Story' : 'Read Aloud to Finish') : (unlocked ? 'Next Page' : 'Read Aloud to Unlock')}">
                <span class="material-symbols-rounded" style="font-size:2.2rem;">${isLastPage ? (unlocked ? 'emoji_events' : 'lock') : (unlocked ? 'chevron_right' : 'lock')}</span>
              </button>
            </div>

            <!-- Bottom Floating HUD -->
            <div class="story-overlay-footer">
              ${activeStoryMode === 'FLIP' ? `
                <div style="display:flex; align-items:center; justify-content:space-between; gap:0.75rem; width:100%; flex-wrap:wrap;">
                  <button type="button" class="btn btn-secondary btn-sm" onclick="speakStoryText('${String(page.text || '').replace(/'/g, "\\'")}', '${activeStoryBook.language}')">
                    <span class="material-symbols-rounded" style="font-size:1.1rem;">volume_up</span> Listen to Page
                  </button>
                  <div style="display:flex; gap:0.6rem;">
                    <button type="button" class="btn btn-secondary btn-sm" ${activeStoryPageIdx === 0 ? 'disabled' : ''} onclick="flipStoryPage(-1)">← Prev</button>
                    ${isLastPage
                      ? `<button type="button" class="btn btn-primary btn-sm" onclick="finishActiveStoryBook()">🎉 Finish Story</button>`
                      : `<button type="button" class="btn btn-primary btn-sm" onclick="flipStoryPage(1)">Flip Page →</button>`}
                  </div>
                </div>
              ` : `
                <div style="display:flex; flex-direction:column; gap:0.4rem; width:100%;">
                  <div style="display:flex; align-items:center; justify-content:space-between; gap:0.75rem; flex-wrap:wrap;">
                    <div style="display:flex; align-items:center; gap:0.65rem; flex-wrap:wrap;">
                      <button type="button" class="btn btn-sm ${storyMicListening ? 'btn-primary story-mic-pulse' : 'btn-primary'}" onclick="toggleStoryMic()">
                        <span class="material-symbols-rounded" style="font-size:1.1rem;">${storyMicListening ? 'mic' : 'mic_none'}</span>
                        ${storyMicListening ? '🎙️ Listening... (Speak word)' : (unlocked ? 'Page Complete ✓' : '🎙️ Start Mic')}
                      </button>
                      ${(!srSupported && !unlocked) ? `
                        <button type="button" class="btn btn-secondary btn-sm" onclick="markActiveStoryWordManualFallback()">🎙️ Practice Next Word</button>
                      ` : ''}
                    </div>
                    <span style="font-weight:800; font-size:0.86rem; color:${unlocked ? '#06D6A0' : '#FF3366'};">
                      ${Math.min(activeStoryWordIdx, words.length)} / ${words.length} words read
                    </span>
                    <div style="display:flex; gap:0.6rem;">
                      <button type="button" class="btn btn-secondary btn-sm" ${activeStoryPageIdx === 0 ? 'disabled' : ''} onclick="flipStoryPage(-1)">← Prev</button>
                      ${isLastPage
                        ? `<button id="storyNextPageBtn" type="button" class="btn btn-sm ${unlocked ? 'btn-primary' : 'btn-secondary'}" onclick="${unlocked ? 'finishActiveStoryBook()' : 'flipStoryPage(1)'}">${unlocked ? '🎉 Finish Story' : '🔒 Read Aloud to Finish'}</button>`
                        : `<button id="storyNextPageBtn" type="button" class="btn btn-sm ${unlocked ? 'btn-primary' : 'btn-secondary'}" onclick="flipStoryPage(1)">${unlocked ? '✨ Flip Next Page →' : '🔒 Read Aloud to Unlock Next Page'}</button>`}
                    </div>
                  </div>
                  ${activeStoryHintMsg ? `<div style="text-align:center; font-size:0.82rem; font-weight:600; color:var(--text);">${activeStoryHintMsg}</div>` : ''}
                  ${activeStoryLastTranscript ? `<div style="text-align:center; font-size:0.75rem; color:var(--text-muted);">Heard: "${activeStoryLastTranscript}"</div>` : ''}
                </div>
              `}
            </div>
          </div>
        `;
        return;
      }

      const ageRating = currentUser?.ageRating || 'YOUNG_KIDS';
      const isOlder = ageRating === 'OLDER_KIDS' || ageRating === 'ALL';
      const filtered = kidStoriesCache;
      const wasSearchFocused = document.activeElement?.id === 'kidStorySearchInput';

      panel.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:0.75rem; margin-bottom:1.25rem;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:1rem; flex-wrap:wrap;">
            <div>
              <h2 style="font-family:'Fredoka',cursive; font-size:1.55rem; margin:0 0 0.25rem 0;">📖 Storybooks &amp; Read-Along</h2>
              <p style="color:var(--text-muted); font-size:0.9rem; margin:0;">
                ${ageRating === 'TODDLER'
                  ? 'Flip through illustrated pages with gentle narration.'
                  : 'Read each page aloud into your mic to turn the page automatically!'}
              </p>
            </div>
            <div style="display:flex; gap:0.45rem; flex-wrap:wrap; align-items:center;">
              <button type="button" class="btn btn-sm ${kidStoryBrowseAll ? 'btn-primary' : 'btn-secondary'}" onclick="kidStoryBrowseAll=!kidStoryBrowseAll; loadAndRenderKidStories(true);">${kidStoryBrowseAll ? 'Showing All Ages' : 'Browse All Stories'}</button>
            </div>
          </div>
          <div style="display:flex; gap:0.6rem; flex-wrap:wrap; align-items:center;">
            <div style="flex:1; min-width:240px; max-width:380px;">
              <input id="kidStorySearchInput" type="search" class="form-control" placeholder="Search 300+ stories by title, author, keyword..." value="${escapeHtml(kidStorySearchQuery)}" oninput="onKidStorySearchInput(this.value)" style="font-size:0.88rem; padding:0.45rem 0.85rem;">
            </div>
            <select class="form-control" style="max-width:220px; font-size:0.86rem; padding:0.45rem 0.75rem;" onchange="kidStoryCategoryFilter=this.value; loadAndRenderKidStories(true);">
              <option value="all" ${kidStoryCategoryFilter === 'all' ? 'selected' : ''}>All Categories</option>
              <option value="Animals & Nature" ${kidStoryCategoryFilter === 'Animals & Nature' ? 'selected' : ''}>🐾 Animals &amp; Nature</option>
              <option value="Bedtime & Feelings" ${kidStoryCategoryFilter === 'Bedtime & Feelings' ? 'selected' : ''}>🌙 Bedtime &amp; Feelings</option>
              <option value="Adventures & Curiosity" ${kidStoryCategoryFilter === 'Adventures & Curiosity' ? 'selected' : ''}>🚀 Adventures &amp; Curiosity</option>
              <option value="Values & Friendship" ${kidStoryCategoryFilter === 'Values & Friendship' ? 'selected' : ''}>🤝 Values &amp; Friendship</option>
              <option value="Science & Wonder" ${kidStoryCategoryFilter === 'Science & Wonder' ? 'selected' : ''}>🔬 Science &amp; Wonder</option>
              <option value="Daily Life & Family" ${kidStoryCategoryFilter === 'Daily Life & Family' ? 'selected' : ''}>🏡 Daily Life &amp; Family</option>
            </select>
          </div>
        </div>
        ${filtered.length === 0 ? `
          <div class="card" style="text-align:center; padding:2.2rem 1.5rem;">
            <div style="font-size:2.4rem; margin-bottom:0.5rem;">📚</div>
            <h3 style="margin-bottom:0.35rem;">${isOlder && !kidStoryBrowseAll ? 'Toddler & Younger Stories Hidden for Your Age Tier' : 'No Storybooks Found'}</h3>
            <p style="color:var(--text-muted); font-size:0.9rem; margin-bottom:1rem;">
              ${isOlder && !kidStoryBrowseAll ? 'Stories are tailored for Toddlers (1.5–3) and Young Kids (4–6). Want to read them anyway?' : 'Try adjusting your search or switching language filters above.'}
            </p>
            ${isOlder && !kidStoryBrowseAll ? `<button type="button" class="btn btn-primary" onclick="kidStoryBrowseAll=true; loadAndRenderKidStories(true);">Browse All Stories</button>` : ''}
          </div>
        ` : `
          <div class="video-grid">
            ${filtered.map(b => `
              <div class="video-card" style="cursor:pointer;" onclick="openStoryBook('${b.id}')">
                <div class="thumb-wrap">
                  <img src="${b.coverUrl}" alt="${b.title}" loading="lazy">
                  <span class="duration-badge">${b.language === 'id' ? '🇮🇩 ID' : '🇬🇧 EN'} • ${b.pages?.length || 0} pages</span>
                </div>
                <div class="video-info">
                  <div style="display:flex; align-items:center; justify-content:space-between; gap:0.4rem; margin-bottom:0.35rem;">
                    <span class="age-badge">${b.ageRating === 'TODDLER' ? '🎧 Read to Me' : '🎙️ Read Aloud'}</span>
                  </div>
                  <div class="video-title">${b.title}</div>
                  <div class="video-meta" style="margin-top:0.25rem;">${b.description}</div>
                  ${Array.isArray(b.tags) && b.tags.length > 0 ? `
                    <div style="display:flex; flex-wrap:wrap; gap:0.25rem; margin-top:0.4rem;">
                      ${b.tags.slice(0, 3).map(t => `
                        <span onclick="event.stopPropagation(); kidStorySearchQuery='${escapeHtml(t)}'; loadAndRenderKidStories(true);" style="font-size:0.68rem; font-weight:700; color:var(--primary, #6366f1); background:rgba(99,102,241,0.12); padding:2px 7px; border-radius:8px; cursor:pointer;" title="Search #${escapeHtml(t)}">#${escapeHtml(t)}</span>
                      `).join('')}
                    </div>
                  ` : ''}
                </div>
              </div>
            `).join('')}
          </div>
          ${kidStoryTotalPages > 1 ? `
            <div style="display:flex; align-items:center; justify-content:center; gap:0.9rem; margin-top:1.5rem; flex-wrap:wrap;">
              <button type="button" class="btn btn-sm btn-secondary" ${kidStoryCurrentPage <= 1 ? 'disabled' : ''} onclick="changeKidStoryPage(-1)">← Previous</button>
              <span style="font-size:0.88rem; font-weight:700; color:var(--text-muted);">
                Page ${kidStoryCurrentPage} of ${kidStoryTotalPages} (${kidStoryTotalCount} books)
              </span>
              <button type="button" class="btn btn-sm btn-secondary" ${kidStoryCurrentPage >= kidStoryTotalPages ? 'disabled' : ''} onclick="changeKidStoryPage(1)">Next →</button>
            </div>
          ` : ''}
        `}
      `;
      if (wasSearchFocused) {
        const searchEl = document.getElementById('kidStorySearchInput');
        if (searchEl) {
          searchEl.focus();
          const len = searchEl.value.length;
          try { searchEl.setSelectionRange(len, len); } catch {}
        }
      }
    }

    // Curator Studio Storybooks CRUD
    let studioStoriesCache = [];

    function addStudioStoryPageRow(page = {}) {
      const list = document.getElementById('studioStoryPagesList');
      if (!list) return;
      const idx = list.children.length + 1;
      const row = document.createElement('div');
      row.className = 'card studio-story-page-row';
      row.style.cssText = 'padding:0.85rem; display:grid; grid-template-columns:2fr 1.4fr 90px auto; gap:0.6rem; align-items:center;';
      row.innerHTML = `
        <input type="text" class="story-page-text" placeholder="Page ${idx} text..." value="${String(page.text || '').replace(/"/g, '&quot;')}" required style="padding:0.45rem 0.65rem; border-radius:6px; border:1px solid var(--border); background:var(--bg); color:var(--text);">
        <input type="url" class="story-page-img" placeholder="Illustration URL (optional)" value="${String(page.imageUrl || '').replace(/"/g, '&quot;')}" style="padding:0.45rem 0.65rem; border-radius:6px; border:1px solid var(--border); background:var(--bg); color:var(--text);">
        <input type="text" class="story-page-emoji" placeholder="📖" value="${String(page.illustrationEmoji || '📖').replace(/"/g, '&quot;')}" style="padding:0.45rem 0.65rem; border-radius:6px; border:1px solid var(--border); background:var(--bg); color:var(--text); text-align:center;">
        <button type="button" class="btn btn-secondary btn-sm" onclick="if(document.querySelectorAll('.studio-story-page-row').length>2) this.closest('.studio-story-page-row').remove();" title="Remove page">✕</button>
      `;
      list.appendChild(row);
    }

    function resetStudioStoryForm() {
      document.getElementById('studioStoryEditId').value = '';
      document.getElementById('studioStoryForm')?.reset();
      document.getElementById('studioStoryAuthor').value = 'FamiTube Storybooks';
      document.getElementById('btnCancelStudioStoryEdit').style.display = 'none';
      const list = document.getElementById('studioStoryPagesList');
      if (list) {
        list.innerHTML = '';
        addStudioStoryPageRow();
        addStudioStoryPageRow();
      }
    }

    async function loadAdminStories() {
      const listEl = document.getElementById('studioStoryPagesList');
      if (listEl && listEl.children.length === 0) {
        addStudioStoryPageRow();
        addStudioStoryPageRow();
      }
      try {
        const res = await authFetch('/api/admin/stories');
        const json = await res.json();
        studioStoriesCache = json.success ? (json.data || []) : [];
      } catch {
        studioStoriesCache = [];
      }
      const countEl = document.getElementById('studioStoriesCount');
      if (countEl) countEl.textContent = String(studioStoriesCache.length);
      const grid = document.getElementById('studioStoriesGrid');
      if (!grid) return;
      grid.innerHTML = studioStoriesCache.map(s => `
        <div class="video-card">
          <div class="thumb-wrap">
            <img src="${s.coverUrl}" alt="${s.title}" loading="lazy">
            <span class="duration-badge">${s.language.toUpperCase()} • ${s.pages?.length || 0} pages</span>
          </div>
          <div class="video-info">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.35rem;">
              <span class="age-badge">${s.ageRating}</span>
            </div>
            <div class="video-title">${s.title}</div>
            <div class="video-meta" style="margin-bottom:0.75rem;">${s.description || ''}</div>
            <div style="display:flex; gap:0.5rem;">
              <button type="button" class="btn btn-secondary btn-sm" onclick="editStudioStory('${s.id}')">Edit</button>
              <button type="button" class="btn btn-secondary btn-sm" style="color:var(--primary);" onclick="deleteStudioStory('${s.id}')">Delete</button>
            </div>
          </div>
        </div>
      `).join('');
    }

    function editStudioStory(id) {
      const s = studioStoriesCache.find(b => b.id === id);
      if (!s) return;
      document.getElementById('studioStoryEditId').value = s.id;
      document.getElementById('studioStoryTitle').value = s.title;
      document.getElementById('studioStoryAuthor').value = s.author;
      document.getElementById('studioStoryCover').value = s.coverUrl;
      document.getElementById('studioStoryAge').value = s.ageRating;
      document.getElementById('studioStoryLang').value = s.language;
      document.getElementById('studioStoryDesc').value = s.description || '';
      document.getElementById('btnCancelStudioStoryEdit').style.display = 'inline-flex';
      const list = document.getElementById('studioStoryPagesList');
      list.innerHTML = '';
      (s.pages || []).forEach(p => addStudioStoryPageRow(p));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    async function saveStudioStory(e) {
      e.preventDefault();
      const editId = document.getElementById('studioStoryEditId').value.trim();
      const coverUrl = document.getElementById('studioStoryCover').value.trim();
      const rows = Array.from(document.querySelectorAll('.studio-story-page-row'));
      const pages = rows.map((r, i) => ({
        pageNumber: i + 1,
        text: r.querySelector('.story-page-text').value.trim(),
        imageUrl: r.querySelector('.story-page-img').value.trim() || coverUrl,
        illustrationEmoji: r.querySelector('.story-page-emoji').value.trim() || '📖'
      })).filter(p => p.text.length > 0);
      if (pages.length < 2) return alert('Please add at least 2 pages with text.');
      const payload = {
        title: document.getElementById('studioStoryTitle').value.trim(),
        author: document.getElementById('studioStoryAuthor').value.trim(),
        coverUrl,
        ageRating: document.getElementById('studioStoryAge').value,
        language: document.getElementById('studioStoryLang').value,
        description: document.getElementById('studioStoryDesc').value.trim(),
        pages
      };
      const url = editId ? `/api/admin/stories/${encodeURIComponent(editId)}` : '/api/admin/stories';
      const res = await authFetch(url, {
        method: editId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!res.ok || !json.success) return alert(json.message || 'Could not save storybook');
      resetStudioStoryForm();
      await loadAdminStories();
    }

    async function deleteStudioStory(id) {
      if (!confirm('Delete this storybook?')) return;
      await authFetch(`/api/admin/stories/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await loadAdminStories();
    }

    document.addEventListener('keydown', (e) => {
      if (!activeStoryBook || activeStoryCompletionResult || activeKidTab !== 'stories') return;
      const tag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        flipStoryPage(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        flipStoryPage(-1);
      }
    });
