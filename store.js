/*
 * 양심감사위원회 데이터 저장소
 *  - Firebase(Firestore + Auth)가 설정되어 있으면 서버에 저장 (mode = 'firebase')
 *  - 설정이 없거나 SDK를 불러오지 못하면 이 브라우저(localStorage)에만 저장 (mode = 'local')
 * app.js 는 이 파일의 window.GACStore 만 사용합니다.
 */
(function () {
  'use strict';

  var CFG = window.GAC_FIREBASE || {};
  var C = CFG.config || {};
  var fbOk = !!(window.firebase && C.apiKey && C.projectId && !/^YOUR_/i.test(C.apiKey));
  var db = null, auth = null;
  if (fbOk) {
    try {
      firebase.initializeApp(C);
      db = firebase.firestore();
      auth = firebase.auth();
    } catch (e) {
      fbOk = false;
    }
  }
  var mode = fbOk ? 'firebase' : 'local';

  /* ---------- 공통 ---------- */
  var state = { notices: [], apps: [], reports: [] };
  var admin = false;
  var loaded = false;
  var subs = [], authSubs = [], errSubs = [];

  function pad4(n) { return String(n).padStart(4, '0'); }
  function today() {
    var d = new Date();
    return d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0');
  }
  function copy(o) { return Object.assign({}, o); }

  function emit() {
    var snap = { notices: state.notices.slice(), apps: state.apps.slice(), reports: state.reports.slice() };
    subs.forEach(function (f) { f(snap); });
  }
  var lastErrMsg = '', lastErrAt = 0;
  function fail(msg) {
    var now = Date.now();
    if (msg === lastErrMsg && now - lastErrAt < 10000) return; // 같은 오류 반복 알림 방지
    lastErrMsg = msg; lastErrAt = now;
    errSubs.forEach(function (f) { f(msg); });
  }

  var DEFAULT_NOTICES = [
    {
      id: 'default-3', ts: 3, imp: true, date: today(),
      title: '양심감사위원회 출범 안내',
      body: '국민의 양심을 투명하게 감사하기 위해 양심감사위원회가 출범하였음을 알립니다.\n\n감사 신청과 불량 신고는 상시 접수합니다.'
    },
    {
      id: 'default-2', ts: 2, imp: false, date: today(),
      title: '양심 감사 신청 절차 안내',
      body: '1. [감사 신청] 메뉴에서 신청서 제출 (상태: 검토중)\n2. 관리자의 검토·허가\n3. [접수 내역]에서 심의 개시\n4. 감사 결과 통지서 발급 및 출력'
    },
    {
      id: 'default-1', ts: 1, imp: false, date: today(),
      title: '거짓 신청에 대한 유의사항',
      body: '양심 상태 자가진단은 솔직하게 작성해 주시기 바랍니다. 허위 기재 시 판정에 불리하게 작용할 수 있습니다.'
    }
  ];

  var saveWarned = false;
  function lsLoad(k, d) {
    try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; }
  }
  function lsSave(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) {
      if (!saveWarned) {
        saveWarned = true;
        fail('이 브라우저에서는 데이터를 저장할 수 없습니다. (시크릿 모드이거나 저장 공간이 가득 찼을 수 있습니다.) 페이지를 닫으면 내용이 사라집니다.');
      }
      return false;
    }
  }
  function norm(x) {
    x.id = String(x.id);
    if (!x.ts) x.ts = Number(x.id) || 0;
    return x;
  }
  function byTs(a, b) { return (a.ts || 0) - (b.ts || 0); }

  /* ====================================================
   *  로컬 모드 (localStorage)
   * ==================================================== */
  var KEY = { notices: 'gac_notices', apps: 'gac_apps', reports: 'gac_reports' };
  var seq = 0;

  // 관리자 비밀번호 해시 (로컬 모드 전용, SHA-256)
  var ADMIN_HASH = '4a65d874a5cbe25286e5d5d6db3ce24fc06c9d99eef619718fe839941cecc39c';
  var MAX_TRY = 5, LOCK_MS = 5 * 60 * 1000;
  var attempts = 0, lockUntil = 0;

  function sha256(str) {
    if (!window.crypto || !crypto.subtle) return Promise.reject(new Error('no-subtle'));
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function (buf) {
      return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    });
  }
  function lockText(r) {
    return '로그인 시도 횟수 초과로 잠금되었습니다. ' + Math.floor(r / 60) + '분 ' + (r % 60) + '초 후 다시 시도해 주세요.';
  }
  function lockRemain() {
    var r = Math.ceil((lockUntil - Date.now()) / 1000);
    return r > 0 ? r : 0;
  }
  function persist(col) { lsSave(KEY[col], state[col]); }

  var Local = {
    init: function () {
      var n = lsLoad(KEY.notices, null);
      if (!n) {
        n = DEFAULT_NOTICES.map(copy);
        lsSave(KEY.notices, n);
      }
      state.notices = n.map(norm);
      state.apps = lsLoad(KEY.apps, []).map(norm);
      state.reports = lsLoad(KEY.reports, []).map(norm);
      seq = parseInt(lsLoad('gac_app_seq', state.apps.length), 10) || 0;
      if (seq < state.apps.length) { seq = state.apps.length; lsSave('gac_app_seq', seq); }
      attempts = parseInt(lsLoad('gac_admin_attempts', 0), 10) || 0;
      lockUntil = parseInt(lsLoad('gac_admin_lock_until', 0), 10) || 0;
      loaded = true;
    },
    add: function (col, data) {
      var it = copy(data);
      it.id = String(Date.now()) + String(Math.floor(Math.random() * 1000));
      it.ts = Date.now();
      state[col].push(it);
      persist(col); emit();
      return Promise.resolve(it.id);
    },
    patch: function (col, id, p) {
      var it = state[col].filter(function (x) { return x.id === String(id); })[0];
      if (!it) return Promise.reject(new Error('대상을 찾을 수 없습니다.'));
      Object.assign(it, p);
      persist(col); emit();
      return Promise.resolve();
    },
    bump: function (col, id, field, delta) {
      var it = state[col].filter(function (x) { return x.id === String(id); })[0];
      if (!it) return Promise.reject(new Error('대상을 찾을 수 없습니다.'));
      it[field] = Math.max(0, (it[field] || 0) + delta);
      persist(col); emit();
      return Promise.resolve();
    },
    remove: function (col, id) {
      state[col] = state[col].filter(function (x) { return x.id !== String(id); });
      persist(col); emit();
      return Promise.resolve();
    },
    createApp: function (data) {
      seq++;
      lsSave('gac_app_seq', seq);
      var no = '양감 제' + new Date().getFullYear() + '-' + pad4(seq) + '호';
      var d = copy(data); d.no = no;
      return Local.add('apps', d).then(function (id) { return { id: id, no: no }; });
    },
    login: function (email, pw) {
      var r = lockRemain();
      if (r) return Promise.reject(new Error(lockText(r)));
      return sha256(pw).then(function (hash) {
        if (hash === ADMIN_HASH) {
          attempts = 0; lsSave('gac_admin_attempts', 0); lsSave('gac_admin_lock_until', 0);
          admin = true;
          authSubs.forEach(function (f) { f(true); });
          return;
        }
        attempts++;
        if (attempts >= MAX_TRY) {
          lockUntil = Date.now() + LOCK_MS;
          attempts = 0;
          lsSave('gac_admin_lock_until', lockUntil);
          lsSave('gac_admin_attempts', 0);
          throw new Error('5회 연속 실패로 5분간 잠금됩니다.');
        }
        lsSave('gac_admin_attempts', attempts);
        throw new Error('비밀번호가 틀렸습니다. (' + attempts + '/' + MAX_TRY + '회)');
      }, function () {
        throw new Error('이 환경에서는 비밀번호 확인을 사용할 수 없습니다. (https 또는 localhost 필요)');
      });
    },
    logout: function () {
      admin = false;
      authSubs.forEach(function (f) { f(false); });
      return Promise.resolve();
    },
    lockMessage: function () { var r = lockRemain(); return r ? lockText(r) : ''; },
    isMine: function () { return true; },
    exportData: function () {
      return { notices: state.notices, apps: state.apps, reports: state.reports, appSeq: seq };
    },
    importData: function (d) {
      state.notices = d.notices.map(norm);
      state.apps = d.apps.map(norm);
      state.reports = d.reports.map(norm);
      seq = Math.max(parseInt(d.appSeq, 10) || 0, state.apps.length);
      persist('notices'); persist('apps'); persist('reports');
      lsSave('gac_app_seq', seq);
      emit();
      return Promise.resolve();
    },
    resetData: function () {
      state.apps = []; state.reports = []; seq = 0;
      try {
        localStorage.removeItem('gac_apps');
        localStorage.removeItem('gac_app_seq');
        localStorage.removeItem('gac_reports');
      } catch (e) {}
      emit();
      return Promise.resolve();
    }
  };

  /* ====================================================
   *  Firebase 모드 (Firestore + Auth)
   * ==================================================== */
  var COL = { notices: 'notices', apps: 'applications', reports: 'reports' };
  var bucket = {};          // 구독 이름 → { 문서id: 문서 }
  var unsubs = [];
  var initLeft = 0;         // 첫 데이터 수신을 기다리는 구독 수
  var noticeReady = false;
  var myIds = { apps: [], reports: [] };

  function toErr(e) {
    var code = (e && e.code) || '';
    var msg;
    if (code === 'permission-denied') msg = '권한이 없습니다. Firestore 보안 규칙이 올바르게 게시되었는지 확인해 주세요.';
    else if (code === 'unavailable' || code === 'auth/network-request-failed') msg = '서버에 연결할 수 없습니다. 네트워크를 확인해 주세요.';
    else if (code === 'resource-exhausted') msg = '서버 사용량 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.';
    else msg = (e && e.message) || '요청을 처리하지 못했습니다.';
    return new Error(msg);
  }
  function wrap(p) {
    return Promise.resolve(p).then(null, function (e) { throw toErr(e); });
  }
  function authMsg(e) {
    var c = (e && e.code) || '';
    if (c === 'auth/invalid-email') return '이메일 형식이 올바르지 않습니다.';
    if (c === 'auth/invalid-credential' || c === 'auth/wrong-password' || c === 'auth/user-not-found') return '이메일 또는 비밀번호가 올바르지 않습니다.';
    if (c === 'auth/too-many-requests') return '시도 횟수가 많아 일시적으로 차단되었습니다. 잠시 후 다시 시도해 주세요.';
    if (c === 'auth/network-request-failed') return '서버에 연결할 수 없습니다. 네트워크를 확인해 주세요.';
    if (c === 'auth/operation-not-allowed') return 'Firebase 콘솔에서 이메일/비밀번호 로그인을 켜 주세요.';
    return '로그인에 실패했습니다.' + (c ? ' (' + c + ')' : '');
  }

  function loadMine() {
    myIds.apps = lsLoad('gac_my_apps', []).map(String).slice(-30);
    myIds.reports = lsLoad('gac_my_reports', []).map(String).slice(-30);
  }
  function saveMine() {
    lsSave('gac_my_apps', myIds.apps);
    lsSave('gac_my_reports', myIds.reports);
  }

  function rebuild() {
    var out = { notices: {}, apps: {}, reports: {} };
    Object.keys(bucket).forEach(function (name) {
      var col = name.charAt(0) === 'n' ? 'notices' : name.charAt(0) === 'a' ? 'apps' : 'reports';
      var m = bucket[name];
      Object.keys(m).forEach(function (id) { out[col][id] = m[id]; });
    });
    function arr(m) { return Object.keys(m).map(function (k) { return m[k]; }).sort(byTs); }
    var n = arr(out.notices);
    if (!n.length && noticeReady) n = DEFAULT_NOTICES.map(function (x) { var c = copy(x); c.builtin = true; return c; });
    state.notices = n;
    state.apps = arr(out.apps);
    state.reports = arr(out.reports);
    emit();
  }

  function dropMine(col, id) {
    myIds[col] = myIds[col].filter(function (x) { return x !== id; });
    saveMine();
  }

  function listen(name, ref, opts) {
    opts = opts || {};
    var first = true;
    function firstDone() {
      if (!first) return;
      first = false;
      if (opts.counted) {
        initLeft--;
        if (opts.notice) noticeReady = true;
        if (initLeft <= 0) loaded = true;
      }
    }
    var un = ref.onSnapshot(function (snap) {
      var m = {};
      if (opts.doc) {
        if (snap.exists) { var x = snap.data(); x.id = snap.id; m[snap.id] = x; }
        else dropMine(opts.col, opts.id);
      } else {
        snap.forEach(function (d) { var x = d.data(); x.id = d.id; m[d.id] = x; });
      }
      bucket[name] = m;
      firstDone();
      rebuild();
    }, function (e) {
      if (!opts.doc) fail(toErr(e).message);
      firstDone();
      rebuild();
    });
    unsubs.push(un);
  }

  function watchMine(col, id) {
    var name = (col === 'apps' ? 'a:own:' : 'r:own:') + id;
    listen(name, db.collection(COL[col]).doc(id), { doc: true, col: col, id: id });
  }
  function remember(col, id) {
    id = String(id);
    if (myIds[col].indexOf(id) === -1) {
      myIds[col].push(id);
      saveMine();
      watchMine(col, id);
    }
  }

  function stopFb() {
    unsubs.forEach(function (u) { try { u(); } catch (e) {} });
    unsubs = [];
    bucket = {};
  }
  function startFb() {
    stopFb();
    loaded = false;
    noticeReady = false;
    initLeft = 0;
    function counted(n) { initLeft += n; }
    counted(1);
    listen('n:all', db.collection(COL.notices), { counted: true, notice: true });
    if (admin) {
      counted(2);
      listen('a:all', db.collection(COL.apps), { counted: true });
      listen('r:all', db.collection(COL.reports), { counted: true });
    } else {
      counted(3);
      listen('a:1', db.collection(COL.apps).where('status', '==', '접수'), { counted: true });
      listen('a:2', db.collection(COL.apps).where('status', '==', '완료'), { counted: true });
      listen('r:1', db.collection(COL.reports).where('status', '==', '게시'), { counted: true });
    }
    myIds.apps.forEach(function (id) { watchMine('apps', id); });
    myIds.reports.forEach(function (id) { watchMine('reports', id); });
    rebuild();
  }

  var Fb = {
    init: function () {
      loadMine();
      startFb();
      auth.onAuthStateChanged(function (u) {
        var isAdmin = !!(u && CFG.adminUid && !/^YOUR_/i.test(CFG.adminUid) && u.uid === CFG.adminUid);
        if (isAdmin !== admin) {
          admin = isAdmin;
          startFb();
          authSubs.forEach(function (f) { f(admin); });
        }
      });
    },
    add: function (col, data) {
      var d = copy(data); d.ts = Date.now();
      return wrap(db.collection(COL[col]).add(d)).then(function (ref) {
        if (col !== 'notices') remember(col, ref.id);
        return ref.id;
      });
    },
    patch: function (col, id, p) { return wrap(db.collection(COL[col]).doc(String(id)).update(p)); },
    bump: function (col, id, field, delta) {
      var p = {}; p[field] = firebase.firestore.FieldValue.increment(delta);
      return wrap(db.collection(COL[col]).doc(String(id)).update(p));
    },
    remove: function (col, id) { return wrap(db.collection(COL[col]).doc(String(id)).delete()); },
    createApp: function (data) {
      var year = new Date().getFullYear();
      var cref = db.collection('counters').doc(String(year));
      var aref = db.collection(COL.apps).doc();
      var d = copy(data); d.ts = Date.now();
      return wrap(db.runTransaction(function (tx) {
        return tx.get(cref).then(function (s) {
          var n = (s.exists ? s.data().seq : 0) + 1;
          d.no = '양감 제' + year + '-' + pad4(n) + '호';
          tx.set(cref, { seq: n });
          tx.set(aref, d);
          return { id: aref.id, no: d.no };
        });
      })).then(function (r) { remember('apps', r.id); return r; });
    },
    login: function (email, pw) {
      return Promise.resolve(auth.signInWithEmailAndPassword(email, pw)).then(function (cred) {
        if (!CFG.adminUid || /^YOUR_/i.test(CFG.adminUid)) {
          return auth.signOut().then(function () { throw new Error('firebase-config.js 의 adminUid 가 설정되지 않았습니다.'); });
        }
        if (cred.user.uid !== CFG.adminUid) {
          return auth.signOut().then(function () { throw new Error('관리자 계정이 아닙니다.'); });
        }
      }, function (e) { throw new Error(authMsg(e)); });
    },
    logout: function () { return wrap(auth.signOut()); },
    lockMessage: function () { return ''; },
    isMine: function (col, id) { return myIds[col].indexOf(String(id)) !== -1; },
    exportData: function () {
      return {
        notices: state.notices.filter(function (n) { return !n.builtin; }),
        apps: state.apps, reports: state.reports
      };
    },
    importData: function () { return Promise.reject(new Error('서버 모드에서는 복원을 지원하지 않습니다.')); },
    resetData: function () { return Promise.reject(new Error('서버 모드에서는 초기화를 지원하지 않습니다.')); }
  };

  var impl = fbOk ? Fb : Local;
  impl.init();

  window.GACStore = {
    mode: mode,
    loaded: function () { return loaded; },
    isAdmin: function () { return admin; },
    subscribe: function (cb) { subs.push(cb); cb({ notices: state.notices.slice(), apps: state.apps.slice(), reports: state.reports.slice() }); },
    onAuth: function (cb) { authSubs.push(cb); },
    onError: function (cb) { errSubs.push(cb); },
    add: impl.add, patch: impl.patch, bump: impl.bump, remove: impl.remove,
    createApp: impl.createApp,
    login: impl.login, logout: impl.logout, lockMessage: impl.lockMessage,
    isMine: impl.isMine,
    exportData: impl.exportData, importData: impl.importData, resetData: impl.resetData
  };
})();
