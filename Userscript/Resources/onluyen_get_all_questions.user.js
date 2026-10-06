// ==UserScript==
// @name         OnLuyen · Lấy & Copy Toàn Bộ Câu Hỏi
// @namespace    https://app.onluyen.vn/
// @version      4.0.0
// @description  Kiến trúc V4: Tự động hóa đề thi & câu hỏi tự luyện OnLuyện, AI giải đa phương thức, tự động điền & nộp bài, chống race condition, bảo mật cao.
// @author       Tris
// @match        https://app.onluyen.vn/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    /* ==========================================================================
       MODULE 1: CONFIGURATION & CONSTANTS
       ========================================================================== */
    const Config = Object.freeze({
        VERSION: '4.0.0',
        API_BASE: 'https://api-elb.onluyen.vn/api',
        AUTH_REFRESH_URL: 'https://oauth.onluyen.vn/api/Account/refresh',
        AUTH_LOGIN_URL: 'https://oauth.onluyen.vn/api/account/login',
        DEFAULT_AI_ENDPOINT: 'https://ai-zero-token-api.vercel.app',
        DEFAULT_AI_MODEL: 'gpt-6-luna',
        PROMPT_VERSION: 'v4.1',
        MAX_AI_TOKENS: 380,
        AI_TIMEOUT_MS: 30000,
        HTTP_TIMEOUT_MS: 15000,
        MAX_SELECTION_RETRIES: 3,
        SUBMIT_VERIFY_DELAY_MS: 450,
        NEXT_BUTTON_DELAY_MS: 1200,

        TYPE_LABEL: Object.freeze({
            0: 'Trắc nghiệm',
            1: 'Đúng / Sai',
            2: 'Tự luận nhiều đoạn',
            3: 'Tự luận',
            5: 'Điền số / Trả lời ngắn'
        }),

        STORAGE_KEYS: Object.freeze({
            COLLAPSED: 'olgq_v4_collapsed',
            VISIBLE: 'olgq_v4_visible',
            PANEL_LEFT: 'olgq_v4_panel_left',
            PANEL_TOP: 'olgq_v4_panel_top',
            AUTO_FETCH: 'olgq_v4_auto_fetch',
            AUTO_SOLVE: 'olgq_v4_auto_solve',
            AUTO_SELECT: 'olgq_v4_auto_select',
            AUTO_SUBMIT: 'olgq_v4_auto_submit',
            AI_ENDPOINT: 'olgq_v4_ai_endpoint',
            AI_MODEL: 'olgq_v4_ai_model',
            AI_API_KEY: 'olgq_v4_ai_apikey',
            DEBUG_LEVEL: 'olgq_v4_debug_level'
        })
    });

    /* ==========================================================================
       MODULE 2: LOGGER & OBSERVABILITY
       ========================================================================== */
    const LogLevel = Object.freeze({
        OFF: 0,
        ERROR: 1,
        WARN: 2,
        INFO: 3,
        DEBUG: 4,
        TRACE: 5
    });

    const Logger = (function () {
        let currentLevel = LogLevel.INFO;

        function sanitize(data) {
            if (typeof data === 'string') {
                return data
                    .replace(/(Bearer\s+)[A-Za-z0-9\-_.]{10,}/gi, '$1[REDACTED_TOKEN]')
                    .replace(/(eyJ[A-Za-z0-9\-_]{15,}\.[A-Za-z0-9\-_]{15,}\.[A-Za-z0-9\-_]{15,})/g, '[REDACTED_JWT]')
                    .replace(/(key[=:\s]+)[A-Za-z0-9\-_]{10,}/gi, '$1[REDACTED_KEY]');
            }
            if (data && typeof data === 'object') {
                try {
                    const cloned = JSON.parse(JSON.stringify(data));
                    const redactKeys = ['token', 'access_token', 'password', 'apiKey', 'aiApiKey', 'authorization'];
                    (function recurse(obj) {
                        for (const k of Object.keys(obj)) {
                            if (redactKeys.includes(k.toLowerCase())) {
                                obj[k] = '[REDACTED]';
                            } else if (obj[k] && typeof obj[k] === 'object') {
                                recurse(obj[k]);
                            }
                        }
                    })(cloned);
                    return cloned;
                } catch (e) {
                    return '[Unserializable]';
                }
            }
            return data;
        }

        return {
            setLevel(level) {
                if (typeof level === 'number') currentLevel = level;
                else if (LogLevel[level] !== undefined) currentLevel = LogLevel[level];
            },
            getLevel() { return currentLevel; },
            error(module, msg, meta) {
                if (currentLevel >= LogLevel.ERROR) {
                    console.error(`[OnLuyenV4][${module}] ✖ ${msg}`, meta ? sanitize(meta) : '');
                }
            },
            warn(module, msg, meta) {
                if (currentLevel >= LogLevel.WARN) {
                    console.warn(`[OnLuyenV4][${module}] ⚠ ${msg}`, meta ? sanitize(meta) : '');
                }
            },
            info(module, msg, meta) {
                if (currentLevel >= LogLevel.INFO) {
                    console.info(`[OnLuyenV4][${module}] ℹ ${msg}`, meta ? sanitize(meta) : '');
                }
            },
            debug(module, msg, meta) {
                if (currentLevel >= LogLevel.DEBUG) {
                    console.debug(`[OnLuyenV4][${module}] 🔍 ${msg}`, meta ? sanitize(meta) : '');
                }
            },
            trace(module, msg, meta) {
                if (currentLevel >= LogLevel.TRACE) {
                    console.debug(`[OnLuyenV4][${module}][TRACE] ${msg}`, meta ? sanitize(meta) : '');
                }
            }
        };
    })();

    /* ==========================================================================
       MODULE 3: STATE STORE
       ========================================================================== */
    const StateStore = (function () {
        const _state = {
            app: {
                initialized: false,
                version: Config.VERSION,
                debugLevel: GM_getValue(Config.STORAGE_KEYS.DEBUG_LEVEL, LogLevel.INFO)
            },
            auth: {
                token: null,
                isRefreshing: false,
                lastRefreshTime: 0
            },
            exam: {
                info: null,
                questions: [],
                lastLoadedKey: null,
                isFetching: false
            },
            question: {
                current: null,
                currentFingerprint: null,
                activeScreenIndex: null,
                lastDetectedSignature: null
            },
            ai: {
                endpoint: GM_getValue(Config.STORAGE_KEYS.AI_ENDPOINT, Config.DEFAULT_AI_ENDPOINT),
                model: GM_getValue(Config.STORAGE_KEYS.AI_MODEL, Config.DEFAULT_AI_MODEL),
                apiKey: GM_getValue(Config.STORAGE_KEYS.AI_API_KEY, ''),
                autoSolve: GM_getValue(Config.STORAGE_KEYS.AUTO_SOLVE, false),
                isThinking: false,
                thinkingQuestionId: null,
                thinkingQuestionKey: null,
                lastSolution: null
            },
            automation: {
                autoFetch: GM_getValue(Config.STORAGE_KEYS.AUTO_FETCH, true),
                autoSelect: GM_getValue(Config.STORAGE_KEYS.AUTO_SELECT, false),
                autoSubmit: GM_getValue(Config.STORAGE_KEYS.AUTO_SUBMIT, false),
                status: 'IDLE', // IDLE | ANSWER_READY | SELECTING | VERIFYING | SUBMITTING | SUBMITTED | ERROR
                lastError: null
            },
            ui: {
                collapsed: GM_getValue(Config.STORAGE_KEYS.COLLAPSED, false),
                visible: GM_getValue(Config.STORAGE_KEYS.VISIBLE, true),
                statusText: 'Sẵn sàng.',
                isErrorStatus: false,
                filterKeyword: ''
            },
            diagnostics: {
                apiRequests: 0,
                apiFailures: 0,
                aiRequests: 0,
                aiFailures: 0,
                cacheHits: 0,
                cacheMisses: 0,
                questionChanges: 0,
                selectAttempts: 0,
                submitAttempts: 0,
                lastAiLatencyMs: 0
            }
        };

        const listeners = new Set();

        return {
            getState() { return _state; },
            get(path) {
                return path.split('.').reduce((acc, part) => (acc ? acc[part] : undefined), _state);
            },
            set(path, value) {
                const parts = path.split('.');
                let curr = _state;
                for (let i = 0; i < parts.length - 1; i++) {
                    if (!curr[parts[i]]) curr[parts[i]] = {};
                    curr = curr[parts[i]];
                }
                curr[parts[parts.length - 1]] = value;
                this.notify(path, value);
            },
            update(slice, patch) {
                if (_state[slice] && typeof _state[slice] === 'object') {
                    Object.assign(_state[slice], patch);
                    this.notify(slice, _state[slice]);
                }
            },
            subscribe(fn) {
                listeners.add(fn);
                return () => listeners.delete(fn);
            },
            notify(slice, value) {
                for (const fn of listeners) {
                    try { fn(slice, value, _state); } catch (e) { Logger.error('StateStore', 'Listener error', e); }
                }
            },
            resetQuestionState() {
                _state.question.current = null;
                _state.question.currentFingerprint = null;
                _state.question.activeScreenIndex = null;
                _state.question.lastDetectedSignature = null;
                _state.automation.status = 'IDLE';
                this.notify('question', _state.question);
            },
            resetExamState() {
                _state.exam.info = null;
                _state.exam.questions = [];
                _state.exam.lastLoadedKey = null;
                _state.exam.isFetching = false;
                this.resetQuestionState();
                this.notify('exam', _state.exam);
            }
        };
    })();

    // Khởi tạo mức log từ state
    Logger.setLevel(StateStore.get('app.debugLevel'));

    /* ==========================================================================
       MODULE 4: UTILITIES & SANITIZATION
       ========================================================================== */
    const Utils = Object.freeze({
        escapeHtml(str) {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        },

        htmlToPlainText(raw) {
            if (!raw) return '';
            let text = String(raw);
            text = text.replace(/<br\s*[\/]?>/gi, '\n')
                       .replace(/<\/p>/gi, '\n')
                       .replace(/<\/div>/gi, '\n')
                       .replace(/<\/tr>/gi, '\n')
                       .replace(/<\/li>/gi, '\n')
                       .replace(/<[^>]+>/g, '')
                       .replace(/&nbsp;/gi, ' ')
                       .replace(/&lt;/gi, '<')
                       .replace(/&gt;/gi, '>')
                       .replace(/&amp;/gi, '&')
                       .replace(/&quot;/gi, '"')
                       .replace(/&#39;/gi, "'");
            return text.split('\n')
                       .map(line => line.trim())
                       .filter(line => line.length > 0)
                       .join('\n');
        },

        extractImagesFromHtml(html) {
            if (!html) return [];
            const urls = [];
            const regex = /<img[^>]+src=["']([^"']+)["']/gi;
            let match;
            while ((match = regex.exec(html)) !== null) {
                let url = match[1];
                if (url) {
                    if (url.startsWith('//')) url = 'https:' + url;
                    urls.push(url);
                }
            }
            return urls;
        },

        pickLang(obj) {
            const curLang = obj.currentLang || 'vi';
            const langs = obj.languagesData || {};
            if (langs[curLang]) return langs[curLang];
            if (langs.vi) return langs.vi;
            if (langs.en) return langs.en;
            const keys = Object.keys(langs);
            if (keys.length) return langs[keys[0]];
            return {};
        },

        validateEndpointUrl(url) {
            if (!url || typeof url !== 'string') return false;
            const trimmed = url.trim();
            if (!/^https?:\/\//i.test(trimmed)) return false;
            if (/^(javascript|data|file):/i.test(trimmed)) return false;
            try {
                const u = new URL(trimmed);
                return u.protocol === 'http:' || u.protocol === 'https:';
            } catch (e) {
                return false;
            }
        },

        hashString(str) {
            // Fast DJB2 hash algorithm producing a deterministic 32-bit hex fingerprint
            let hash = 5381;
            for (let i = 0; i < str.length; i++) {
                hash = ((hash << 5) + hash) + str.charCodeAt(i);
                hash = hash & hash; // Convert to 32bit integer
            }
            return (hash >>> 0).toString(16);
        }
    });

    /* ==========================================================================
       MODULE 5: QUESTION FINGERPRINT
       ========================================================================== */
    const QuestionFingerprint = Object.freeze({
        create(q) {
            if (!q) return 'empty';
            const normContent = (q.contentText || '').trim().toLowerCase().replace(/\s+/g, ' ');
            const normPassage = (q.passage || '').trim().toLowerCase().replace(/\s+/g, ' ');
            const optionsStr = (q.options || [])
                .map(o => `${o.letter}:${(o.contentText || '').trim().toLowerCase()}`)
                .join('|');
            const imagesStr = (q.images || []).join(';');
            const typeStr = String(q.typeAnswer || 0);

            const raw = `${normContent}@@${normPassage}@@${optionsStr}@@${imagesStr}@@${typeStr}`;
            return Utils.hashString(raw);
        }
    });

    /* ==========================================================================
       MODULE 6: AUTH MANAGER
       ========================================================================== */
    const AuthManager = (function () {
        function readToken() {
            try {
                if (typeof unsafeWindow !== 'undefined' && unsafeWindow.localStorage) {
                    const t = unsafeWindow.localStorage.getItem('token');
                    if (t) return t.replace(/^["']|["']$/g, '');
                }
            } catch (e) { }
            try {
                const t = localStorage.getItem('token');
                if (t) return t.replace(/^["']|["']$/g, '');
            } catch (e) { }
            try {
                if (typeof unsafeWindow !== 'undefined' && unsafeWindow.sessionStorage) {
                    const t = unsafeWindow.sessionStorage.getItem('token');
                    if (t) return t.replace(/^["']|["']$/g, '');
                }
            } catch (e) { }
            try {
                const match = document.cookie.match(/(?:^|;\s*)(?:token|access_token)=([^;]+)/);
                if (match) return decodeURIComponent(match[1]).replace(/^["']|["']$/g, '');
            } catch (e) { }
            return null;
        }

        function writeToken(token) {
            if (!token) return;
            try {
                if (typeof unsafeWindow !== 'undefined' && unsafeWindow.localStorage) {
                    unsafeWindow.localStorage.setItem('token', token);
                }
            } catch (e) { }
            try {
                localStorage.setItem('token', token);
            } catch (e) { }
            StateStore.set('auth.token', token);
        }

        function clearToken() {
            try {
                if (typeof unsafeWindow !== 'undefined' && unsafeWindow.localStorage) {
                    unsafeWindow.localStorage.removeItem('token');
                }
            } catch (e) { }
            try { localStorage.removeItem('token'); } catch (e) { }
            StateStore.set('auth.token', null);
        }

        let refreshPromise = null;

        function refreshToken() {
            if (refreshPromise) return refreshPromise;

            Logger.info('Auth', 'Bắt đầu làm mới token...');
            StateStore.set('auth.isRefreshing', true);

            refreshPromise = ApiClient.rawRequest({
                method: 'POST',
                url: Config.AUTH_REFRESH_URL,
                body: {},
                auth: true
            }).then(res => {
                if (res && res.access_token) {
                    writeToken(res.access_token);
                    Logger.info('Auth', 'Làm mới token thành công.');
                    StateStore.set('auth.lastRefreshTime', Date.now());
                    return res.access_token;
                }
                throw new Error('Refresh token thất bại: không nhận được access_token.');
            }).catch(err => {
                Logger.error('Auth', 'Lỗi trong quá trình refresh token', err.message);
                throw err;
            }).finally(() => {
                StateStore.set('auth.isRefreshing', false);
                refreshPromise = null;
            });

            return refreshPromise;
        }

        function ensureValidToken(maxWaitMs = 1500) {
            const existing = StateStore.get('auth.token') || readToken();
            if (existing) {
                StateStore.set('auth.token', existing);
                return Promise.resolve(existing);
            }

            return new Promise(resolve => {
                const startTime = Date.now();
                const timer = setInterval(() => {
                    const t = readToken();
                    if (t) {
                        clearInterval(timer);
                        StateStore.set('auth.token', t);
                        resolve(t);
                        return;
                    }
                    if (Date.now() - startTime >= maxWaitMs) {
                        clearInterval(timer);
                        resolve(null);
                    }
                }, 200);
            });
        }

        return {
            readToken,
            writeToken,
            clearToken,
            refreshToken,
            ensureValidToken
        };
    })();

    /* ==========================================================================
       MODULE 7: UNIFIED API CLIENT
       ========================================================================== */
    const ApiClient = (function () {
        let requestIdCounter = 0;

        function rawRequest(options) {
            const { method = 'GET', url, body, headers = {}, timeout = Config.HTTP_TIMEOUT_MS, auth = true } = options;
            const reqId = ++requestIdCounter;
            const state = StateStore.getState();

            const finalHeaders = Object.assign({
                'Accept': 'application/json, text/plain, */*'
            }, headers);

            if (body && !finalHeaders['Content-Type']) {
                finalHeaders['Content-Type'] = 'application/json';
            }

            if (auth) {
                const token = state.auth.token || AuthManager.readToken();
                if (token) {
                    finalHeaders['Authorization'] = 'Bearer ' + token;
                }
            }

            StateStore.update('diagnostics', { apiRequests: state.diagnostics.apiRequests + 1 });
            Logger.debug('ApiClient', `[Req #${reqId}] ${method} ${url}`);

            const fetchFn = (typeof unsafeWindow !== 'undefined' && unsafeWindow.fetch)
                ? unsafeWindow.fetch.bind(unsafeWindow)
                : fetch;

            // 1. Thử gọi trực tiếp bằng fetch của trang web (cùng cookie, session OnLuyen)
            const controller = new AbortController();
            const timeoutTimer = setTimeout(() => controller.abort(), timeout);

            return fetchFn(url, {
                method: method,
                headers: finalHeaders,
                body: body ? JSON.stringify(body) : undefined,
                signal: controller.signal
            }).then(res => {
                clearTimeout(timeoutTimer);
                if (res.status === 401) throw new Error('HTTP 401');
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json().catch(() => ({}));
            }).catch(err => {
                clearTimeout(timeoutTimer);
                if (err && err.message === 'HTTP 401') throw err;

                // 2. Fallback sang GM_xmlhttpRequest nếu fetch gặp CORS hoặc network error
                if (typeof GM_xmlhttpRequest === 'function') {
                    Logger.debug('ApiClient', `[Req #${reqId}] Fallback GM_xmlhttpRequest cho ${url}`);
                    return new Promise((resolve, reject) => {
                        const gmHeaders = Object.assign({}, finalHeaders, {
                            'Origin': 'https://app.onluyen.vn',
                            'Referer': 'https://app.onluyen.vn/'
                        });
                        GM_xmlhttpRequest({
                            method: method,
                            url: url,
                            headers: gmHeaders,
                            data: body ? JSON.stringify(body) : undefined,
                            timeout: timeout,
                            onload: gmRes => {
                                if (gmRes.status === 401) {
                                    reject(new Error('HTTP 401'));
                                    return;
                                }
                                if (gmRes.status >= 400) {
                                    reject(new Error(`HTTP ${gmRes.status} ${url}`));
                                    return;
                                }
                                try {
                                    resolve(JSON.parse(gmRes.responseText));
                                } catch (e) {
                                    resolve({});
                                }
                            },
                            onerror: () => reject(new Error('Lỗi mạng GM: ' + url)),
                            ontimeout: () => reject(new Error('Timeout GM: ' + url))
                        });
                    });
                }
                throw err;
            });
        }

        // request với cơ chế refresh token 1 lần khi gặp 401 + retry với exponential backoff
        function request(options) {
            const maxRetries = options.retries || 1;
            let attempt = 0;

            function execute() {
                attempt++;
                return rawRequest(options).catch(err => {
                    if (err && err.message === 'HTTP 401') {
                        Logger.warn('ApiClient', 'Nhận 401, đang thử làm mới token...');
                        return AuthManager.refreshToken().then(() => {
                            // Retry lại đúng 1 lần sau khi đã refresh token
                            return rawRequest(options);
                        }).catch(refreshErr => {
                            StateStore.update('diagnostics', { apiFailures: StateStore.get('diagnostics.apiFailures') + 1 });
                            throw new Error('Phiên đăng nhập hết hạn (401) và làm mới token thất bại.');
                        });
                    }

                    // Không retry lỗi client 4xx (trừ 401 và 429)
                    if (err && /HTTP 40[034]/.test(err.message)) {
                        StateStore.update('diagnostics', { apiFailures: StateStore.get('diagnostics.apiFailures') + 1 });
                        throw err;
                    }

                    if (attempt <= maxRetries) {
                        const delay = Math.pow(2, attempt) * 400 + Math.random() * 200;
                        Logger.warn('ApiClient', `Thử lại sau ${Math.round(delay)}ms do lỗi: ${err.message}`);
                        return new Promise(resolve => setTimeout(resolve, delay)).then(execute);
                    }

                    StateStore.update('diagnostics', { apiFailures: StateStore.get('diagnostics.apiFailures') + 1 });
                    throw err;
                });
            }

            return execute();
        }

        return {
            rawRequest,
            request,
            get(path) {
                return request({ method: 'GET', url: Config.API_BASE + path, auth: true });
            }
        };
    })();

    /* ==========================================================================
       MODULE 8: CONTEXT DETECTOR
       ========================================================================== */
    const ContextDetector = Object.freeze({
        detect() {
            const path = location.pathname;
            const search = location.search;

            // 1. /school/test/step/:id
            let m = path.match(/\/school\/test\/step\/([a-f0-9]{24}|[^/?#]+)/i);
            if (m) return { type: 'school', assignId: m[1], logId: m[1], source: 'URL /school/test/step/' };

            // 2. /school/test/:id
            m = path.match(/\/school\/test\/([a-f0-9]{24})/i);
            if (m && m[1] !== 'step') return { type: 'school', assignId: m[1], logId: m[1], source: 'URL /school/test/' };

            // 3. /doing/:assignId/:logId
            m = path.match(/\/doing\/([^/]+)\/([^/?#]+)/i);
            if (m) return { type: 'school', assignId: m[1], logId: m[2], source: 'URL /doing/' };

            // 4. /history/:assignId/:logId
            m = path.match(/\/history\/([^/]+)\/([^/?#]+)/i);
            if (m) return { type: 'school', assignId: m[1], logId: m[2], source: 'URL /history/' };

            // 5. /practices/step/:subjectId/:problemId/:stepId
            m = path.match(/\/practices?\/step\/([^/?#]+)\/([^/?#]+)\/([^/?#]+)/i);
            if (m) {
                return {
                    type: 'practice',
                    subjectId: m[1],
                    problemId: m[2],
                    stepId: m[3],
                    logId: `${m[2]}/${m[3]}`,
                    source: `Tự luyện (${m[1]})`
                };
            }

            // 6. query params: assignClassLogId, logId, assignId
            m = search.match(/(?:assignClassLogId|logId|assignId)=([^&?#]+)/i);
            if (m) return { type: 'school', logId: decodeURIComponent(m[1]), source: 'Query parameter' };

            // 7. Hash routing fallback
            if (location.hash) {
                m = location.hash.match(/\/school\/test\/(?:step\/)?([a-f0-9]{24})/i);
                if (m) return { type: 'school', assignId: m[1], logId: m[1], source: 'Hash URL' };
            }

            return null;
        }
    });

    /* ==========================================================================
       MODULE 9: QUESTION NORMALIZER
       ========================================================================== */
    const QuestionNormalizer = Object.freeze({
        normalize(ds, sectionTitle, passage, explicitIndex) {
            const lang = Utils.pickLang(ds);
            const opts = (lang.options || []).map((o, idx) => ({
                idOption: o.idOption !== undefined ? o.idOption : idx,
                letter: String.fromCharCode(65 + idx),
                tfPrefix: String.fromCharCode(97 + idx) + ')',
                contentHtml: o.content || o.name || '',
                contentText: Utils.htmlToPlainText(o.content || o.name || ''),
                images: Utils.extractImagesFromHtml(o.content || o.name || ''),
                isAnswer: o.isAnswer === true || o.rightAnswer === true
            }));

            const questionImages = [
                ...Utils.extractImagesFromHtml(passage || ''),
                ...Utils.extractImagesFromHtml(lang.content || '')
            ];

            const calculatedIndex = explicitIndex || ds.index || (ds.stepIndex !== undefined ? ds.stepIndex + 1 : undefined);

            const q = {
                idQuestion: ds.idQuestion || ds.id || ds.stepId,
                stepId: ds.stepId || ds.id,
                index: calculatedIndex,
                stepIndex: (calculatedIndex !== undefined) ? (calculatedIndex - 1) : ds.stepIndex,
                numberQuestion: ds.numberQuestion,
                typeAnswer: ds.typeAnswer,
                typeLabel: Config.TYPE_LABEL[ds.typeAnswer] || ('Loại ' + ds.typeAnswer),
                scoreRule: ds.scoreRule,
                sectionTitle: sectionTitle ? Utils.htmlToPlainText(sectionTitle) : null,
                passage: passage ? Utils.htmlToPlainText(passage) : null,
                contentHtml: lang.content || '',
                contentText: Utils.htmlToPlainText(lang.content || ''),
                images: questionImages,
                explain: Utils.htmlToPlainText(lang.explain || lang.explainQuestion || ''),
                options: opts,
                answerOptionId: ds.answerOptionId || ds.userOptionId || [],
                answerFreeText: ds.answerFreeText || [],
                rightAnswer: ds.rightAnswer
            };

            q.fingerprint = QuestionFingerprint.create(q);
            return q;
        },

        parseDoing(data) {
            const list = [];
            const rawItems = data.data || [];
            const listSectionName = data.listSectionName || [];

            rawItems.forEach((item, idx) => {
                if (item.dataMaterial) {
                    const mat = item.dataMaterial;
                    const passageHtml = mat.contentHtml || mat.title || '';
                    const title = mat.titleSection || listSectionName[idx] || null;
                    const subItems = mat.data || [];
                    subItems.forEach(sub => {
                        list.push(this.normalize(sub, title, passageHtml, list.length + 1));
                    });
                } else if (item.dataStandard) {
                    const title = listSectionName[idx] || null;
                    list.push(this.normalize(item.dataStandard, title, null, list.length + 1));
                }
            });

            return {
                info: {
                    name: data.name || 'Bài tập OnLuyện',
                    totalQuestion: list.length,
                    duration: data.duration,
                    assignId: data.assignId,
                    logId: data.logId
                },
                questions: list
            };
        },

        parsePractice(data) {
            const list = [];
            if (data.dataStandard) {
                list.push(this.normalize(data.dataStandard, (data.practice && data.practice.title) || null, null, 1));
            } else if (data.dataMaterial) {
                const mat = data.dataMaterial;
                const passage = mat.contentHtml || mat.title || '';
                const title = (data.practice && data.practice.title) || null;
                (mat.data || []).forEach(sub => {
                    list.push(this.normalize(sub, title, passage, list.length + 1));
                });
            }

            return {
                info: {
                    name: (data.practice && data.practice.title) || 'Bài Tự Luyện',
                    totalQuestion: (data.practice && data.practice.countQuestionComplete)
                        ? `${data.practice.countQuestionComplete} (đã làm)`
                        : list.length,
                    timeLimit: null
                },
                questions: list
            };
        }
    });

    /* ==========================================================================
       MODULE 10: QUESTION REPOSITORY & DUPLICATE PROTECTION
       ========================================================================== */
    const QuestionRepository = (function () {
        const inFlightRequests = new Map();

        return {
            getAllQuestions(assignClassLogId) {
                if (inFlightRequests.has(assignClassLogId)) {
                    Logger.debug('Repo', `Tái sử dụng in-flight request cho đề: ${assignClassLogId}`);
                    return inFlightRequests.get(assignClassLogId);
                }

                const promise = ApiClient.get(`/school-online/assignment/doing/${assignClassLogId}`)
                    .then(res => {
                        if (!res || !res.success || !res.data) {
                            throw new Error((res && res.message) || 'Không lấy được dữ liệu đề (bài có thể chưa được mở).');
                        }
                        return QuestionNormalizer.parseDoing(res.data);
                    })
                    .finally(() => {
                        inFlightRequests.delete(assignClassLogId);
                    });

                inFlightRequests.set(assignClassLogId, promise);
                return promise;
            },

            getPracticeDetail(problemId, stepId) {
                const key = `${problemId}/${stepId}`;
                if (inFlightRequests.has(key)) {
                    Logger.debug('Repo', `Tái sử dụng in-flight request cho bài tự luyện: ${key}`);
                    return inFlightRequests.get(key);
                }

                const promise = ApiClient.get(`/practice/v2/questions/detail/${problemId}/${stepId}`)
                    .then(res => {
                        if (!res || (!res.dataStandard && !res.dataMaterial)) {
                            throw new Error((res && res.message) || 'Không tải được câu hỏi tự luyện từ API.');
                        }
                        return QuestionNormalizer.parsePractice(res);
                    })
                    .finally(() => {
                        inFlightRequests.delete(key);
                    });

                inFlightRequests.set(key, promise);
                return promise;
            }
        };
    })();

    /* ==========================================================================
       MODULE 11: REQUEST MANAGER & RACE CONDITION ELIMINATOR
       ========================================================================== */
    const RequestManager = (function () {
        let currentGeneration = 0;
        let activeRequestId = 0;
        let activeFingerprint = null;
        let activeAbortController = null;

        return {
            create(question) {
                if (activeAbortController) {
                    try { activeAbortController.abort(); } catch (e) { }
                    Logger.debug('RequestManager', `Hủy bỏ request trước đó (Gen ${currentGeneration})`);
                }

                currentGeneration++;
                activeRequestId = Date.now() + Math.floor(Math.random() * 1000);
                activeFingerprint = question ? (question.fingerprint || QuestionFingerprint.create(question)) : null;
                activeAbortController = new AbortController();

                Logger.debug('RequestManager', `Khởi tạo Request #${activeRequestId} | Gen ${currentGeneration} | FP: ${activeFingerprint}`);

                return {
                    requestId: activeRequestId,
                    generation: currentGeneration,
                    fingerprint: activeFingerprint,
                    signal: activeAbortController.signal
                };
            },

            cancel() {
                if (activeAbortController) {
                    try { activeAbortController.abort(); } catch (e) { }
                    activeAbortController = null;
                }
                currentGeneration++;
                activeRequestId = 0;
                activeFingerprint = null;
            },

            isCurrent(requestId, fingerprint, generation) {
                const isValid = (generation === currentGeneration) &&
                                (requestId === activeRequestId) &&
                                (!fingerprint || fingerprint === activeFingerprint);
                if (!isValid) {
                    Logger.warn('RequestManager', `Phát hiện Stale Response! Bỏ qua kết quả. [Gen: ${generation}/${currentGeneration}, Req: ${requestId}/${activeRequestId}]`);
                }
                return isValid;
            },

            getCurrentGeneration() { return currentGeneration; }
        };
    })();

    /* ==========================================================================
       MODULE 12: AI SOLUTION CACHE
       ========================================================================== */
    const AISolutionCache = (function () {
        const cache = new Map();
        const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

        return {
            buildKey(fingerprint, model) {
                return `${fingerprint}_${model || Config.DEFAULT_AI_MODEL}_${Config.PROMPT_VERSION}`;
            },

            get(fingerprint, model) {
                const key = this.buildKey(fingerprint, model);
                const item = cache.get(key);
                if (!item) {
                    StateStore.update('diagnostics', { cacheMisses: StateStore.get('diagnostics.cacheMisses') + 1 });
                    return null;
                }
                if (Date.now() > item.expiresAt) {
                    cache.delete(key);
                    StateStore.update('diagnostics', { cacheMisses: StateStore.get('diagnostics.cacheMisses') + 1 });
                    return null;
                }
                StateStore.update('diagnostics', { cacheHits: StateStore.get('diagnostics.cacheHits') + 1 });
                Logger.debug('AICache', `Cache HIT cho key: ${key}`);
                return item.solution;
            },

            set(fingerprint, model, solution, ttlMs = DEFAULT_TTL_MS) {
                if (!fingerprint || !solution) return;
                const key = this.buildKey(fingerprint, model);
                cache.set(key, {
                    solution: solution,
                    expiresAt: Date.now() + ttlMs
                });
                Logger.debug('AICache', `Đã lưu cache cho key: ${key}`);
            },

            clear() {
                cache.clear();
                Logger.info('AICache', 'Đã xóa toàn bộ cache AI.');
            },

            delete(fingerprint, model) {
                if (!fingerprint) return;
                const key = this.buildKey(fingerprint, model);
                cache.delete(key);
            },

            invalidate(fingerprint) {
                if (!fingerprint) return;
                for (const k of cache.keys()) {
                    if (k.startsWith(fingerprint)) {
                        cache.delete(k);
                    }
                }
            }
        };
    })();

    /* ==========================================================================
       MODULE 13: AI RESPONSE PARSER & FALLBACK ENGINE
       ========================================================================== */
    const AIResponseParser = (function () {
        function extractBestLetterFromText(text, options) {
            if (!text) return null;
            const patterns = [
                // 1. chọn / đáp án / phương án / kết quả kèm letter (hỗ trợ nhiều biến thể tiếng Việt, tránh bắt nhầm chữ cuối)
                /(?:vậy\s*(?:ta\s*)?chọn|do\s*đó\s*(?:ta\s*)?chọn|suy\s*ra\s*(?:ta\s*)?chọn|chọn(?:\s*ngay)?)\s*(?:đáp\s*án|phương\s*án|câu)?\s*[*_`"'\(]*\s*([A-D])(?![a-zA-Zà-ỹ])/i,
                /(?:đáp\s*án|phương\s*án|kết\s*quả|kết\s*luận)\s*(?:đúng|cần\s*tìm)?\s*(?:là|:|=)?\s*[*_`"'\(]*\s*([A-D])(?![a-zA-Zà-ỹ])/i,
                /(?:^|[\s.,;])([A-D])\s*(?:là\s*đáp\s*án|là\s*phương\s*án\s*đúng|là\s*câu\s*đúng)/i,
                /(?:chọn|đáp\s*án|phương\s*án)\s*:\s*([A-D])(?![a-zA-Zà-ỹ])/i,
                /=>\s*[*_`"']*\s*(?:chọn\s*)?([A-D])(?![a-zA-Zà-ỹ])/i,
                /(?:^|[\s:(=])([A-D])\s*[.)]\s*$/i,
                /(?:^|[\s.,;])chọn\s*([A-D])(?![a-zA-Zà-ỹ])/i,
                /(?:^|[\s.,;])đáp\s*án\s*([A-D])(?![a-zA-Zà-ỹ])/i,
                /(?:^|[\s.,;])phương\s*án\s*([A-D])(?![a-zA-Zà-ỹ])/i,
                /(?:^|[\s.,;])tương\s*ứng\s*(?:với)?\s*(?:phương\s*án|đáp\s*án)?\s*([A-D])(?![a-zA-Zà-ỹ])/i
            ];
            for (const pat of patterns) {
                const match = text.match(pat);
                if (match && match[1]) return match[1].toUpperCase();
            }

            // 2. Fallback đối chiếu giá trị tính toán trong explain với nội dung các phương án
            if (options && Array.isArray(options) && options.length > 0) {
                // Tìm kết luận đại lượng tính toán cuối cùng (ví dụ: u_{100} = -289 hoặc = 289)
                const lastNumMatch = text.match(/(?:=|≈|bằng|là)\s*([+-]?\d+(?:[.,]\d+)?)\b[^\d]*$/s);
                if (lastNumMatch && lastNumMatch[1]) {
                    const val = lastNumMatch[1];
                    const matchedOpts = options.filter(o => {
                        const t = (o.contentText || o.contentHtml || '').trim();
                        const nums = t.match(/([+-]?\d+(?:[.,]\d+)?)/g) || [];
                        return nums.includes(val) || t.includes(val);
                    });
                    if (matchedOpts.length === 1) {
                        return matchedOpts[0].letter;
                    }
                }
            }

            return null;
        }

        function extractTrueFalseFromText(text) {
            if (!text) return null;
            const tf = {};
            const keys = ['a', 'b', 'c', 'd'];
            let count = 0;
            keys.forEach(k => {
                const regex = new RegExp(`\\b${k}\\s*\\)?[\\:\\-\\s]+(đúng|dung|true|sai|false)\\b`, 'i');
                const m = text.match(regex);
                if (m) {
                    const val = m[1].toLowerCase();
                    tf[k] = (val === 'đúng' || val === 'dung' || val === 'true');
                    count++;
                }
            });
            return count >= 2 ? tf : null;
        }

        function extractShortAnswerFromText(text) {
            if (!text) return null;
            const patterns = [
                /(?:làm\s*tròn[^\d\n]*được|làm\s*tròn[^\d\n]*là|làm\s*tròn[^\d\n]*thành)\s*([+-]?\d+(?:[.,]\d+)?)/i,
                /(?:đáp\s*án|đáp\s*số|kết\s*quả|kết\s*luận|vậy)\s*(?:là|:|=)?\s*([+-]?\d+(?:[.,]\d+)?)(?!\s*[\(\[])/i,
                /(?:a\s*\+\s*b|tổng|biểu\s*thức|giá\s*trị)\s*(?:là|:|=)\s*([+-]?\d+(?:[.,]\d+)?)(?!\s*[\(\[])/i,
                /(?:thu\s*được|được)\s*([+-]?\d+(?:[.,]\d+)?)\s*(?:triệu|nghìn|đ|đồng|cm|m|%)/i,
                /(?:=|≈)\s*([+-]?\d+(?:[.,]\d+)?)\s*(?:triệu|nghìn|đ|đồng|cm|m|%|\.?\s*$)/i
            ];
            for (const p of patterns) {
                const m = text.match(p);
                if (m && m[1]) return m[1].trim();
            }
            return null;
        }

        function safeParseJsonWithLatex(jsonStr) {
            if (!jsonStr) return null;
            // 1. Parse trực tiếp
            try { return JSON.parse(jsonStr); } catch (e) { }

            // 2. Tự động thoát các ký tự LaTeX không hợp lệ (\(, \), \frac, \le, \ge, \to...)
            try {
                const sanitized = jsonStr.replace(/\\([^"\\\/bfnrtu])/g, '\\\\$1');
                return JSON.parse(sanitized);
            } catch (e) { }

            // 3. Fallback trích xuất regex từng trường nếu JSON bị cắt cụt do max_tokens
            try {
                const result = {
                    explain: null,
                    short_answer: null,
                    best_letter: null,
                    best_index: null,
                    true_false: null
                };

                const saMatch = jsonStr.match(/"short_answer"\s*:\s*(?:"([^"]*)"|([+-]?\d+(?:[.,]\d+)?)|null)/i);
                if (saMatch) {
                    const val = saMatch[1] !== undefined ? saMatch[1] : saMatch[2];
                    if (val && val !== 'null') result.short_answer = val.trim();
                }

                const blMatch = jsonStr.match(/"best_letter"\s*:\s*(?:"([A-D])"|null)/i);
                if (blMatch && blMatch[1]) {
                    result.best_letter = blMatch[1].toUpperCase();
                    result.best_index = result.best_letter.charCodeAt(0) - 65;
                }

                const tfMatch = jsonStr.match(/"true_false"\s*:\s*\{([^}]+)\}/i);
                if (tfMatch) {
                    const tfObj = {};
                    ['a', 'b', 'c', 'd'].forEach(k => {
                        const kMatch = tfMatch[1].match(new RegExp(`"${k}"\\s*:\\s*(true|false)`, 'i'));
                        if (kMatch) {
                            tfObj[k] = kMatch[1].toLowerCase() === 'true';
                        }
                    });
                    if (Object.keys(tfObj).length >= 2) {
                        result.true_false = tfObj;
                    }
                }

                const expMatch = jsonStr.match(/"explain"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
                if (expMatch) {
                    result.explain = expMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
                }

                if (result.short_answer !== null || result.best_letter !== null || result.true_false !== null) {
                    return result;
                }
            } catch (e) { }

            return null;
        }

        return {
            parse(rawText, question) {
                if (!rawText || typeof rawText !== 'string') return null;

                let parsed = null;
                const jsonMatch = rawText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    parsed = safeParseJsonWithLatex(jsonMatch[0]);
                }

                const qOptions = question?.options || [];
                const fallbackTF = extractTrueFalseFromText(rawText);
                const fallbackSA = extractShortAnswerFromText(rawText);
                const fallbackLetter = extractBestLetterFromText(rawText, qOptions);

                if (!parsed) {
                    parsed = {
                        explain: rawText,
                        best_letter: fallbackLetter,
                        best_index: fallbackLetter ? fallbackLetter.charCodeAt(0) - 65 : null,
                        true_false: fallbackTF,
                        short_answer: fallbackSA
                    };
                } else {
                    const hasSA = parsed.short_answer !== null && parsed.short_answer !== undefined && String(parsed.short_answer).trim() !== '' && String(parsed.short_answer).trim() !== 'null';
                    const hasTF = parsed.true_false && typeof parsed.true_false === 'object' && Object.keys(parsed.true_false).length >= 2;
                    const hasLetter = parsed.best_letter !== null && parsed.best_letter !== undefined && String(parsed.best_letter).trim() !== '' && String(parsed.best_letter).trim() !== 'null';

                    if (hasSA) {
                        parsed.short_answer = String(parsed.short_answer).trim();
                        parsed.best_letter = null;
                        parsed.best_index = null;
                        parsed.true_false = null;
                    } else if (hasTF) {
                        parsed.short_answer = null;
                        parsed.best_letter = null;
                        parsed.best_index = null;
                    } else if (hasLetter) {
                        parsed.short_answer = null;
                        parsed.true_false = null;
                        parsed.best_letter = String(parsed.best_letter).toUpperCase().trim();
                        parsed.best_index = parsed.best_letter.charCodeAt(0) - 65;
                    } else {
                        // Nếu trường best_letter trong JSON bị null, quét tìm trong explain hoặc rawText
                        const extractedFromExplain = parsed.explain ? extractBestLetterFromText(parsed.explain, qOptions) : null;
                        const candidateLetter = extractedFromExplain || fallbackLetter;

                        if (candidateLetter) {
                            parsed.best_letter = candidateLetter;
                            parsed.best_index = candidateLetter.charCodeAt(0) - 65;
                            parsed.true_false = null;
                            parsed.short_answer = null;
                        } else if (fallbackSA) {
                            parsed.short_answer = fallbackSA;
                        } else if (fallbackTF) {
                            parsed.true_false = fallbackTF;
                        }
                    }
                }

                if (parsed.best_letter) {
                    parsed.best_letter = String(parsed.best_letter).toUpperCase().trim();
                    parsed.best_index = parsed.best_letter.charCodeAt(0) - 65;
                } else if (parsed.explain) {
                    // Cố gắng cứu đáp án lần cuối từ nội dung giải thích
                    const lastRescue = extractBestLetterFromText(parsed.explain, qOptions);
                    if (lastRescue) {
                        parsed.best_letter = lastRescue;
                        parsed.best_index = lastRescue.charCodeAt(0) - 65;
                    }
                }

                return parsed;
            }
        };
    })();

    /* ==========================================================================
       MODULE 14: RESULT VALIDATOR
       ========================================================================== */
    const ResultValidator = Object.freeze({
        validate(question, result) {
            if (!result) return { isValid: false, reason: 'Kết quả AI rỗng' };

            const isShortAnswer = question && (
                question.typeAnswer === 5 ||
                question.typeAnswer === 3 ||
                question.typeAnswer === 2 ||
                (question.typeLabel && /điền\s*số|trả\s*lời\s*ngắn|tự\s*luận/i.test(question.typeLabel)) ||
                /điền\s*đáp\s*án\s*thích\s*hợp\s*vào\s*ô\s*trống/i.test(question.contentText || '')
            );

            const isTrueFalse = !isShortAnswer && question && (
                question.typeAnswer === 1 ||
                (question.typeLabel && /đúng\s*\/\s*sai/i.test(question.typeLabel))
            );

            // 1. Kiểm tra câu Điền số / Trả lời ngắn
            if (isShortAnswer) {
                const val = result.short_answer !== null && result.short_answer !== undefined
                    ? String(result.short_answer).trim()
                    : '';
                if (!val) {
                    return { isValid: false, reason: 'Thiếu kết quả điền số cho câu trả lời ngắn' };
                }
                return { isValid: true, type: 'short_answer', value: val };
            }

            // 2. Kiểm tra câu Đúng / Sai
            if (isTrueFalse) {
                const tf = result.true_false;
                if (!tf || typeof tf !== 'object') {
                    return { isValid: false, reason: 'Dữ liệu Đúng/Sai không hợp lệ' };
                }
                const validKeys = ['a', 'b', 'c', 'd'].filter(k => typeof tf[k] === 'boolean');
                if (validKeys.length < 2) {
                    return { isValid: false, reason: 'Chưa đủ tối thiểu 2 mệnh đề Đúng/Sai' };
                }
                return { isValid: true, type: 'true_false', value: tf };
            }

            // 3. Kiểm tra Trắc nghiệm ABCD
            const letter = result.best_letter;
            if (!letter || !/^[A-D]$/.test(letter)) {
                return { isValid: false, reason: `Phương án trắc nghiệm không hợp lệ: ${letter}` };
            }
            const idx = letter.charCodeAt(0) - 65;
            if (question && question.options && question.options.length > 0 && idx >= question.options.length) {
                return { isValid: false, reason: `Phương án ${letter} (index ${idx}) vượt quá số lựa chọn (${question.options.length})` };
            }

            return { isValid: true, type: 'multiple_choice', value: letter, index: idx };
        }
    });

    /* ==========================================================================
       MODULE 15: AI CLIENT (MULTIMODAL VERCEL OPENAI)
       ========================================================================== */
    const AIClient = (function () {
        function buildPrompt(question, isRetry = false) {
            const allImages = [
                ...(question.images || []),
                ...((question.options || []).flatMap(o => o.images || []))
            ].filter(Boolean);

            let imageNote = '';
            if (allImages.length > 0) {
                imageNote = `\n(LƯU Ý: Câu hỏi có đính kèm ${allImages.length} hình ảnh biểu đồ/thí nghiệm/hình vẽ, hãy quan sát kỹ để giải)\n`;
            }

            let passageBlock = '';
            if (question.passage && question.passage.trim()) {
                passageBlock = `\n📖 BÀI ĐỌC / TÀI LIỆU NGUỒN LIÊN QUAN:\n${question.passage}\n-------------------------------------------\n`;
            }

            let sectionBlock = '';
            if (question.sectionTitle && question.sectionTitle.trim()) {
                sectionBlock = `[Môn/Chuyên đề: ${question.sectionTitle}]\n`;
            }

            const isShortAnswer = question.typeAnswer === 5 ||
                                  question.typeAnswer === 3 ||
                                  question.typeAnswer === 2 ||
                                  (question.typeLabel && /điền\s*số|trả\s*lời\s*ngắn|tự\s*luận/i.test(question.typeLabel)) ||
                                  /điền\s*đáp\s*án\s*thích\s*hợp\s*vào\s*ô\s*trống/i.test(question.contentText || '');

            const isTrueFalse = !isShortAnswer && (
                question.typeAnswer === 1 ||
                (question.typeLabel && /đúng\s*\/\s*sai/i.test(question.typeLabel))
            );

            let retryWarning = '';
            if (isRetry) {
                retryWarning = `\n⚠️ CẢNH BÁO ĐẶC BIỆT (LẦN THỬ LẠI):
Lần trước bạn tính nhầm dẫn tới không khớp phương án hoặc để "best_letter": null!
BẮT BUỘC phải rà soát lại cẩn thận hệ phương trình và phép tính số học, rồi điền "best_letter": "A" hoặc "B" hoặc "C" hoặc "D" tương ứng!
TUYỆT ĐỐI KHÔNG ĐƯỢC ĐỂ "best_letter": null!\n`;
            }

            const promptText = `Bạn là chuyên gia giải đề thi giáo dục phổ thông Việt Nam (chuẩn Bộ GD&ĐT).

NHIỆM VỤ:
Giải chính xác câu hỏi bằng tư duy khoa học, tính toán cẩn thận và trả về định dạng JSON chuẩn.

QUY TẮC CỐ ĐỊNH:
1. TRẮC NGHIỆM 4 LỰA CHỌN (A, B, C, D):
   - "best_letter": "A" | "B" | "C" | "D", "best_index": 0 | 1 | 2 | 3.
   - "true_false": null, "short_answer": null.
   - BẮT BUỘC: Luôn chọn đúng 1 trong 4 phương án A, B, C, D có sẵn. TUYỆT ĐỐI KHÔNG ĐƯỢC để "best_letter": null dù tính toán ra số nào. Nếu tính ban đầu chưa trùng khớp, hãy kiểm tra lại kỹ công thức và phép tính để chọn phương án chuẩn xác nhất.

2. ĐÚNG / SAI (Gồm 4 ý a, b, c, d độc lập):
   - "true_false": { "a": true|false, "b": true|false, "c": true|false, "d": true|false }.
   - "best_letter": null, "best_index": null, "short_answer": null.
   - BẮT BUỘC: Giá trị boolean trong "true_false" phải đồng nhất 100% với từng kết luận trong "explain". Nếu kết luận ý đó đúng thì BẮT BUỘC đặt true, kết luận sai thì đặt false.

3. ĐIỀN SỐ / TRẢ LỜI NGẮN:
   - Đọc kỹ đại lượng bài toán hỏi cuối cùng (ví dụ hỏi tổng a+b, số nhỏ nhất M, giá trị biểu thức...) để tính đúng đại lượng đó trong explain.
   - "short_answer": "<Chỉ ghi giá trị số hoặc phân số tối giản của kết luận cuối cùng trong explain>".
   - "best_letter": null, "best_index": null, "true_false": null.
${retryWarning}
CHỈ TRẢ VỀ JSON HỢP LỆ THEO SCHEMA (BẮT BUỘC ĐỂ "explain" LÊN ĐẦU ĐỂ TÍNH TOÁN SUY LUẬN TRƯỚC KHI KẾT LUẬN):
{
  "explain": "<Giải thích súc tích, các bước tính toán logic và kết luận rõ ràng đại lượng cần tìm>",
  "best_letter": null,
  "best_index": null,
  "true_false": null,
  "short_answer": null
}

---
${sectionBlock}${passageBlock}CÂU HỎI [Loại: ${isShortAnswer ? 'Điền số / Trả lời ngắn' : (isTrueFalse ? 'Đúng / Sai' : 'Trắc nghiệm')}]:
${question.contentText}
${imageNote}${(!isShortAnswer && (question.options || []).length > 0) ? `\nCÁC PHƯƠNG ÁN / MỆNH ĐỀ:\n${question.options.map(o => `${isTrueFalse ? (o.tfPrefix || (o.letter.toLowerCase() + ')')) : o.letter + '.'} ${o.contentText}`).join('\n')}` : ''}
`;

            return { prompt: promptText, images: allImages };
        }

        function solve(question, reqContext, isRetry = false) {
            return new Promise((resolve, reject) => {
                try {
                    const fingerprint = question.fingerprint || QuestionFingerprint.create(question);
                    const model = StateStore.get('ai.model') || Config.DEFAULT_AI_MODEL;

                    // 1. Kiểm tra cache trước (chỉ dùng cache nếu không phải retry)
                    if (!isRetry) {
                        const cachedSolution = AISolutionCache.get(fingerprint, model);
                        if (cachedSolution) {
                            return resolve(cachedSolution);
                        }
                    }

                    const { prompt, images } = buildPrompt(question, isRetry);
                    const endpoint = (StateStore.get('ai.endpoint') || Config.DEFAULT_AI_ENDPOINT).trim();
                    const apiKey = (StateStore.get('ai.apiKey') || '').trim();

                    if (!Utils.validateEndpointUrl(endpoint)) {
                        return reject(new Error('Endpoint AI không hợp lệ. Vui lòng cấu hình URL dạng http:// hoặc https://.'));
                    }

                    const apiUrl = endpoint.replace(/\/+$/, '') + '/v1/chat/completions';
                    const contentParts = [{ type: 'text', text: prompt }];

                    if (Array.isArray(images)) {
                        images.forEach(imgUrl => {
                            if (imgUrl) {
                                contentParts.push({
                                    type: 'image_url',
                                    image_url: { url: imgUrl }
                                });
                            }
                        });
                    }

                    StateStore.update('diagnostics', { aiRequests: StateStore.get('diagnostics.aiRequests') + 1 });
                    const startTime = Date.now();

                    if (reqContext && reqContext.signal && reqContext.signal.aborted) {
                        return reject(new Error('Yêu cầu AI đã bị hủy trước khi gửi.'));
                    }

                    const gmHeaders = { 'Content-Type': 'application/json' };
                    if (apiKey) {
                        gmHeaders['Authorization'] = `Bearer ${apiKey}`;
                    }

                    const gmReq = GM_xmlhttpRequest({
                        method: 'POST',
                        url: apiUrl,
                        headers: gmHeaders,
                        data: JSON.stringify({
                            model: model,
                            messages: [{ role: 'user', content: contentParts }],
                            reasoning_effort: 'low',
                            max_tokens: Config.MAX_AI_TOKENS,
                            temperature: 0.1
                        }),
                        timeout: Config.AI_TIMEOUT_MS,
                        onload: res => {
                            const latency = Date.now() - startTime;
                            StateStore.update('diagnostics', { lastAiLatencyMs: latency });

                            if (res.status >= 200 && res.status < 300) {
                                try {
                                    const data = JSON.parse(res.responseText);
                                    const rawContent = data.choices?.[0]?.message?.content || '';
                                    const parsed = AIResponseParser.parse(rawContent, question);
                                    if (!parsed) {
                                        throw new Error('Không phân tích được lời giải từ phản hồi của AI');
                                    }
                                    AISolutionCache.set(fingerprint, model, parsed);
                                    resolve(parsed);
                                } catch (err) {
                                    StateStore.update('diagnostics', { aiFailures: StateStore.get('diagnostics.aiFailures') + 1 });
                                    reject(new Error('Lỗi giải mã phản hồi từ AI: ' + err.message));
                                }
                            } else {
                                StateStore.update('diagnostics', { aiFailures: StateStore.get('diagnostics.aiFailures') + 1 });
                                reject(new Error(`API AI trả về mã lỗi ${res.status}: ${res.responseText.slice(0, 200)}`));
                            }
                        },
                        onerror: err => {
                            StateStore.update('diagnostics', { aiFailures: StateStore.get('diagnostics.aiFailures') + 1 });
                            reject(new Error('Lỗi mạng kết nối tới API AI: ' + (err.error || 'Network error')));
                        },
                        ontimeout: () => {
                            StateStore.update('diagnostics', { aiFailures: StateStore.get('diagnostics.aiFailures') + 1 });
                            reject(new Error(`Hết thời gian chờ phản hồi từ AI (${Config.AI_TIMEOUT_MS / 1000}s)`));
                        }
                    });

                    if (reqContext && reqContext.signal) {
                        reqContext.signal.addEventListener('abort', () => {
                            try { if (gmReq && typeof gmReq.abort === 'function') gmReq.abort(); } catch (e) { }
                            reject(new Error('Yêu cầu AI đã bị hủy do chuyển câu hỏi'));
                        });
                    }
                } catch (syncErr) {
                    StateStore.update('diagnostics', { aiFailures: StateStore.get('diagnostics.aiFailures') + 1 });
                    reject(syncErr);
                }
            });
        }

        return {
            buildPrompt,
            solve
        };
    })();

    /* ==========================================================================
       MODULE 16: ONLUYEN ADAPTER (DOM AUTOMATION CORE)
       ========================================================================== */
    const OnLuyenAdapter = (function () {
        // Trình kích hoạt sự kiện mô phỏng tương tác người dùng an toàn tuyệt đối
        function triggerUserInteraction(el) {
            if (!el) return false;
            const win = el.ownerDocument?.defaultView || (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);
            try {
                el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                el.focus();
            } catch (e) { }

            const mouseOpts = {
                bubbles: true,
                cancelable: true,
                composed: true,
                view: win,
                detail: 1,
                buttons: 0,
                button: 0
            };

            try {
                if (typeof win.PointerEvent === 'function') {
                    el.dispatchEvent(new win.PointerEvent('pointerdown', {
                        ...mouseOpts,
                        pointerId: 1,
                        pointerType: 'mouse',
                        isPrimary: true,
                        buttons: 1
                    }));
                }
                el.dispatchEvent(new win.MouseEvent('mousedown', { ...mouseOpts, buttons: 1 }));

                if (typeof win.PointerEvent === 'function') {
                    el.dispatchEvent(new win.PointerEvent('pointerup', {
                        ...mouseOpts,
                        pointerId: 1,
                        pointerType: 'mouse',
                        isPrimary: true
                    }));
                }
                el.dispatchEvent(new win.MouseEvent('mouseup', mouseOpts));
            } catch (e) { }

            try {
                if (typeof el.click === 'function') {
                    el.click();
                } else {
                    el.dispatchEvent(new win.MouseEvent('click', mouseOpts));
                }
            } catch (e) {
                try { el.dispatchEvent(new win.MouseEvent('click', mouseOpts)); } catch (err) { }
            }
            return true;
        }

        // --- MULTIPLE CHOICE ADAPTER ---
        const MultipleChoice = {
            findOption(targetIdx, letter, questionScope) {
                letter = (letter || '').toUpperCase().trim();
                if (!letter && typeof targetIdx === 'number') {
                    letter = String.fromCharCode(65 + targetIdx);
                }
                if ((typeof targetIdx !== 'number' || isNaN(targetIdx)) && letter) {
                    targetIdx = letter.charCodeAt(0) - 65;
                }

                const scope = questionScope || document.querySelector(
                    'app-practice-step-question-option, ' +
                    'app-practice-step-question, ' +
                    'app-test-school-question-option, ' +
                    'app-school-test-question, ' +
                    '.question-container, ' +
                    '.step-content, ' +
                    '.content-question'
                ) || document.body;

                // 1. Selector tiêu chuẩn của OnLuyện
                const qOptions = Array.from(scope.querySelectorAll('.question-option')).filter(el => {
                    if (el.closest('#olgq-panel') || el.closest('#olgq-modal') || el.closest('#olgq-toast')) return false;
                    const rect = el.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0;
                });

                if (qOptions.length > 0) {
                    for (const opt of qOptions) {
                        const lbl = opt.querySelector('.question-option-label');
                        const lblText = (lbl ? (lbl.innerText || lbl.textContent) : '').trim().toUpperCase();
                        if (lblText === letter || lblText.startsWith(letter + '.') || lblText.startsWith(letter + ')') || lblText.startsWith(letter + ':')) {
                            return {
                                element: opt,
                                label: lbl,
                                content: opt.querySelector('.question-option-content'),
                                input: opt.querySelector('input')
                            };
                        }
                    }

                    if (typeof targetIdx === 'number' && targetIdx >= 0 && qOptions[targetIdx]) {
                        const opt = qOptions[targetIdx];
                        return {
                            element: opt,
                            label: opt.querySelector('.question-option-label'),
                            content: opt.querySelector('.question-option-content'),
                            input: opt.querySelector('input')
                        };
                    }
                }

                // 2. Fallback quét theo huy hiệu nhãn A, B, C, D
                const badges = Array.from(scope.querySelectorAll('.question-option-label, span.badge, div.badge, span, button, b, strong, label, p')).filter(el => {
                    if (el.closest('#olgq-panel') || el.closest('#olgq-modal') || el.closest('#olgq-toast')) return false;
                    const rect = el.getBoundingClientRect();
                    if (rect.width === 0 && rect.height === 0) return false;
                    const t = (el.innerText || el.textContent || '').trim().toUpperCase();
                    return t === letter || t === (letter + '.') || t === (letter + ')') || t === (letter + ':');
                });

                for (const b of badges) {
                    const container = b.closest('.question-option') ||
                                      b.closest('.option-item') ||
                                      b.closest('.item-option') ||
                                      b.closest('.item') ||
                                      b.closest('.child-content') ||
                                      b.closest('.question-child') ||
                                      b.closest('label') ||
                                      b.parentElement;
                    if (container) {
                        return {
                            element: container,
                            label: b,
                            content: container.querySelector('.question-option-content') || container,
                            input: container.querySelector('input')
                        };
                    }
                }

                if (scope !== document.body) {
                    return this.findOption(targetIdx, letter, document.body);
                }

                return null;
            },

            isOptionSelected(targetInfo) {
                if (!targetInfo || !targetInfo.element) return false;
                const el = targetInfo.element;
                const hasClass = el.classList.contains('selected') ||
                                 el.classList.contains('bg-correct') ||
                                 el.classList.contains('active');
                const hasCheckedInput = targetInfo.input ? targetInfo.input.checked : false;
                return hasClass || hasCheckedInput;
            },

            select(targetInfo) {
                if (!targetInfo || !targetInfo.element) return false;
                const el = targetInfo.element;

                // Tạo hiệu ứng nhận diện thị giác
                el.style.outline = '3px solid #10b981';
                el.style.backgroundColor = 'rgba(16, 185, 129, 0.15)';
                el.style.borderRadius = '8px';
                el.style.boxShadow = '0 0 16px rgba(16, 185, 129, 0.8)';
                el.style.transition = 'all 0.25s ease';

                if (this.isOptionSelected(targetInfo)) return true;

                triggerUserInteraction(el);

                if (targetInfo.input) {
                    try {
                        targetInfo.input.checked = true;
                        targetInfo.input.dispatchEvent(new Event('input', { bubbles: true }));
                        targetInfo.input.dispatchEvent(new Event('change', { bubbles: true }));
                    } catch (e) { }
                }

                return true;
            }
        };

        // --- TRUE / FALSE ADAPTER ---
        const TrueFalse = {
            findStatementRows(questionScope) {
                const scope = questionScope || document.querySelector(
                    'app-test-school-question-true-false, ' +
                    'app-practice-step-question-true-false, ' +
                    '.true-false-container, ' +
                    '.options, ' +
                    '.step-content'
                ) || document.body;

                let tfBlocks = Array.from(scope.querySelectorAll('.true-false'))
                    .filter(el => !el.closest('#olgq-panel') && !el.closest('#olgq-modal') && !el.closest('#olgq-toast'));

                if (tfBlocks.length >= 2) return tfBlocks;

                const rawRows = Array.from(scope.querySelectorAll(
                    'app-practice-step-question-true-false .child-content, ' +
                    'app-test-school-question-true-false .child-content, ' +
                    '.child-content, ' +
                    '.item-true-false, ' +
                    'tr.item, ' +
                    'table tbody tr'
                )).filter(r => !r.closest('#olgq-panel') && r.querySelector('input[type="radio"], button, label'));

                return rawRows.filter(r => !rawRows.some(other => other !== r && r.contains(other)));
            },

            selectRow(row, isTrue, idx) {
                if (!row) return false;

                const targetRadio = isTrue
                    ? (row.querySelector('input[type="radio"][value="true"]') || row.querySelector('input[id*="true"]'))
                    : (row.querySelector('input[type="radio"][value="false"]') || row.querySelector('input[id*="false"]'));

                const labelSelector = isTrue ? /^(đúng|đ|true)$/i : /^(sai|s|false)$/i;
                const foundLabel = (targetRadio && targetRadio.id ? (row.querySelector(`label[for="${targetRadio.id}"]`) || document.querySelector(`label[for="${targetRadio.id}"]`)) : null) ||
                                   targetRadio?.closest('label') ||
                                   targetRadio?.parentElement?.querySelector('label') ||
                                   Array.from(row.querySelectorAll('label, button')).find(l => labelSelector.test((l.innerText || l.textContent || '').trim()));

                const targetBtn = foundLabel || targetRadio;
                if (!targetBtn) return false;

                targetBtn.style.outline = '3px solid #10b981';
                targetBtn.style.borderRadius = '8px';
                targetBtn.style.boxShadow = '0 0 12px rgba(16, 185, 129, 0.9)';

                triggerUserInteraction(targetBtn);

                if (targetRadio) {
                    if (!targetRadio.checked) targetRadio.checked = true;
                    try {
                        targetRadio.dispatchEvent(new Event('input', { bubbles: true }));
                        targetRadio.dispatchEvent(new Event('change', { bubbles: true }));
                    } catch (e) { }
                }

                return true;
            },

            isRowSelected(row, isTrue) {
                if (!row) return false;
                const targetRadio = isTrue
                    ? (row.querySelector('input[type="radio"][value="true"]') || row.querySelector('input[id*="true"]'))
                    : (row.querySelector('input[type="radio"][value="false"]') || row.querySelector('input[id*="false"]'));

                if (targetRadio && targetRadio.checked) return true;

                const labelSelector = isTrue ? /^(đúng|đ|true)$/i : /^(sai|s|false)$/i;
                const activeBtn = Array.from(row.querySelectorAll('label, button')).find(l => {
                    const txt = (l.innerText || l.textContent || '').trim();
                    const isActive = l.classList.contains('active') || l.classList.contains('selected');
                    return isActive && labelSelector.test(txt);
                });

                return !!activeBtn;
            }
        };

        // --- SHORT ANSWER ADAPTER ---
        const ShortAnswer = {
            findInput() {
                const specializedSelectors = [
                    'input.can-resize-second',
                    '#mathplay-answer-1',
                    'input[id^="mathplay-answer"]',
                    'input.answer-input',
                    'input.input-answer',
                    'app-practice-step-question-input input',
                    'app-test-school-question-freetext input',
                    'app-test-school-question-mathplay input',
                    'app-dynamic-html-input-by-keypad input',
                    '.question-input input',
                    '.answer-box input',
                    'input.link-input'
                ];

                for (const sel of specializedSelectors) {
                    const els = Array.from(document.querySelectorAll(sel));
                    for (const el of els) {
                        if (!el.closest('#olgq-panel') && !el.closest('#olgq-modal') && !el.closest('#olgq-toast')) {
                            const rect = el.getBoundingClientRect();
                            if (rect.width > 0 && rect.height > 0) return el;
                        }
                    }
                }

                const all = Array.from(document.querySelectorAll('input:not([type="radio"]):not([type="checkbox"]):not([type="hidden"]):not([type="button"]):not([type="submit"]), textarea, math-field, [contenteditable="true"]'));
                for (const el of all) {
                    if (!el.closest('#olgq-panel') && !el.closest('#olgq-modal') && !el.closest('#olgq-toast')) {
                        const rect = el.getBoundingClientRect();
                        if (rect.width > 0 && rect.height > 0) return el;
                    }
                }
                return null;
            },

            fill(inputEl, val) {
                if (!inputEl) return false;
                try {
                    inputEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    inputEl.focus();

                    if (typeof inputEl.setValue === 'function') {
                        inputEl.setValue(val);
                    }

                    if ('value' in inputEl) {
                        const proto = inputEl.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
                        const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
                        if (nativeSetter) {
                            nativeSetter.call(inputEl, val);
                        } else {
                            inputEl.value = val;
                        }
                    } else {
                        inputEl.textContent = val;
                    }

                    ['focus', 'keydown', 'keypress', 'input', 'keyup', 'change', 'blur'].forEach(evtType => {
                        inputEl.dispatchEvent(new Event(evtType, { bubbles: true, cancelable: true }));
                    });

                    inputEl.style.outline = '3px solid #10b981';
                    inputEl.style.boxShadow = '0 0 12px rgba(16, 185, 129, 0.9)';
                    inputEl.style.borderRadius = '6px';
                    return true;
                } catch (e) {
                    Logger.error('ShortAnswer', 'Fill error', e);
                    return false;
                }
            },

            verifyValue(inputEl, expectedVal) {
                if (!inputEl) return false;
                const actual = ('value' in inputEl ? inputEl.value : inputEl.textContent) || '';
                return actual.trim() === String(expectedVal).trim();
            }
        };

        // --- SUBMIT & NAVIGATION ADAPTER ---
        const Submit = {
            findSubmitButton() {
                const candidates = Array.from(document.querySelectorAll(
                    'button.btn.btn-lg.btn-block.ripple, ' +
                    '.submit-bar button, ' +
                    'app-test-school-question-option button, ' +
                    'app-test-school-question-true-false button, ' +
                    'app-test-school-question-freetext button, ' +
                    'app-practice-step-question-option button, ' +
                    'app-practice-step-question-true-false button, ' +
                    'app-practice-step-question-input button, ' +
                    'button.btn-primary, ' +
                    'button.btn-block, ' +
                    'button'
                ));

                for (const btn of candidates) {
                    if (btn.closest('#olgq-panel') || btn.closest('#olgq-modal') || btn.closest('#olgq-toast')) continue;
                    const txt = (btn.innerText || btn.textContent || '').trim().toLowerCase();
                    if (txt.includes('bỏ qua') || txt.includes('bo qua') || txt.includes('skip') || txt.includes('báo lỗi')) {
                        continue;
                    }
                    if (txt.includes('trả lời') || txt.includes('tra loi') || txt.includes('kiểm tra') || txt.includes('xác nhận')) {
                        return btn;
                    }
                }
                return null;
            },

            findPracticeNextButton() {
                const candidates = Array.from(document.querySelectorAll(
                    'button.btn.btn-lg.btn-block.ripple, ' +
                    '.submit-bar button, ' +
                    'app-practice-step-question-option button, ' +
                    'app-practice-step-question-true-false button, ' +
                    'app-practice-step-question-input button, ' +
                    'button.btn-primary, ' +
                    'button.btn-block, ' +
                    'button'
                ));

                for (const btn of candidates) {
                    if (btn.closest('#olgq-panel') || btn.closest('#olgq-modal') || btn.closest('#olgq-toast')) continue;
                    const txt = (btn.innerText || btn.textContent || '').trim().toLowerCase();
                    if (txt.includes('bỏ qua') || txt.includes('bo qua') || txt.includes('skip') || txt.includes('báo lỗi')) {
                        continue;
                    }
                    if (txt.includes('tiếp tục') || txt.includes('câu hỏi tiếp theo') || txt.includes('tiếp theo') || txt.includes('tiep tuc') || txt.includes('bài tiếp theo') || txt === 'next') {
                        return btn;
                    }
                }
                return null;
            },

            executeSubmit() {
                const btn = this.findSubmitButton();
                if (!btn) return false;
                if (btn.disabled || btn.classList.contains('disabled')) return false;
                triggerUserInteraction(btn);
                return true;
            },

            executeNext() {
                const btn = this.findPracticeNextButton();
                if (!btn) return false;
                if (btn.disabled || btn.classList.contains('disabled')) return false;
                triggerUserInteraction(btn);
                return true;
            }
        };

        // --- DOM QUESTION EXTRACTOR (FALLBACK) ---
        const Extractor = {
            extractCurrent() {
                const qContainer = document.querySelector(
                    'app-test-school-question-option, ' +
                    'app-test-school-question-true-false, ' +
                    'app-test-school-question-freetext, ' +
                    'app-mathplay-check-question, ' +
                    'app-practice-step-question-option, ' +
                    'app-practice-step-question-true-false, ' +
                    'app-practice-step-question-input, ' +
                    '.step-content, ' +
                    '.content-question'
                );

                if (!qContainer) return null;

                // 1. Số câu
                let qNum = null;
                const numEl = qContainer.querySelector('.question-header .question-info .num, .num, .question-number');
                if (numEl) {
                    const numMatch = (numEl.innerText || '').match(/(?:câu|#)?\s*[:.]?\s*(\d+)/i);
                    if (numMatch) qNum = parseInt(numMatch[1], 10);
                }

                // 2. Nội dung text
                const contentEl = qContainer.querySelector('#step, .question-text, .question-name, .content-question') || qContainer;
                const rawContentHtml = contentEl ? contentEl.innerHTML : '';
                const rawContentText = Utils.htmlToPlainText(contentEl ? contentEl.innerText : '');

                // 3. Phân loại
                let typeAnswer = 0;
                let typeLabel = 'Trắc nghiệm';
                const isTF = !!qContainer.querySelector('app-test-school-question-true-false, app-practice-step-question-true-false, .true-false, .item-true-false') ||
                             (qContainer.tagName && qContainer.tagName.toLowerCase().includes('true-false'));
                const isSA = !!qContainer.querySelector('app-practice-step-question-input, app-test-school-question-freetext, app-mathplay-check-question, input.can-resize-second, #mathplay-answer-1, input.answer-input') ||
                             (qContainer.tagName && qContainer.tagName.toLowerCase().includes('input'));

                if (isSA) {
                    typeAnswer = 5;
                    typeLabel = 'Điền số / Trả lời ngắn';
                } else if (isTF) {
                    typeAnswer = 1;
                    typeLabel = 'Đúng / Sai';
                }

                // 4. Phương án
                const options = [];
                if (typeAnswer === 0) {
                    const optEls = Array.from(qContainer.querySelectorAll('.question-option, .option-item, .item-option, label.option')).filter(el => {
                        return !el.closest('#olgq-panel') && el.getBoundingClientRect().width > 0;
                    });
                    optEls.forEach((el, idx) => {
                        const lbl = el.querySelector('.question-option-label');
                        const letter = (lbl ? lbl.innerText.trim() : String.fromCharCode(65 + idx)).replace(/[^A-Za-z]/g, '').toUpperCase() || String.fromCharCode(65 + idx);
                        const cnt = el.querySelector('.question-option-content') || el;
                        options.push({
                            idOption: idx,
                            letter: letter,
                            tfPrefix: letter.toLowerCase() + ')',
                            contentHtml: cnt.innerHTML,
                            contentText: Utils.htmlToPlainText(cnt.innerText),
                            images: Utils.extractImagesFromHtml(cnt.innerHTML)
                        });
                    });
                } else if (typeAnswer === 1) {
                    const rawRows = Array.from(qContainer.querySelectorAll('.child-content, .question-child, .item-true-false, tr.item')).filter(el => {
                        return !el.closest('#olgq-panel') && el.querySelector('.true-false, input[type="radio"], button, label');
                    });
                    const rows = rawRows.filter(r => !rawRows.some(other => other !== r && r.contains(other)));
                    rows.forEach((r, idx) => {
                        const charEl = r.querySelector('.option-char, .num-char');
                        const prefix = charEl ? charEl.innerText.trim() : (String.fromCharCode(97 + idx) + ')');
                        const textEl = r.querySelector('.option-text, .statement-text, td:nth-child(2)') || r;
                        options.push({
                            idOption: idx,
                            letter: String.fromCharCode(65 + idx),
                            tfPrefix: prefix,
                            contentHtml: textEl.innerHTML,
                            contentText: Utils.htmlToPlainText(textEl.innerText),
                            images: Utils.extractImagesFromHtml(textEl.innerHTML)
                        });
                    });
                }

                const q = {
                    index: qNum || 1,
                    numberQuestion: qNum || 1,
                    typeAnswer: typeAnswer,
                    typeLabel: typeLabel,
                    contentHtml: rawContentHtml,
                    contentText: rawContentText,
                    images: Utils.extractImagesFromHtml(rawContentHtml),
                    options: options,
                    isFromDOM: true
                };
                q.fingerprint = QuestionFingerprint.create(q);
                return q;
            },

            detectScreenQuestion() {
                const state = StateStore.getState();
                const list = state.exam.questions;
                if (!list || list.length === 0) {
                    return this.extractCurrent();
                }

                let screenNum = null;

                // A. Sidebar số câu OnLuyện
                const activeNav = document.querySelector(
                    'app-sidebar-school-test .option.active, ' +
                    '.left-side .option.active, ' +
                    '.left-side .grid .option.active, ' +
                    '.mobile-bottom-bar .numbers .number.active, ' +
                    '.mobile-bottom-bar .number.active, ' +
                    '.answer-sheet .option.active, ' +
                    '.list-question .active, ' +
                    '.sidebar .active, ' +
                    '.questions-list .active, ' +
                    '.nav-question .active, ' +
                    '.grid-question .active'
                );

                if (activeNav && !activeNav.closest('#olgq-panel')) {
                    const navNum = parseInt((activeNav.innerText || activeNav.textContent || '').trim(), 10);
                    if (!isNaN(navNum) && navNum > 0) screenNum = navNum;
                }

                // B. Header số câu
                if (!screenNum) {
                    const numEl = document.querySelector(
                        'app-test-school-question-option .num, ' +
                        'app-test-school-question-true-false .num, ' +
                        'app-test-school-question-freetext .num, ' +
                        '.question-header .question-info .num, ' +
                        '.question-header .num, ' +
                        '.step-content .num, ' +
                        '.question-number'
                    );
                    if (numEl && !numEl.closest('#olgq-panel')) {
                        const headerText = (numEl.innerText || numEl.textContent || '').trim();
                        const m = headerText.match(/(?:câu|question)\s*[:.]?\s*(\d+)/i);
                        if (m) screenNum = parseInt(m[1], 10);
                        else {
                            const mDigits = headerText.match(/(?:^|\s)(\d+)(?:\s|#|$)/);
                            if (mDigits) screenNum = parseInt(mDigits[1], 10);
                        }
                    }
                }

                // C. Khớp theo index
                if (screenNum && screenNum > 0) {
                    const matchedByNum = list.find(q => {
                        return (q.index === screenNum) ||
                               (q.stepIndex !== undefined && q.stepIndex === screenNum - 1) ||
                               (q.numberQuestion && parseInt(q.numberQuestion, 10) === screenNum);
                    });
                    if (matchedByNum) return matchedByNum;
                    if (list[screenNum - 1]) return list[screenNum - 1];

                    if (list.length === 1) {
                        list[0].index = screenNum;
                        return list[0];
                    }
                }

                // D. Khớp theo nội dung text
                const contentEl = document.querySelector(
                    'app-test-school-question-option .question-name, ' +
                    'app-test-school-question-true-false .question-name, ' +
                    'app-test-school-question-freetext .question-name, ' +
                    '.question-name, ' +
                    '.question-text, ' +
                    '.content-question'
                );
                if (contentEl && !contentEl.closest('#olgq-panel')) {
                    const cleanText = Utils.htmlToPlainText(contentEl.innerText || contentEl.textContent || '').trim();
                    if (cleanText.length >= 10) {
                        const snippet = cleanText.slice(0, 50).toLowerCase();
                        const matchedByText = list.find(q => {
                            const qTxt = (q.contentText || '').toLowerCase();
                            return qTxt.includes(snippet) || (qTxt.length >= 15 && snippet.includes(qTxt.slice(0, 35)));
                        });
                        if (matchedByText) return matchedByText;
                    }
                }

                return list[0];
            }
        };

        return {
            triggerUserInteraction,
            MultipleChoice,
            TrueFalse,
            ShortAnswer,
            Submit,
            Extractor
        };
    })();

    /* ==========================================================================
       MODULE 17: AUTOMATION CONTROLLER (STATE MACHINE)
       ========================================================================== */
    const AutomationController = (function () {
        let practiceNextTimer = null;
        let submitTimeoutTimer = null;

        function updateAutomationStatus(status, errorMsg) {
            StateStore.set('automation.status', status);
            if (errorMsg) StateStore.set('automation.lastError', errorMsg);
            Logger.debug('Automation', `Trạng thái: ${status}${errorMsg ? ` [Lỗi: ${errorMsg}]` : ''}`);
        }

        function triggerPracticeNextWatcher() {
            if (!StateStore.get('automation.autoSubmit')) return;
            if (!location.pathname.includes('/practices/')) return;

            if (practiceNextTimer) clearInterval(practiceNextTimer);
            let checks = 0;
            updateAutomationStatus('WAITING_NEXT');

            practiceNextTimer = setInterval(() => {
                checks++;
                if (checks > 35) { // Quá 14s hủy để tránh rò rỉ timer
                    clearInterval(practiceNextTimer);
                    practiceNextTimer = null;
                    updateAutomationStatus('IDLE');
                    return;
                }

                const nextBtn = OnLuyenAdapter.Submit.findPracticeNextButton();
                if (nextBtn && !nextBtn.disabled && !nextBtn.classList.contains('disabled')) {
                    clearInterval(practiceNextTimer);
                    practiceNextTimer = null;

                    setTimeout(() => {
                        if (document.body.contains(nextBtn)) {
                            OnLuyenAdapter.Submit.executeNext();
                            ToastManager.show('🚀 Đã tự động bấm "Tiếp tục"!');
                            updateAutomationStatus('IDLE');
                        }
                    }, Config.NEXT_BUTTON_DELAY_MS);
                }
            }, 400);
        }

        function executeAutoSubmit(delay = Config.SUBMIT_VERIFY_DELAY_MS) {
            if (!StateStore.get('automation.autoSubmit')) return;

            clearTimeout(submitTimeoutTimer);
            submitTimeoutTimer = setTimeout(() => {
                updateAutomationStatus('SUBMITTING');
                StateStore.update('diagnostics', { submitAttempts: StateStore.get('diagnostics.submitAttempts') + 1 });

                const submitted = OnLuyenAdapter.Submit.executeSubmit();
                if (submitted) {
                    updateAutomationStatus('SUBMITTED');
                    ToastManager.show('🚀 Đã tự động bấm "Trả lời"!');
                    if (location.pathname.includes('/practices/')) {
                        triggerPracticeNextWatcher();
                    }
                } else {
                    // Nếu là bài tự luyện và không tìm thấy nút submit, có thể nút Tiếp tục đã xuất hiện
                    if (location.pathname.includes('/practices/')) {
                        triggerPracticeNextWatcher();
                    } else {
                        // Thử lại 1 lần nếu nút submit đang tạm thời bị disabled
                        setTimeout(() => {
                            if (OnLuyenAdapter.Submit.executeSubmit()) {
                                updateAutomationStatus('SUBMITTED');
                                ToastManager.show('🚀 Đã tự động bấm "Trả lời"!');
                            } else {
                                updateAutomationStatus('IDLE');
                            }
                        }, 350);
                    }
                }
            }, delay);
        }

        function applySolution(solution, question) {
            updateAutomationStatus('ANSWER_READY');
            StateStore.update('diagnostics', { selectAttempts: StateStore.get('diagnostics.selectAttempts') + 1 });

            // 1. Validate kết quả trước khi thao tác DOM
            const validation = ResultValidator.validate(question, solution);
            if (!validation.isValid) {
                Logger.error('Automation', `Kết quả AI không vượt qua thẩm định: ${validation.reason}`);
                updateAutomationStatus('ERROR', validation.reason);
                UIManager.setStatus(`⚠ Không áp dụng đáp án: ${validation.reason}`, true);
                return;
            }

            const targetCard = UIManager.getCardForQuestion(question);

            // 2. Phân loại và thực thi
            if (validation.type === 'short_answer') {
                const val = validation.value;
                if (targetCard) {
                    const explainEl = targetCard.querySelector('.olgq-explain');
                    if (explainEl) {
                        explainEl.innerHTML = `<b>🎯 Đáp án điền số:</b> <span style="color:#38bdf8;font-size:14px;font-weight:bold">${Utils.escapeHtml(val)}</span><br>` + explainEl.innerHTML;
                    }
                }

                let attempts = 0;
                const fillLoop = () => {
                    attempts++;
                    updateAutomationStatus('SELECTING');
                    const inputEl = OnLuyenAdapter.ShortAnswer.findInput();
                    if (inputEl) {
                        OnLuyenAdapter.ShortAnswer.fill(inputEl, val);
                        updateAutomationStatus('VERIFYING');

                        if (OnLuyenAdapter.ShortAnswer.verifyValue(inputEl, val)) {
                            ToastManager.show(`🤖 Đã điền đáp án: ${val}`);
                            executeAutoSubmit();
                            return;
                        }
                    }

                    if (attempts < Config.MAX_SELECTION_RETRIES) {
                        setTimeout(fillLoop, 350);
                    } else {
                        updateAutomationStatus('ERROR', 'Không điền được ô trả lời ngắn sau nhiều lần thử');
                    }
                };

                fillLoop();
                return;
            }

            if (validation.type === 'true_false') {
                const tf = validation.value;
                const tfKeys = ['a', 'b', 'c', 'd'];

                // Cập nhật card của panel
                if (targetCard) {
                    const optEls = targetCard.querySelectorAll('.olgq-option');
                    tfKeys.forEach((key, idx) => {
                        const isTrue = tf[key];
                        if (typeof isTrue === 'boolean' && optEls[idx]) {
                            optEls[idx].classList.remove('correct', 'incorrect');
                            optEls[idx].classList.add(isTrue ? 'correct' : 'incorrect');
                            const oldNote = optEls[idx].querySelector('.olgq-tf-note');
                            if (oldNote) oldNote.remove();
                            const note = document.createElement('span');
                            note.className = 'olgq-tf-note ' + (isTrue ? 'olgq-ok' : 'olgq-bad');
                            note.textContent = isTrue ? ' 🤖 [ ĐÚNG ]' : ' 🤖 [ SAI ]';
                            optEls[idx].appendChild(note);
                        }
                    });
                }

                if (!StateStore.get('automation.autoSelect')) return;

                updateAutomationStatus('SELECTING');
                const rows = OnLuyenAdapter.TrueFalse.findStatementRows();
                let maxDelay = 0;
                let scheduledCount = 0;

                tfKeys.forEach((key, idx) => {
                    const isTrue = tf[key];
                    if (typeof isTrue !== 'boolean') return;
                    if (!rows[idx]) return;

                    scheduledCount++;
                    const itemDelay = 120 + idx * 240;
                    maxDelay = Math.max(maxDelay, itemDelay);

                    setTimeout(() => {
                        if (!OnLuyenAdapter.TrueFalse.isRowSelected(rows[idx], isTrue)) {
                            OnLuyenAdapter.TrueFalse.selectRow(rows[idx], isTrue, idx);
                        }
                    }, itemDelay);
                });

                if (scheduledCount > 0) {
                    ToastManager.show(`🤖 AI đang tự động chọn ${scheduledCount} ý Đúng/Sai...`);
                    executeAutoSubmit(maxDelay + 750);
                }
                return;
            }

            if (validation.type === 'multiple_choice') {
                const letter = validation.value;
                const targetIdx = validation.index;

                if (targetCard) {
                    const optEls = targetCard.querySelectorAll('.olgq-option');
                    if (optEls[targetIdx]) {
                        optEls[targetIdx].classList.add('correct');
                        const oldNote = optEls[targetIdx].querySelector('.olgq-ok');
                        if (oldNote) oldNote.remove();
                        const note = document.createElement('span');
                        note.className = 'olgq-ok';
                        note.textContent = ' 🤖 (AI Khuyên Chọn)';
                        optEls[targetIdx].appendChild(note);
                    }
                }

                let attempts = 0;
                const selectLoop = () => {
                    attempts++;
                    updateAutomationStatus('SELECTING');
                    const targetInfo = OnLuyenAdapter.MultipleChoice.findOption(targetIdx, letter);

                    if (targetInfo && targetInfo.element) {
                        OnLuyenAdapter.MultipleChoice.select(targetInfo);

                        if (StateStore.get('automation.autoSelect')) {
                            updateAutomationStatus('VERIFYING');
                            setTimeout(() => {
                                const selected = OnLuyenAdapter.MultipleChoice.isOptionSelected(targetInfo);
                                if (selected) {
                                    ToastManager.show(`🤖 Đã tự động chọn [ ${letter} ]!`);
                                    executeAutoSubmit();
                                } else if (attempts < Config.MAX_SELECTION_RETRIES) {
                                    setTimeout(selectLoop, 250);
                                }
                            }, 200);
                        }
                        return;
                    }

                    if (attempts < Config.MAX_SELECTION_RETRIES) {
                        setTimeout(selectLoop, 350);
                    } else {
                        updateAutomationStatus('ERROR', `Không tìm thấy phần tử lựa chọn [ ${letter} ]`);
                    }
                };

                selectLoop();
            }
        }

        return {
            applySolution,
            executeAutoSubmit,
            triggerPracticeNextWatcher,
            updateAutomationStatus
        };
    })();

    /* ==========================================================================
       MODULE 18: TOAST MANAGER
       ========================================================================== */
    const ToastManager = Object.freeze({
        show(msg) {
            let toast = document.getElementById('olgq-toast');
            if (!toast) {
                toast = document.createElement('div');
                toast.id = 'olgq-toast';
                document.body.appendChild(toast);
            }
            toast.textContent = msg;
            toast.className = 'show';
            clearTimeout(toast._timer);
            toast._timer = setTimeout(() => {
                toast.className = '';
            }, 2600);
        }
    });

    /* ==========================================================================
       MODULE 19: UI MANAGER & DARK SAAS PANEL
       ========================================================================== */
    const UIManager = (function () {
        function getCardForQuestion(question) {
            if (!question) return null;
            const cards = document.querySelectorAll('#olgq-list .olgq-card');
            if (!cards || !cards.length) return null;

            const questions = StateStore.get('exam.questions') || [];
            const qIdx = questions.indexOf(question);
            if (qIdx !== -1 && cards[qIdx]) return cards[qIdx];

            for (let i = 0; i < cards.length; i++) {
                const cardQ = questions[i];
                if (cardQ && (cardQ === question || cardQ.stepId === question.stepId || (cardQ.index && cardQ.index === question.index))) {
                    return cards[i];
                }
            }
            return cards[0];
        }

        function setStatus(msg, isError = false) {
            StateStore.update('ui', { statusText: msg, isErrorStatus: isError });
            const box = document.getElementById('olgq-status');
            if (!box) return;
            box.textContent = msg;
            box.className = 'olgq-status' + (isError ? ' err' : '');
        }

        function updateContextBar(q) {
            const ctxBox = document.getElementById('olgq-ctx');
            if (!ctxBox) return;
            if (!q) {
                ctxBox.textContent = 'Chưa nhận diện được ID bài. Hãy mở trang làm bài hoặc dán link vào ô.';
                return;
            }
            const qTitle = q.index ? `Câu ${q.index}` : (q.numberQuestion ? `#${q.numberQuestion}` : 'Câu hỏi');
            const total = StateStore.get('exam.questions').length;
            const totalStr = total > 1 ? ` (${q.index || 1}/${total})` : '';
            ctxBox.innerHTML = `📍 Đang làm: <b>${Utils.escapeHtml(qTitle)}</b> [${Utils.escapeHtml(q.typeLabel)}]${totalStr}`;
        }

        function highlightActiveCard(q) {
            if (!q) return;
            const cards = document.querySelectorAll('#olgq-list .olgq-card');
            const questions = StateStore.get('exam.questions');
            cards.forEach((card, idx) => {
                const cardQ = questions[idx];
                const isMatch = (cardQ && (
                    cardQ === q ||
                    cardQ.stepId === q.stepId ||
                    (cardQ.index && cardQ.index === q.index) ||
                    (cardQ.numberQuestion && cardQ.numberQuestion === q.numberQuestion)
                ));

                if (isMatch) {
                    if (!card.classList.contains('active-now')) {
                        card.classList.add('active-now', 'open');
                        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }
                } else {
                    card.classList.remove('active-now');
                }
            });
        }

        function renderQuestionCard(q, n) {
            const card = document.createElement('div');
            card.className = 'olgq-card' + (StateStore.get('ui.collapsed') ? '' : ' open');

            const head = document.createElement('div');
            head.className = 'olgq-card-head';
            head.innerHTML = `
                <span class="olgq-num">Câu ${q.index || n}</span>
                <span class="olgq-badge">${Utils.escapeHtml(q.typeLabel)}</span>
                ${q.sectionTitle ? `<span class="olgq-badge sec">${Utils.escapeHtml(q.sectionTitle)}</span>` : ''}
                <button class="olgq-copy-single" title="Copy riêng câu này">📋 Copy</button>
                <span class="olgq-toggle">${StateStore.get('ui.collapsed') ? '▸' : '▾'}</span>
            `;

            head.querySelector('.olgq-copy-single').addEventListener('click', e => {
                e.stopPropagation();
                const singleText = ClipboardHelper.formatAsPlainText([q], StateStore.get('exam.info'));
                ClipboardHelper.copy(singleText, `✔ Đã copy Câu ${q.index || n}!`);
            });

            head.addEventListener('click', () => card.classList.toggle('open'));
            card.appendChild(head);

            const body = document.createElement('div');
            body.className = 'olgq-card-body';

            if (q.passage) {
                const passEl = document.createElement('div');
                passEl.className = 'olgq-passage-box';
                passEl.innerHTML = `<b>📖 Đoạn văn:</b><br>${Utils.escapeHtml(q.passage).replace(/\n/g, '<br>')}`;
                body.appendChild(passEl);
            }

            const content = document.createElement('div');
            content.className = 'olgq-content';
            content.innerHTML = q.contentHtml || Utils.escapeHtml(q.contentText);
            body.appendChild(content);

            if (q.options && q.options.length) {
                const optsList = document.createElement('div');
                optsList.className = 'olgq-options';
                q.options.forEach(opt => {
                    const optRow = document.createElement('div');
                    optRow.className = 'olgq-option' + (opt.isAnswer ? ' correct' : '');
                    optRow.innerHTML = `
                        <span class="olgq-opt-prefix">${Utils.escapeHtml(q.typeAnswer === 1 ? opt.tfPrefix : opt.letter + '.')}</span>
                        <span class="olgq-opt-text">${opt.contentHtml || Utils.escapeHtml(opt.contentText)}</span>
                        ${opt.isAnswer ? '<span class="olgq-ok">✔</span>' : ''}
                    `;
                    optsList.appendChild(optRow);
                });
                body.appendChild(optsList);
            }

            if (q.explain) {
                const exp = document.createElement('div');
                exp.className = 'olgq-explain';
                exp.innerHTML = `<b>💡 Lời giải:</b> ${Utils.escapeHtml(q.explain)}`;
                body.appendChild(exp);
            }

            card.appendChild(body);
            card.dataset.text = (q.contentText + ' ' + (q.passage || '')).toLowerCase();
            return card;
        }

        function renderQuestionsList() {
            const listWrap = document.getElementById('olgq-list');
            if (!listWrap) return;
            listWrap.innerHTML = '';
            const questions = StateStore.get('exam.questions') || [];
            questions.forEach((q, i) => {
                listWrap.appendChild(renderQuestionCard(q, i + 1));
            });
            applyFilter();

            try {
                if (window.MathJax && window.MathJax.typesetPromise) {
                    window.MathJax.typesetPromise([listWrap]);
                }
            } catch (e) { }
        }

        function applyFilter() {
            const input = document.getElementById('olgq-search');
            const kw = (input && input.value || '').trim().toLowerCase();
            let visible = 0;
            const cards = document.querySelectorAll('#olgq-list .olgq-card');
            cards.forEach(card => {
                const show = !kw || card.dataset.text.indexOf(kw) !== -1;
                card.style.display = show ? '' : 'none';
                if (show) visible++;
            });
            const counter = document.getElementById('olgq-count');
            const total = StateStore.get('exam.questions').length;
            if (counter) {
                counter.textContent = kw ? `${visible}/${total} câu` : `${total} câu hỏi`;
            }
        }

        function openSettingsModal() {
            let modal = document.getElementById('olgq-settings-modal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'olgq-settings-modal';
                modal.className = 'olgq-modal-backdrop';
                modal.innerHTML = `
                    <div class="olgq-modal-box settings-box">
                        <div class="olgq-modal-head">
                            <span>⚙️ Cài Đặt Hệ Thống & Trí Tuệ Nhân Tạo V4</span>
                            <span class="olgq-modal-close" id="olgq-settings-close">✕</span>
                        </div>
                        <div class="olgq-modal-content">
                            <div class="olgq-form-group">
                                <label>🌐 Vercel AI Endpoint</label>
                                <input type="text" id="olgq-set-endpoint" placeholder="https://your-vercel-proxy.vercel.app">
                                <small>Endpoint proxy ChatGPT hoặc mô hình tương thích OpenAI v1/chat/completions</small>
                            </div>
                            <div class="olgq-form-group">
                                <label>🤖 Mô hình (Model)</label>
                                <input type="text" id="olgq-set-model" placeholder="gpt-6-luna">
                            </div>
                            <div class="olgq-form-group">
                                <label>🔑 API Key / Access Token (Bảo mật)</label>
                                <div class="olgq-pass-wrapper">
                                    <input type="password" id="olgq-set-apikey" placeholder="Nhập access token hoặc để trống">
                                    <button type="button" class="olgq-toggle-eye" id="olgq-toggle-eye">👁️</button>
                                </div>
                                <small>Khóa được lưu cục bộ trong Tampermonkey storage, không bao giờ lộ trên console hoặc UI</small>
                            </div>
                            <div class="olgq-form-group">
                                <label>📊 Mức độ chẩn đoán (Debug Level)</label>
                                <select id="olgq-set-loglevel">
                                    <option value="0">OFF (Không ghi log)</option>
                                    <option value="1">ERROR (Chỉ lỗi nghiêm trọng)</option>
                                    <option value="2">WARN (Cảnh báo)</option>
                                    <option value="3">INFO (Thông tin chuẩn)</option>
                                    <option value="4">DEBUG (Chi tiết gỡ lỗi)</option>
                                </select>
                            </div>
                            <div class="olgq-diag-summary" id="olgq-diag-summary">
                                <b>📈 Thống kê phiên:</b><br>
                                • Requests: <span id="diag-api">0</span> | AI: <span id="diag-ai">0</span><br>
                                • Cache Hits: <span id="diag-cache">0</span> | Độ trễ AI: <span id="diag-latency">0ms</span>
                            </div>
                        </div>
                        <div class="olgq-modal-foot">
                            <button class="olgq-btn gray" id="olgq-clear-cache">🗑️ Xóa Cache AI</button>
                            <button class="olgq-btn primary" id="olgq-settings-save">💾 Lưu Cài Đặt</button>
                        </div>
                    </div>
                `;
                document.body.appendChild(modal);

                document.getElementById('olgq-settings-close').addEventListener('click', () => {
                    modal.style.display = 'none';
                });

                document.getElementById('olgq-toggle-eye').addEventListener('click', () => {
                    const passInput = document.getElementById('olgq-set-apikey');
                    passInput.type = passInput.type === 'password' ? 'text' : 'password';
                });

                document.getElementById('olgq-clear-cache').addEventListener('click', () => {
                    AISolutionCache.clear();
                    ToastManager.show('✔ Đã dọn sạch cache AI!');
                });

                document.getElementById('olgq-settings-save').addEventListener('click', () => {
                    const ep = (document.getElementById('olgq-set-endpoint').value || '').trim();
                    const model = (document.getElementById('olgq-set-model').value || '').trim() || Config.DEFAULT_AI_MODEL;
                    const key = (document.getElementById('olgq-set-apikey').value || '').trim();
                    const logLvl = parseInt(document.getElementById('olgq-set-loglevel').value, 10);

                    if (ep && !Utils.validateEndpointUrl(ep)) {
                        alert('URL Endpoint không hợp lệ! Bắt buộc bắt đầu bằng http:// hoặc https://');
                        return;
                    }

                    StateStore.set('ai.endpoint', ep || Config.DEFAULT_AI_ENDPOINT);
                    StateStore.set('ai.model', model);
                    StateStore.set('ai.apiKey', key);
                    StateStore.set('app.debugLevel', logLvl);
                    Logger.setLevel(logLvl);

                    GM_setValue(Config.STORAGE_KEYS.AI_ENDPOINT, ep || Config.DEFAULT_AI_ENDPOINT);
                    GM_setValue(Config.STORAGE_KEYS.AI_MODEL, model);
                    GM_setValue(Config.STORAGE_KEYS.AI_API_KEY, key);
                    GM_setValue(Config.STORAGE_KEYS.DEBUG_LEVEL, logLvl);

                    modal.style.display = 'none';
                    ToastManager.show('✔ Đã lưu cài đặt an toàn!');
                    setStatus(`✔ Đang dùng Model: ${model}`);
                });
            }

            // Đồng bộ dữ liệu hiện tại lên modal
            document.getElementById('olgq-set-endpoint').value = StateStore.get('ai.endpoint') || Config.DEFAULT_AI_ENDPOINT;
            document.getElementById('olgq-set-model').value = StateStore.get('ai.model') || Config.DEFAULT_AI_MODEL;
            document.getElementById('olgq-set-apikey').value = StateStore.get('ai.apiKey') || '';
            document.getElementById('olgq-set-loglevel').value = String(StateStore.get('app.debugLevel'));

            const diag = StateStore.get('diagnostics');
            document.getElementById('diag-api').textContent = `${diag.apiRequests} (${diag.apiFailures} lỗi)`;
            document.getElementById('diag-ai').textContent = `${diag.aiRequests} (${diag.aiFailures} lỗi)`;
            document.getElementById('diag-cache').textContent = `${diag.cacheHits} / ${diag.cacheHits + diag.cacheMisses}`;
            document.getElementById('diag-latency').textContent = `${diag.lastAiLatencyMs}ms`;

            modal.style.display = 'flex';
        }

        function injectUI() {
            if (document.getElementById('olgq-panel')) return;

            const style = document.createElement('style');
            style.textContent = `
                #olgq-panel {
                    position: fixed; top: 65px; right: 18px; width: 440px; max-width: calc(100vw - 36px);
                    background: #0f172a; color: #f8fafc; border: 1px solid rgba(255,255,255,.18);
                    border-radius: 14px; box-shadow: 0 16px 40px rgba(0,0,0,.5); z-index: 2147483000;
                    font-size: 13px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    display: flex; flex-direction: column; max-height: calc(100vh - 90px);
                }
                #olgq-panel .olgq-head {
                    display: flex; justify-content: space-between; align-items: center; padding: 10px 14px;
                    background: #1e293b; border-radius: 14px 14px 0 0; border-bottom: 1px solid rgba(255,255,255,.1);
                    cursor: move; user-select: none;
                }
                #olgq-panel .olgq-title-wrap { display: flex; align-items: center; gap: 8px; }
                #olgq-panel .olgq-status-dot {
                    width: 9px; height: 9px; border-radius: 50%; background: #10b981;
                    box-shadow: 0 0 8px #10b981; transition: background .3s;
                }
                #olgq-panel .olgq-status-dot.thinking { background: #38bdf8; box-shadow: 0 0 8px #38bdf8; animation: pulse 1.2s infinite; }
                #olgq-panel .olgq-status-dot.error { background: #ef4444; box-shadow: 0 0 8px #ef4444; }
                @keyframes pulse { 0% { opacity: 1; } 50% { opacity: .4; } 100% { opacity: 1; } }
                #olgq-panel .olgq-title { font-weight: 700; color: #38bdf8; font-size: 13.5px; }
                #olgq-panel .olgq-icon { cursor: pointer; color: #94a3b8; padding: 0 6px; font-weight: 700; font-size: 14px; }
                #olgq-panel .olgq-icon:hover { color: #fff; }
                #olgq-panel .olgq-body { padding: 12px; overflow-y: auto; overflow-x: hidden; }
                #olgq-panel.collapsed .olgq-body { display: none; }
                #olgq-panel .olgq-ctx { font-size: 11.5px; color: #94a3b8; margin-bottom: 8px; word-break: break-all; }
                #olgq-panel .olgq-ctx b { color: #38bdf8; }
                #olgq-panel .olgq-row { display: flex; gap: 6px; margin-bottom: 8px; }
                #olgq-panel input[type=text] {
                    flex: 1; min-width: 0; background: #0b1220; border: 1px solid rgba(255,255,255,.15);
                    color: #e2e8f0; border-radius: 6px; padding: 7px 10px; font-size: 12.5px;
                }
                #olgq-panel input[type=text]:focus { outline: none; border-color: #38bdf8; }
                #olgq-panel .olgq-btn {
                    border: none; border-radius: 6px; padding: 7px 11px; font-weight: 600; cursor: pointer;
                    color: #fff; font-size: 12px; white-space: nowrap; transition: .15s; display: inline-flex;
                    align-items: center; gap: 4px; justify-content: center;
                }
                #olgq-panel .olgq-btn:hover { opacity: .9; transform: translateY(-1px); }
                #olgq-panel .olgq-btn:disabled { opacity: .45; cursor: not-allowed; transform: none; }
                #olgq-panel .primary { background: #0284c7; }
                #olgq-panel .purple { background: #6366f1; }
                #olgq-panel .emerald { background: #10b981; }
                #olgq-panel .amber { background: #d97706; }
                #olgq-panel .gray { background: #334155; }
                #olgq-panel .olgq-opts-bar {
                    display: flex; gap: 12px; margin-bottom: 8px; font-size: 11.5px; color: #94a3b8;
                    padding: 4px 6px; background: rgba(255,255,255,.03); border-radius: 6px;
                }
                #olgq-panel .olgq-opts-bar label {
                    display: flex; align-items: center; gap: 4px; cursor: pointer; user-select: none;
                }
                #olgq-panel .olgq-opts-bar label:hover { color: #38bdf8; }
                #olgq-panel .olgq-copy-bar {
                    display: flex; gap: 6px; margin: 8px 0; background: rgba(255,255,255,.04);
                    padding: 8px; border-radius: 8px; border: 1px solid rgba(255,255,255,.08); flex-wrap: wrap;
                }
                #olgq-panel .olgq-status {
                    background: rgba(0,0,0,.35); border: 1px solid rgba(255,255,255,.08); border-radius: 6px;
                    padding: 8px 10px; margin: 6px 0; font-size: 12px; color: #cbd5e1; word-break: break-word;
                }
                #olgq-panel .olgq-status.err { color: #fca5a5; border-color: rgba(248,113,113,.4); }
                #olgq-panel .olgq-toolbar { display: flex; gap: 6px; align-items: center; margin: 8px 0; }
                #olgq-panel .olgq-count { font-size: 11.5px; color: #94a3b8; margin-left: auto; white-space: nowrap; }
                #olgq-panel .olgq-card {
                    border: 1px solid rgba(255,255,255,.1); border-radius: 8px; margin-bottom: 8px;
                    background: rgba(255,255,255,.03); overflow: hidden; transition: all .25s ease;
                }
                #olgq-panel .olgq-card.active-now {
                    border: 2px solid #06b6d4 !important;
                    box-shadow: 0 0 16px rgba(6,182,212,.55) !important;
                    background: rgba(6,182,212,.08) !important;
                }
                #olgq-panel .olgq-card.active-now .olgq-card-head {
                    background: rgba(6,182,212,.22) !important;
                }
                #olgq-panel .olgq-card.active-now .olgq-num {
                    color: #22d3ee !important;
                    text-shadow: 0 0 8px rgba(34,211,238,.6);
                }
                #olgq-panel .olgq-card-head {
                    display: flex; align-items: center; gap: 6px; padding: 7px 10px; cursor: pointer;
                    background: rgba(255,255,255,.04); user-select: none;
                }
                #olgq-panel .olgq-card-head:hover { background: rgba(255,255,255,.08); }
                #olgq-panel .olgq-num { font-weight: 700; color: #38bdf8; min-width: 55px; }
                #olgq-panel .olgq-badge {
                    font-size: 10px; background: rgba(56,189,248,.15); color: #7dd3fc;
                    border: 1px solid rgba(56,189,248,.3); border-radius: 20px; padding: 2px 7px; white-space: nowrap;
                }
                #olgq-panel .olgq-badge.sec {
                    background: rgba(167,139,250,.14); color: #c4b5fd; border-color: rgba(167,139,250,.3);
                    max-width: 140px; overflow: hidden; text-overflow: ellipsis;
                }
                #olgq-panel .olgq-copy-single {
                    background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.15); color: #cbd5e1;
                    border-radius: 4px; padding: 2px 6px; font-size: 10.5px; cursor: pointer; margin-left: auto;
                }
                #olgq-panel .olgq-copy-single:hover { background: rgba(56,189,248,.2); color: #fff; }
                #olgq-panel .olgq-toggle { color: #94a3b8; font-size: 11px; margin-left: 4px; }
                #olgq-panel .olgq-card-body { display: none; padding: 8px 12px 12px; }
                #olgq-panel .olgq-card.open .olgq-card-body { display: block; }
                #olgq-panel .olgq-passage-box {
                    background: rgba(30,41,59,.7); border-left: 3px solid #38bdf8; border-radius: 4px;
                    padding: 6px 10px; margin-bottom: 8px; font-size: 12px; color: #94a3b8; line-height: 1.5;
                }
                #olgq-panel .olgq-content { font-size: 13px; line-height: 1.6; color: #e2e8f0; word-break: break-word; }
                #olgq-panel .olgq-options { margin-top: 8px; display: flex; flex-direction: column; gap: 4px; }
                #olgq-panel .olgq-option {
                    display: flex; gap: 6px; align-items: flex-start; padding: 5px 8px; border-radius: 6px;
                    background: rgba(255,255,255,.03); font-size: 12.5px; line-height: 1.5;
                }
                #olgq-panel .olgq-option.correct { background: rgba(16,185,129,.16); outline: 1px solid rgba(16,185,129,.5); }
                #olgq-panel .olgq-option.incorrect { background: rgba(239,68,68,.12); outline: 1px solid rgba(239,68,68,.35); }
                #olgq-panel .olgq-opt-prefix { font-weight: 700; color: #7dd3fc; min-width: 18px; }
                #olgq-panel .olgq-opt-text { flex: 1; color: #e2e8f0; }
                #olgq-panel .olgq-ok { color: #34d399; font-weight: 700; }
                #olgq-panel .olgq-bad { color: #f87171; font-weight: 700; }
                #olgq-panel .olgq-explain {
                    margin-top: 8px; padding: 6px 8px; border-radius: 6px; font-size: 12px;
                    background: rgba(74,222,128,.1); border: 1px solid rgba(74,222,128,.25); color: #86efac;
                }
                #olgq-launch {
                    position: fixed; bottom: 22px; right: 22px; z-index: 2147483000; border: none;
                    border-radius: 24px; padding: 11px 18px; font-weight: 700; font-size: 13.5px;
                    cursor: pointer; color: #fff; background: linear-gradient(135deg, #0284c7, #4f46e5);
                    box-shadow: 0 8px 24px rgba(2,132,199,.45); transition: .2s;
                }
                #olgq-launch:hover { filter: brightness(1.12); transform: translateY(-1px); }
                #olgq-toast {
                    position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%) translateY(40px);
                    background: #10b981; color: #fff; padding: 9px 18px; border-radius: 30px; font-weight: 600;
                    font-size: 13.5px; box-shadow: 0 8px 25px rgba(0,0,0,.4); z-index: 2147483999;
                    opacity: 0; pointer-events: none; transition: all .25s ease;
                }
                #olgq-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
                .olgq-modal-backdrop {
                    position: fixed; inset: 0; background: rgba(0,0,0,.65); backdrop-filter: blur(4px);
                    display: none; align-items: center; justify-content: center; z-index: 2147483990;
                }
                .olgq-modal-box {
                    width: 650px; max-width: 90vw; height: 500px; max-height: 85vh; background: #0f172a;
                    border: 1px solid rgba(255,255,255,.2); border-radius: 12px; display: flex; flex-direction: column;
                    overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,.6); color: #f8fafc;
                }
                .olgq-modal-box.settings-box { height: auto; max-height: 90vh; width: 520px; }
                .olgq-modal-head {
                    display: flex; justify-content: space-between; align-items: center; padding: 12px 16px;
                    background: #1e293b; color: #38bdf8; font-weight: 700; border-bottom: 1px solid rgba(255,255,255,.1);
                }
                .olgq-modal-close { cursor: pointer; color: #94a3b8; font-size: 16px; }
                .olgq-modal-close:hover { color: #fff; }
                .olgq-modal-content { padding: 16px; overflow-y: auto; flex: 1; }
                .olgq-form-group { margin-bottom: 14px; }
                .olgq-form-group label { display: block; font-weight: 600; font-size: 12.5px; margin-bottom: 4px; color: #38bdf8; }
                .olgq-form-group input, .olgq-form-group select {
                    width: 100%; box-sizing: border-box; background: #0b1220; border: 1px solid rgba(255,255,255,.15);
                    color: #e2e8f0; border-radius: 6px; padding: 8px 10px; font-size: 12.5px;
                }
                .olgq-form-group input:focus, .olgq-form-group select:focus { outline: none; border-color: #38bdf8; }
                .olgq-form-group small { display: block; color: #94a3b8; font-size: 11px; margin-top: 4px; }
                .olgq-pass-wrapper { display: flex; position: relative; }
                .olgq-toggle-eye {
                    position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
                    background: none; border: none; cursor: pointer; color: #94a3b8; font-size: 14px;
                }
                .olgq-diag-summary {
                    background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08);
                    border-radius: 6px; padding: 10px; font-size: 11.5px; color: #cbd5e1; line-height: 1.6;
                }
                .olgq-modal-foot {
                    padding: 10px 16px; background: #1e293b; display: flex; justify-content: space-between; align-items: center;
                    border-top: 1px solid rgba(255,255,255,.1);
                }
                .olgq-modal-box textarea {
                    flex: 1; background: #0b1220; color: #e2e8f0; border: none; padding: 14px;
                    font-family: monospace; font-size: 12.5px; resize: none; outline: none; line-height: 1.5;
                }
            `;
            document.head.appendChild(style);

            const panel = document.createElement('div');
            panel.id = 'olgq-panel';
            panel.innerHTML = `
                <div class="olgq-head">
                    <div class="olgq-title-wrap">
                        <span class="olgq-status-dot" id="olgq-status-dot"></span>
                        <span class="olgq-title">OnLuyện AI · V4 Architecture</span>
                    </div>
                    <span>
                        <span class="olgq-icon" data-act="min" title="Thu gọn">–</span>
                        <span class="olgq-icon" data-act="hide" title="Ẩn panel">✕</span>
                    </span>
                </div>
                <div class="olgq-body">
                    <div class="olgq-ctx" id="olgq-ctx">Đang khởi động hệ thống...</div>
                    <div class="olgq-row">
                        <input type="text" id="olgq-id" placeholder="Nhập hoặc tự nhận diện assignId/logId">
                        <button class="olgq-btn primary" id="olgq-fetch">📥 Lấy câu hỏi</button>
                    </div>

                    <div class="olgq-opts-bar">
                        <label title="Tự động nhận diện khi chuyển sang câu hỏi mới"><input type="checkbox" id="olgq-auto-fetch"> ⚡ Tự nạp câu</label>
                        <label title="Tự động gọi AI giải ngay khi chuyển câu"><input type="checkbox" id="olgq-auto-solve"> 🧠 AI giải</label>
                        <label title="Tự động click chọn phương án đúng trên web"><input type="checkbox" id="olgq-auto-select"> 🎯 Tự click</label>
                        <label title="Tự động bấm nút Trả lời sau khi điền/chọn đáp án"><input type="checkbox" id="olgq-auto-submit"> 🚀 Tự Trả lời</label>
                    </div>

                    <div class="olgq-copy-bar" id="olgq-copy-bar" style="display:none">
                        <button class="olgq-btn emerald" id="olgq-solve-ai" title="Dùng AI giải trực tiếp câu hỏi hiện tại">✨ AI Giải Ngay</button>
                        <button class="olgq-btn purple" id="olgq-copy-prompt" title="Copy kèm prompt để dán cho AI giải">🤖 Copy Prompt</button>
                        <button class="olgq-btn emerald" id="olgq-copy-text" title="Copy toàn bộ câu hỏi dạng văn bản rõ ràng">📋 Copy Toàn Bộ</button>
                        <button class="olgq-btn amber" id="olgq-copy-json" title="Copy toàn bộ mảng dữ liệu JSON">📦 JSON</button>
                        <button class="olgq-btn gray" id="olgq-ai-config" title="Cài đặt API Endpoint, Key, Model & Chẩn đoán">⚙️ Cài đặt V4</button>
                        <button class="olgq-btn gray" id="olgq-preview" title="Mở cửa sổ xem trước">👁️ Xem</button>
                    </div>

                    <div class="olgq-status" id="olgq-status">Sẵn sàng.</div>

                    <div class="olgq-toolbar" id="olgq-toolbar" style="display:none">
                        <input type="text" id="olgq-search" placeholder="Tìm câu hỏi, từ khóa...">
                        <button class="olgq-btn gray" id="olgq-toggle-all">Mở tất cả</button>
                        <span class="olgq-count" id="olgq-count"></span>
                    </div>

                    <div id="olgq-list"></div>
                </div>
            `;
            document.body.appendChild(panel);

            // Phục hồi vị trí và trạng thái lưu
            const savedLeft = GM_getValue(Config.STORAGE_KEYS.PANEL_LEFT, '');
            const savedTop = GM_getValue(Config.STORAGE_KEYS.PANEL_TOP, '');
            if (savedLeft && savedTop) {
                panel.style.right = 'auto';
                panel.style.left = savedLeft;
                panel.style.top = savedTop;
            }

            if (StateStore.get('ui.collapsed')) {
                panel.classList.add('collapsed');
            }

            if (!StateStore.get('ui.visible')) {
                panel.style.display = 'none';
            }

            // Nút launch nổi
            const launch = document.createElement('button');
            launch.id = 'olgq-launch';
            launch.innerHTML = '📋 OnLuyện AI V4';
            document.body.appendChild(launch);

            // Header controls
            panel.querySelectorAll('.olgq-icon').forEach(icon => {
                icon.addEventListener('click', () => {
                    if (icon.dataset.act === 'min') {
                        panel.classList.toggle('collapsed');
                        const isCollapsed = panel.classList.contains('collapsed');
                        StateStore.set('ui.collapsed', isCollapsed);
                        GM_setValue(Config.STORAGE_KEYS.COLLAPSED, isCollapsed);
                    } else {
                        panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
                        const isVis = panel.style.display !== 'none';
                        StateStore.set('ui.visible', isVis);
                        GM_setValue(Config.STORAGE_KEYS.VISIBLE, isVis);
                    }
                });
            });

            launch.addEventListener('click', () => {
                panel.style.display = 'flex';
                panel.classList.remove('collapsed');
                StateStore.set('ui.visible', true);
                StateStore.set('ui.collapsed', false);
                GM_setValue(Config.STORAGE_KEYS.VISIBLE, true);
                GM_setValue(Config.STORAGE_KEYS.COLLAPSED, false);
            });

            makeDraggable(panel, panel.querySelector('.olgq-head'));
        }

        function makeDraggable(panel, handle) {
            let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;
            handle.addEventListener('mousedown', e => {
                if (e.target.classList.contains('olgq-icon') || e.target.tagName === 'BUTTON') return;
                const rect = panel.getBoundingClientRect();
                dragging = true;
                sx = e.clientX; sy = e.clientY;
                ox = rect.left; oy = rect.top;
                panel.style.right = 'auto';
                panel.style.top = rect.top + 'px';
                panel.style.left = rect.left + 'px';
                e.preventDefault();
            });
            window.addEventListener('mousemove', e => {
                if (!dragging) return;
                panel.style.left = Math.max(0, ox + e.clientX - sx) + 'px';
                panel.style.top = Math.max(0, oy + e.clientY - sy) + 'px';
            });
            window.addEventListener('mouseup', () => {
                if (dragging) {
                    dragging = false;
                    GM_setValue(Config.STORAGE_KEYS.PANEL_LEFT, panel.style.left);
                    GM_setValue(Config.STORAGE_KEYS.PANEL_TOP, panel.style.top);
                }
            });
        }

        function setDotStatus(status) {
            const dot = document.getElementById('olgq-status-dot');
            if (!dot) return;
            dot.className = 'olgq-status-dot ' + (status || '');
        }

        return {
            injectUI,
            setStatus,
            setDotStatus,
            updateContextBar,
            highlightActiveCard,
            renderQuestionsList,
            applyFilter,
            openSettingsModal,
            getCardForQuestion
        };
    })();

    /* ==========================================================================
       MODULE 20: CLIPBOARD & PREVIEW HELPER
       ========================================================================== */
    const ClipboardHelper = Object.freeze({
        copy(text, successMsg) {
            if (!text) return;
            if (typeof GM_setClipboard === 'function') {
                GM_setClipboard(text, 'text');
                ToastManager.show(successMsg || '✔ Đã copy vào Clipboard!');
                return;
            }

            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(() => {
                    ToastManager.show(successMsg || '✔ Đã copy vào Clipboard!');
                }).catch(() => this.fallbackCopy(text, successMsg));
            } else {
                this.fallbackCopy(text, successMsg);
            }
        },

        fallbackCopy(text, successMsg) {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            try {
                document.execCommand('copy');
                ToastManager.show(successMsg || '✔ Đã copy vào Clipboard!');
            } catch (e) {
                this.openPreviewModal(text);
            }
            document.body.removeChild(ta);
        },

        openPreviewModal(text) {
            let modal = document.getElementById('olgq-preview-modal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'olgq-preview-modal';
                modal.className = 'olgq-modal-backdrop';
                modal.innerHTML = `
                    <div class="olgq-modal-box">
                        <div class="olgq-modal-head">
                            <span>📋 Nội Dung Câu Hỏi Để Copy</span>
                            <span class="olgq-modal-close" id="olgq-preview-close">✕</span>
                        </div>
                        <textarea id="olgq-preview-ta" readonly></textarea>
                        <div class="olgq-modal-foot">
                            <span></span>
                            <button class="olgq-btn primary" id="olgq-preview-copy-btn">📋 Copy Ngay</button>
                        </div>
                    </div>
                `;
                document.body.appendChild(modal);

                document.getElementById('olgq-preview-close').addEventListener('click', () => {
                    modal.style.display = 'none';
                });
                document.getElementById('olgq-preview-copy-btn').addEventListener('click', () => {
                    const ta = document.getElementById('olgq-preview-ta');
                    ta.select();
                    document.execCommand('copy');
                    ToastManager.show('✔ Đã copy thành công!');
                });
            }
            document.getElementById('olgq-preview-ta').value = text;
            modal.style.display = 'flex';
        },

        formatAsPlainText(questions, examInfo) {
            const lines = [];
            lines.push('═══════════════════════════════════════════');
            lines.push(`📚 ĐỀ BÀI: ${(examInfo && examInfo.name) || 'BÀI TẬP ONLUYEN'}`);
            lines.push(`📊 Tổng số câu: ${questions.length} câu`);
            lines.push('═══════════════════════════════════════════\n');

            let lastPassage = null;
            let lastSection = null;

            questions.forEach((q, i) => {
                if (q.sectionTitle && q.sectionTitle !== lastSection) {
                    lines.push(`\n【 ${q.sectionTitle.toUpperCase()} 】\n`);
                    lastSection = q.sectionTitle;
                }

                if (q.passage && q.passage !== lastPassage) {
                    lines.push('-------------------------------------------');
                    lines.push('📖 ĐOẠN VĂN / BÀI ĐỌC LIÊN QUAN:');
                    lines.push(q.passage);
                    lines.push('-------------------------------------------\n');
                    lastPassage = q.passage;
                }

                const num = q.index || (i + 1);
                lines.push(`Câu ${num} [${q.typeLabel}]:`);
                lines.push(q.contentText);

                if (q.options && q.options.length) {
                    if (q.typeAnswer === 1) {
                        q.options.forEach(opt => {
                            const ansTag = opt.isAnswer ? ' (✔ ĐÚNG)' : '';
                            lines.push(`  ${opt.tfPrefix} ${opt.contentText}${ansTag}`);
                        });
                    } else {
                        q.options.forEach(opt => {
                            const ansTag = opt.isAnswer ? ' (✔ Đáp án)' : '';
                            lines.push(`  ${opt.letter}. ${opt.contentText}${ansTag}`);
                        });
                    }
                }

                if (q.explain) {
                    lines.push(`  💡 Lời giải: ${q.explain}`);
                }
                lines.push('');
            });

            return lines.join('\n');
        },

        formatAsAIPrompt(questions, examInfo) {
            const lines = [];
            lines.push('Bạn là chuyên gia giải đề thi. Hãy giải chi tiết và đưa ra bảng đáp án chuẩn xác nhất cho toàn bộ các câu hỏi dưới đây:');
            lines.push(`\nĐỀ THI: ${(examInfo && examInfo.name) || 'Bài kiểm tra'}\n`);
            lines.push('YÊU CẦU:');
            lines.push('1. Giải từng câu một, kèm lý giải ngắn gọn.');
            lines.push('2. Ở cuối bài, tổng hợp một BẢNG ĐÁP ÁN tóm tắt (Ví dụ: 1-A, 2-C, 3: a-Đúng b-Sai...).\n');
            lines.push('═══════════════════════════════════════════\n');

            let lastPassage = null;
            questions.forEach((q, i) => {
                if (q.passage && q.passage !== lastPassage) {
                    lines.push(`\n[ĐOẠN VĂN CHO CÁC CÂU TIẾP THEO]:\n${q.passage}\n`);
                    lastPassage = q.passage;
                }

                const num = q.index || (i + 1);
                lines.push(`Câu ${num} (${q.typeLabel}): ${q.contentText}`);
                if (q.options && q.options.length) {
                    if (q.typeAnswer === 1) {
                        q.options.forEach(opt => lines.push(`  ${opt.tfPrefix} ${opt.contentText}`));
                    } else {
                        q.options.forEach(opt => lines.push(`  ${opt.letter}. ${opt.contentText}`));
                    }
                }
                lines.push('');
            });

            return lines.join('\n');
        }
    });

    /* ==========================================================================
       MODULE 21: WORKFLOW CONTROLLER (FETCH & SOLVE ACTIONS)
       ========================================================================== */
    const WorkflowController = (function () {
        let aiSolvingTimer = null;

        function solveActiveQuestion(question, attemptCount = 1, isRetry = false) {
            if (!question) return;
            const qNum = question.numberQuestion || question.index || '';
            const qFp = question.fingerprint || QuestionFingerprint.create(question);
            const qKey = String(question.stepId || question.idQuestion || (qNum ? `q_${qNum}` : '') || qFp);

            // BẢO VỆ CHỐNG TRÙNG LẶP: Nếu AI đang giải chính câu này thì không restart request/timer
            if (!isRetry && StateStore.get('ai.isThinking')) {
                const curKey = StateStore.get('ai.thinkingQuestionKey');
                if (curKey && (curKey === qKey || (qNum && curKey === `q_${qNum}`))) {
                    Logger.debug('Workflow', `AI đang giải câu ${qNum}, giữ nguyên tiến trình.`);
                    return;
                }
            }

            const reqCtx = RequestManager.create(question);

            StateStore.update('ai', {
                isThinking: true,
                thinkingQuestionId: question.stepId,
                thinkingQuestionKey: qKey
            });
            UIManager.setDotStatus('thinking');

            if (aiSolvingTimer) {
                clearInterval(aiSolvingTimer);
                aiSolvingTimer = null;
            }

            const startTime = Date.now();
            const retryLabel = attemptCount > 1 ? ` (Thử lại lần ${attemptCount})` : '';

            const updateTimerDisplay = () => {
                const elapsedSec = Math.max(1, Math.floor((Date.now() - startTime) / 1000));
                UIManager.setStatus(`⏳ ChatGPT đang suy nghĩ câu ${qNum}${retryLabel}... (${elapsedSec}s${elapsedSec > 12 ? ' - Suy luận chuyên sâu' : ''})`);
                return elapsedSec;
            };

            // Hiển thị ngay lập tức
            updateTimerDisplay();

            // Cập nhật mượt mà theo thời gian thực (wall-clock timestamp)
            aiSolvingTimer = setInterval(() => {
                if (!StateStore.get('ai.isThinking')) {
                    clearInterval(aiSolvingTimer);
                    aiSolvingTimer = null;
                    return;
                }

                const elapsedSec = updateTimerDisplay();

                // WATCHDOG AN TOÀN: Nếu quá 32s mà không có phản hồi, ngắt timer và báo lỗi tránh treo vô hạn
                if (elapsedSec > 32) {
                    if (aiSolvingTimer) { clearInterval(aiSolvingTimer); aiSolvingTimer = null; }
                    StateStore.update('ai', { isThinking: false, thinkingQuestionId: null, thinkingQuestionKey: null });
                    UIManager.setDotStatus('error');
                    RequestManager.cancel();
                    UIManager.setStatus(`⚠ Quá thời gian phản hồi AI (${elapsedSec}s) câu ${qNum}. Vui lòng thử lại.`, true);
                }
            }, 500);

            try {
                AIClient.solve(question, reqCtx, isRetry)
                    .then(solution => {
                        if (aiSolvingTimer) { clearInterval(aiSolvingTimer); aiSolvingTimer = null; }
                        StateStore.update('ai', { isThinking: false, thinkingQuestionId: null, thinkingQuestionKey: null });
                        UIManager.setDotStatus('');

                        // BẢO VỆ CHỐNG STALE RESPONSE: Kiểm tra xem kết quả có còn thuộc câu hỏi hiện tại không
                        if (!RequestManager.isCurrent(reqCtx.requestId, reqCtx.fingerprint, reqCtx.generation)) {
                            Logger.warn('Workflow', `Bỏ qua đáp án câu ${qNum} vì câu hỏi trên màn hình đã thay đổi!`);
                            return;
                        }

                        // KIỂM TRA TÍNH HỢP LỆ CỦA KẾT QUẢ
                        const validation = ResultValidator.validate(question, solution);
                        if (!validation.isValid) {
                            Logger.warn('Workflow', `Kết quả câu ${qNum} không hợp lệ: ${validation.reason}`);

                            // Xóa cache kết quả lỗi để không dùng lại
                            AISolutionCache.delete(question.fingerprint, StateStore.get('ai.model'));
                            AISolutionCache.invalidate(question.fingerprint);

                            // TỰ ĐỘNG GIẢI LẠI NẾU CHƯA QUÁ 3 LẦN
                            if (attemptCount < 3) {
                                UIManager.setStatus(`🔄 ${validation.reason} → Đang tự động giải lại câu ${qNum} (lần ${attemptCount + 1})...`);
                                ToastManager.show(`🔄 Đang tự động giải lại câu ${qNum}...`);
                                setTimeout(() => {
                                    const curScreenQ = OnLuyenAdapter.Extractor.detectScreenQuestion();
                                    if (curScreenQ && (curScreenQ === question || curScreenQ.stepId === question.stepId || curScreenQ.index === question.index)) {
                                        solveActiveQuestion(question, attemptCount + 1, true);
                                    }
                                }, 500);
                                return;
                            } else {
                                UIManager.setStatus(`⚠ Không áp dụng đáp án sau ${attemptCount} lần thử: ${validation.reason}`, true);
                                AutomationController.updateAutomationStatus('ERROR', validation.reason);
                                return;
                            }
                        }

                        StateStore.set('ai.lastSolution', solution);

                        // Hiển thị tóm tắt lên status bar
                        if (solution.short_answer !== null && solution.short_answer !== undefined) {
                            UIManager.setStatus(`🎯 ChatGPT gợi ý điền số: [ ${solution.short_answer} ] — ${solution.explain || ''}`);
                            ToastManager.show(`🎯 Điền số: [ ${solution.short_answer} ]`);
                        } else if (solution.true_false) {
                            const parts = ['a', 'b', 'c', 'd'].map(k => `${k}) ${solution.true_false[k] === true ? 'ĐÚNG' : (solution.true_false[k] === false ? 'SAI' : '?')}`);
                            UIManager.setStatus(`🎯 ChatGPT gợi ý Đúng/Sai: [ ${parts.join(' | ')} ]\n💡 ${solution.explain || ''}`);
                            ToastManager.show(`🎯 Đúng/Sai: [ ${parts.join(' | ')} ]`);
                        } else {
                            const ans = solution.best_letter || (typeof solution.best_index === 'number' ? String.fromCharCode(65 + solution.best_index) : 'Đã giải');
                            UIManager.setStatus(`🎯 ChatGPT gợi ý đáp án: [ ${ans} ] — ${solution.explain || ''}`);
                            ToastManager.show(`🎯 Đáp án ChatGPT: [ ${ans} ]`);
                        }

                        // Kích hoạt automation áp dụng lên DOM
                        AutomationController.applySolution(solution, question);
                    })
                    .catch(err => {
                        if (aiSolvingTimer) { clearInterval(aiSolvingTimer); aiSolvingTimer = null; }
                        StateStore.update('ai', { isThinking: false, thinkingQuestionId: null, thinkingQuestionKey: null });
                        UIManager.setDotStatus('error');

                        if (!RequestManager.isCurrent(reqCtx.requestId, reqCtx.fingerprint, reqCtx.generation)) {
                            return; // Lỗi do request bị hủy không cần thông báo
                        }

                        // Tự động thử lại 1 lần nếu lỗi do mạng hoặc timeout
                        if (attemptCount < 2 && /Timeout|Lỗi kết nối|Network/i.test(err.message)) {
                            AISolutionCache.delete(question.fingerprint, StateStore.get('ai.model'));
                            UIManager.setStatus(`🔄 Lỗi mạng, đang tự động thử lại câu ${qNum}...`);
                            setTimeout(() => {
                                solveActiveQuestion(question, attemptCount + 1, false);
                            }, 800);
                            return;
                        }

                        UIManager.setStatus('✖ Lỗi ChatGPT: ' + err.message, true);
                    });
            } catch (syncErr) {
                if (aiSolvingTimer) { clearInterval(aiSolvingTimer); aiSolvingTimer = null; }
                StateStore.update('ai', { isThinking: false, thinkingQuestionId: null, thinkingQuestionKey: null });
                UIManager.setDotStatus('error');
                Logger.error('Workflow', 'Lỗi đồng bộ khi bắt đầu giải AI:', syncErr);
                UIManager.setStatus(`✖ Lỗi khởi tạo AI: ${syncErr.message}`, true);
            }
        }

        function fetchQuestions(forceId) {
            if (StateStore.get('exam.isFetching')) return;

            const input = document.getElementById('olgq-id');
            let rawId = forceId || (input ? input.value.trim() : '');
            if (!rawId) {
                const ctx = ContextDetector.detect();
                if (ctx && ctx.logId) {
                    rawId = ctx.logId;
                    if (input) input.value = rawId;
                }
            }

            if (!rawId) {
                const domQ = OnLuyenAdapter.Extractor.extractCurrent();
                if (domQ) {
                    StateStore.update('exam', { questions: [domQ] });
                    UIManager.renderQuestionsList();
                    UIManager.setStatus(`✔ Đã nhận diện Câu ${domQ.index} từ giao diện web!`);
                    if (StateStore.get('ai.autoSolve')) solveActiveQuestion(domQ);
                } else {
                    UIManager.setStatus('Chưa có ID bài tập. Hãy mở trang làm bài hoặc dán link/ID vào ô.', true);
                }
                return;
            }

            StateStore.set('exam.isFetching', true);
            const btn = document.getElementById('olgq-fetch');
            if (btn) btn.disabled = true;

            // Kiểm tra link tự luyện problemId/stepId
            const practiceMatch = rawId.match(/\/practices?\/step\/[^/?#]+\/([^/?#]+)\/([^/?#]+)/i) ||
                                  rawId.match(/^([a-f0-9]{24})\/([a-f0-9]{24})$/i);

            if (practiceMatch) {
                const problemId = practiceMatch[1];
                const stepId = practiceMatch[2];
                const currentKey = `${problemId}/${stepId}`;
                StateStore.set('exam.lastLoadedKey', currentKey);
                UIManager.setStatus(`Đang nạp câu hỏi tự luyện (${problemId.slice(0, 6)}...)...`);

                // Phản hồi tức thì nếu câu hỏi đã render trên màn hình
                const quickDomQ = OnLuyenAdapter.Extractor.extractCurrent();
                if (quickDomQ && (quickDomQ.contentText || (quickDomQ.options && quickDomQ.options.length > 0))) {
                    StateStore.update('exam', { questions: [quickDomQ] });
                    document.getElementById('olgq-copy-bar').style.display = 'flex';
                    document.getElementById('olgq-toolbar').style.display = 'flex';
                    UIManager.renderQuestionsList();
                    UIManager.setStatus(`✔ Đang hiển thị Câu ${quickDomQ.index} (đang đồng bộ chi tiết...)...`);
                    if (StateStore.get('ai.autoSolve')) solveActiveQuestion(quickDomQ);
                }

                AuthManager.ensureValidToken()
                    .then(() => QuestionRepository.getPracticeDetail(problemId, stepId))
                    .then(res => {
                        StateStore.set('exam.info', res.info);
                        StateStore.set('exam.questions', res.questions);
                        document.getElementById('olgq-copy-bar').style.display = 'flex';
                        document.getElementById('olgq-toolbar').style.display = 'flex';
                        UIManager.renderQuestionsList();
                        if (!StateStore.get('ai.isThinking')) {
                            UIManager.setStatus(`✔ Đã nạp câu hỏi mới (${stepId.slice(0, 8)})!`);
                        }
                        ToastManager.show('✔ Đã nạp câu mới!');

                        const activeQ = OnLuyenAdapter.Extractor.detectScreenQuestion() || res.questions[0];
                        if (activeQ) {
                            UIManager.highlightActiveCard(activeQ);
                            UIManager.updateContextBar(activeQ);
                            if (StateStore.get('ai.autoSolve')) solveActiveQuestion(activeQ);
                        }
                    })
                    .catch(err => {
                        Logger.warn('Workflow', 'Lỗi nạp API tự luyện, fallback DOM:', err);
                        const domQ = OnLuyenAdapter.Extractor.extractCurrent();
                        if (domQ) {
                            StateStore.update('exam', { questions: [domQ] });
                            document.getElementById('olgq-copy-bar').style.display = 'flex';
                            document.getElementById('olgq-toolbar').style.display = 'flex';
                            UIManager.renderQuestionsList();
                            UIManager.setStatus(`✔ Đã nhận diện Câu ${domQ.index} từ giao diện web!`);
                            if (StateStore.get('ai.autoSolve')) solveActiveQuestion(domQ);
                        } else {
                            UIManager.setStatus('✖ ' + err.message, true);
                        }
                    })
                    .finally(() => {
                        StateStore.set('exam.isFetching', false);
                        if (btn) btn.disabled = false;
                    });
                return;
            }

            // Bài tập trường / Đề thi
            const schoolMatch = rawId.match(/\/school\/test\/(?:step\/)?([a-f0-9]{24}|[^/?#]+)/i) ||
                                rawId.match(/\/doing\/[^/]+\/([a-f0-9]{24}|[^/?#]+)/i) ||
                                rawId.match(/\/history\/[^/]+\/([a-f0-9]{24}|[^/?#]+)/i);
            const logId = schoolMatch ? schoolMatch[1] : rawId;
            StateStore.set('exam.lastLoadedKey', logId);
            UIManager.setStatus(`Đang nạp đề ${logId.slice(0, 8)}...`);

            AuthManager.ensureValidToken()
                .then(() => QuestionRepository.getAllQuestions(logId))
                .then(res => {
                    StateStore.set('exam.info', res.info);
                    StateStore.set('exam.questions', res.questions);
                    document.getElementById('olgq-copy-bar').style.display = 'flex';
                    document.getElementById('olgq-toolbar').style.display = 'flex';
                    UIManager.renderQuestionsList();

                    const examTitle = res.info?.name ? ` [${res.info.name}]` : '';
                    UIManager.setStatus(`✔ Đã nạp thành công ${res.questions.length} câu hỏi${examTitle}!`);
                    ToastManager.show(`✔ Đã nạp ${res.questions.length} câu hỏi!`);

                    const activeQ = OnLuyenAdapter.Extractor.detectScreenQuestion() || res.questions[0];
                    if (activeQ) {
                        UIManager.highlightActiveCard(activeQ);
                        UIManager.updateContextBar(activeQ);
                        if (StateStore.get('ai.autoSolve')) solveActiveQuestion(activeQ);
                    }
                })
                .catch(err => {
                    UIManager.setStatus('✖ ' + err.message, true);
                    const domQ = OnLuyenAdapter.Extractor.extractCurrent();
                    if (domQ) {
                        StateStore.update('exam', { questions: [domQ] });
                        document.getElementById('olgq-copy-bar').style.display = 'flex';
                        document.getElementById('olgq-toolbar').style.display = 'flex';
                        UIManager.renderQuestionsList();
                        UIManager.setStatus(`✔ Đã nhận diện Câu ${domQ.index} trực tiếp từ giao diện web!`);
                        ToastManager.show(`✔ Đã nhận diện Câu ${domQ.index}!`);
                        if (StateStore.get('ai.autoSolve')) solveActiveQuestion(domQ);
                    }
                })
                .finally(() => {
                    StateStore.set('exam.isFetching', false);
                    if (btn) btn.disabled = false;
                });
        }

        return {
            solveActiveQuestion,
            fetchQuestions
        };
    })();

    /* ==========================================================================
       MODULE 22: WATCHERS (QUESTION & ROUTE OBSERVERS)
       ========================================================================== */
    const QuestionWatcher = (function () {
        let lastSignature = null;
        let scheduleTimer = null;
        let observerInstance = null;

        function checkChange() {
            const questions = StateStore.get('exam.questions');
            if (!questions || questions.length === 0) {
                const ctx = ContextDetector.detect();
                if (ctx && ctx.logId && ctx.logId !== StateStore.get('exam.lastLoadedKey')) {
                    WorkflowController.fetchQuestions();
                }
                return;
            }

            const activeQ = OnLuyenAdapter.Extractor.detectScreenQuestion();
            if (!activeQ) return;

            const qNum = activeQ.numberQuestion || activeQ.index || '';
            const signature = [
                qNum ? `q_${qNum}` : (activeQ.stepId || ''),
                (activeQ.contentText || '').slice(0, 50).trim()
            ].filter(Boolean).join('_');

            if (signature && signature !== lastSignature) {
                lastSignature = signature;
                StateStore.update('diagnostics', { questionChanges: StateStore.get('diagnostics.questionChanges') + 1 });
                StateStore.set('question.current', activeQ);

                UIManager.updateContextBar(activeQ);
                UIManager.highlightActiveCard(activeQ);

                const qTitle = activeQ.index ? `Câu ${activeQ.index}` : (activeQ.numberQuestion ? `#${activeQ.numberQuestion}` : 'Câu mới');
                if (StateStore.get('ai.autoSolve')) {
                    ToastManager.show(`⚡ Chuyển sang ${qTitle} → AI đang giải...`);
                    WorkflowController.solveActiveQuestion(activeQ);
                }
            }

            // Nếu đang ở bài tự luyện và nút Tiếp tục xuất hiện
            if (StateStore.get('automation.autoSubmit') && location.pathname.includes('/practices/')) {
                const nextBtn = OnLuyenAdapter.Submit.findPracticeNextButton();
                if (nextBtn && !nextBtn.disabled && !nextBtn.classList.contains('disabled')) {
                    AutomationController.triggerPracticeNextWatcher();
                }
            }
        }

        function scheduleCheck(delay = 180) {
            if (scheduleTimer) return;
            scheduleTimer = setTimeout(() => {
                scheduleTimer = null;
                checkChange();
            }, delay);
        }

        function install() {
            // Polling dự phòng nhẹ 750ms
            setInterval(checkChange, 750);

            // Bắt sự kiện click vào các nút chuyển câu trên sidebar / pagination
            document.addEventListener('click', e => {
                const hit = e.target.closest('app-sidebar-school-test, .option, .number, button, .nav-btn, .question-header');
                if (hit && !hit.closest('#olgq-panel')) {
                    scheduleCheck(100);
                    scheduleCheck(350);
                }
            }, { passive: true });

            // Scoped MutationObserver giới hạn vào khung câu hỏi, loại trừ panel userscript
            try {
                let debounceTimer = null;
                observerInstance = new MutationObserver(mutations => {
                    const isInternal = mutations.some(m => m.target && m.target.closest && m.target.closest('#olgq-panel'));
                    if (isInternal) return;

                    if (debounceTimer) return;
                    debounceTimer = setTimeout(() => {
                        debounceTimer = null;
                        checkChange();
                    }, 350);
                });

                const target = document.querySelector('.question-container, app-test-school-step-data-regular, .sub-container') || document.body;
                if (target) {
                    observerInstance.observe(target, { childList: true, subtree: false });
                }
            } catch (e) {
                Logger.warn('QuestionWatcher', 'Lỗi MutationObserver, sử dụng polling thay thế', e);
            }
        }

        return {
            install,
            checkChange,
            scheduleCheck
        };
    })();

    const RouteWatcher = (function () {
        function handleRouteChange() {
            if (!StateStore.get('automation.autoFetch')) return;
            const ctx = ContextDetector.detect();
            if (!ctx || !ctx.logId) return;

            if (ctx.logId !== StateStore.get('exam.lastLoadedKey')) {
                Logger.info('RouteWatcher', `Phát hiện URL route mới: ${ctx.logId}`);
                const input = document.getElementById('olgq-id');
                const ctxBox = document.getElementById('olgq-ctx');
                if (input) input.value = ctx.logId;
                if (ctxBox) ctxBox.innerHTML = `⚡ Phát hiện đề mới: <b>${Utils.escapeHtml(ctx.logId)}</b> (${Utils.escapeHtml(ctx.source)})`;

                WorkflowController.fetchQuestions();
            }
        }

        function install() {
            if (window.__ONLUYEN_V4_ROUTE_PATCHED__) return;
            window.__ONLUYEN_V4_ROUTE_PATCHED__ = true;

            const rawPush = history.pushState;
            history.pushState = function () {
                rawPush.apply(this, arguments);
                setTimeout(handleRouteChange, 250);
            };

            const rawReplace = history.replaceState;
            history.replaceState = function () {
                rawReplace.apply(this, arguments);
                setTimeout(handleRouteChange, 250);
            };

            window.addEventListener('popstate', () => {
                setTimeout(handleRouteChange, 250);
            });

            setInterval(handleRouteChange, 1200);
        }

        return {
            install,
            handleRouteChange
        };
    })();

    /* ==========================================================================
       MODULE 23: BOOTSTRAP & EVENT BINDINGS
       ========================================================================== */
    function initializeApp() {
        if (StateStore.get('app.initialized')) return;
        StateStore.set('app.initialized', true);

        Logger.info('Bootstrap', `Khởi động OnLuyen Automation V${Config.VERSION}`);
        UIManager.injectUI();

        // 1. Ràng buộc các checkbox tùy chọn
        const bindCheckbox = (id, statePath, storageKey, label) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.checked = StateStore.get(statePath);
            el.addEventListener('change', e => {
                const val = e.target.checked;
                StateStore.set(statePath, val);
                GM_setValue(storageKey, val);
                ToastManager.show(`Đã lưu: ${label} [${val ? 'BẬT' : 'TẮT'}]`);
            });
        };

        bindCheckbox('olgq-auto-fetch', 'automation.autoFetch', Config.STORAGE_KEYS.AUTO_FETCH, 'Tự nạp câu');
        bindCheckbox('olgq-auto-solve', 'ai.autoSolve', Config.STORAGE_KEYS.AUTO_SOLVE, 'Tự động AI giải');
        bindCheckbox('olgq-auto-select', 'automation.autoSelect', Config.STORAGE_KEYS.AUTO_SELECT, 'Tự click');
        bindCheckbox('olgq-auto-submit', 'automation.autoSubmit', Config.STORAGE_KEYS.AUTO_SUBMIT, 'Tự nộp bài');

        // 2. Nhận diện context bài thi ban đầu
        const ctx = ContextDetector.detect();
        const input = document.getElementById('olgq-id');
        const ctxBox = document.getElementById('olgq-ctx');

        if (ctx && ctx.logId) {
            if (input) input.value = ctx.logId;
            if (ctxBox) ctxBox.innerHTML = `✔ Tự nhận diện bài: <b>${Utils.escapeHtml(ctx.logId)}</b> (${Utils.escapeHtml(ctx.source)})`;
            UIManager.setStatus('Đã phát hiện bài thi! Đang tự động nạp câu hỏi...');
            WorkflowController.fetchQuestions();
        } else {
            if (ctxBox) ctxBox.textContent = 'Chưa nhận diện được ID bài. Hãy dán link hoặc assignClassLogId vào ô bên dưới.';
        }

        // 3. Ràng buộc các nút hành động chính
        document.getElementById('olgq-fetch').addEventListener('click', () => WorkflowController.fetchQuestions());

        document.getElementById('olgq-solve-ai').addEventListener('click', () => {
            const curQ = OnLuyenAdapter.Extractor.detectScreenQuestion() || StateStore.get('exam.questions')[0];
            if (!curQ) return alert('Không tìm thấy câu hỏi để giải!');
            WorkflowController.solveActiveQuestion(curQ);
        });

        document.getElementById('olgq-ai-config').addEventListener('click', () => {
            UIManager.openSettingsModal();
        });

        // 4. Ràng buộc các nút sao chép
        document.getElementById('olgq-copy-text').addEventListener('click', () => {
            const questions = StateStore.get('exam.questions');
            if (!questions.length) return alert('Chưa có câu hỏi nào để copy!');
            const text = ClipboardHelper.formatAsPlainText(questions, StateStore.get('exam.info'));
            ClipboardHelper.copy(text, `✔ Đã copy toàn bộ ${questions.length} câu hỏi!`);
        });

        document.getElementById('olgq-copy-prompt').addEventListener('click', () => {
            const curQ = OnLuyenAdapter.Extractor.detectScreenQuestion();
            if (curQ) {
                const text = ClipboardHelper.formatAsAIPrompt([curQ], StateStore.get('exam.info'));
                ClipboardHelper.copy(text, `✔ Đã copy prompt Câu ${curQ.index || curQ.numberQuestion || 1}!`);
            } else {
                const questions = StateStore.get('exam.questions');
                if (questions.length) {
                    const text = ClipboardHelper.formatAsAIPrompt(questions, StateStore.get('exam.info'));
                    ClipboardHelper.copy(text, '✔ Đã copy prompt giải AI kèm toàn bộ đề!');
                } else {
                    alert('Chưa có câu hỏi nào để copy!');
                }
            }
        });

        document.getElementById('olgq-copy-json').addEventListener('click', () => {
            const questions = StateStore.get('exam.questions');
            if (!questions.length) return alert('Chưa có câu hỏi nào để copy!');
            ClipboardHelper.copy(JSON.stringify(questions, null, 2), '✔ Đã copy toàn bộ mảng JSON câu hỏi!');
        });

        document.getElementById('olgq-preview').addEventListener('click', () => {
            const questions = StateStore.get('exam.questions');
            if (!questions.length) return alert('Chưa có câu hỏi nào!');
            const text = ClipboardHelper.formatAsPlainText(questions, StateStore.get('exam.info'));
            ClipboardHelper.openPreviewModal(text);
        });

        document.getElementById('olgq-search').addEventListener('input', UIManager.applyFilter);

        document.getElementById('olgq-toggle-all').addEventListener('click', e => {
            const isColl = !StateStore.get('ui.collapsed');
            StateStore.set('ui.collapsed', isColl);
            e.target.textContent = isColl ? 'Mở tất cả' : 'Thu gọn tất cả';
            document.querySelectorAll('#olgq-list .olgq-card').forEach(card => {
                card.classList.toggle('open', !isColl);
            });
        });

        // 5. Khởi động watchers
        RouteWatcher.install();
        QuestionWatcher.install();
    }

    if (location.hostname.includes('onluyen.vn')) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initializeApp);
        } else {
            initializeApp();
        }
    }
})();
