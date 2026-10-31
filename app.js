(function() {
  'use strict';

  var VERSION = '2.0.0';
  var $ = function(id) { return document.getElementById(id); };
  if ($('ver')) $('ver').textContent = 'v' + VERSION;

  var store = window.GACStore;
  var FB = store.mode === 'firebase';

  function load(k, d) {
    try {
      var v = localStorage.getItem(k);
      return v ? JSON.parse(v) : d;
    } catch(e) {
      return d;
    }
  }
  function save(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch(e) {}
  }

  function esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function today() {
    var d = new Date();
    return d.getFullYear() + '.' +
      String(d.getMonth() + 1).padStart(2, '0') + '.' +
      String(d.getDate()).padStart(2, '0');
  }

  var VERDICT = {
    ok: '양심 적합',
    fix: '보완 요구',
    no: '양심 부적합'
  };

  var COMMENT = {
    ok: [
      '양심에 한 점 그늘이 없음을 확인하였으므로 적합으로 판정함.',
      '경미한 흔적은 있으나 사회 통념상 허용되는 범위로 인정함.',
      '본 위원회는 귀하의 떳떳함을 공식 인정함.'
    ],
    fix: [
      '양심에 다소 먼지가 쌓인 것으로 보여 자체 정화 후 재신청을 권고함.',
      '핑계의 비중이 과다하므로 일주일간 솔직하게 지낼 것을 권고함.',
      '일부 항목에서 찔림 반응이 감지되어 보완을 요구함.'
    ],
    no: [
      '양심이 장기간 미사용 상태로 확인되어 즉시 점검을 명함.',
      '변명의 정도가 기준치를 현저히 초과하여 부적합으로 판정함.',
      '양심 반응이 감지되지 않았으므로 부적합 판정하며 심기일전을 요구함.'
    ]
  };

  var WEIGHT = {
    clear: [70, 25, 5],
    cloud: [30, 50, 20],
    fog: [15, 45, 40],
    none: [5, 30, 65]
  };

  var MOOD = {
    clear: '맑음',
    cloud: '흐림',
    fog: '안개',
    none: '측정 불가'
  };

  /* 화면 상태 (데이터는 store 가 구독으로 전달) */
  var notices = [];
  var apps = [];
  var reports = [];
  var agreedIds = load('gac_agreed_ids', []).map(String); // 공감한 신고 (이 브라우저 기준)
  var admin = false;
  var openIds = {}; // 펼쳐 둔 공고·신고 (다시 그려도 유지)
  var adminToasted = false;

  /* 검토(허가) 상태 — 감사 신청: 검토중 → 접수(허가) → 완료 / 반려, 신고: 검토중 → 게시(허가) / 반려 */
  var ST_PEND = '검토중';
  var ST_REJ = '반려';
  function rStatus(r) { return r.status || '게시'; } // 상태 없는 기존 신고는 게시 상태로 간주
  function canDelete() { return !FB || admin; }
  function findBy(list, id) {
    return list.filter(function(x) { return String(x.id) === String(id); })[0];
  }

  /* 알림(토스트) · 입력 검증 · 접기/펼치기 공통 */
  var toastTimer;
  function toast(msg, kind, ms) {
    var t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'toast show' + (kind === 'err' ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function() { t.classList.remove('show'); }, ms || 3000);
  }
  function fail(err) {
    toast((err && err.message) || '요청을 처리하지 못했습니다.', 'err', 5000);
  }
  store.onError(function(msg) { toast(msg, 'err', 6000); });

  function need(ids) {
    var first = null;
    ids.forEach(function(id) {
      var el = $(id);
      var bad = !el.value.trim();
      el.setAttribute('aria-invalid', bad ? 'true' : 'false');
      if (bad && !first) first = el;
    });
    if (first) first.focus();
    return !first;
  }
  document.addEventListener('input', function(e) {
    if (e.target.getAttribute && e.target.getAttribute('aria-invalid') === 'true') {
      e.target.setAttribute('aria-invalid', 'false');
    }
  });

  function toggleItem(it, p) {
    var on = it.classList.toggle('open');
    openIds[p + it.getAttribute('data-id')] = on;
    var hd = it.querySelector('.item-h');
    if (hd) hd.setAttribute('aria-expanded', on ? 'true' : 'false');
  }
  function bindKeyToggle(listEl, p) {
    listEl.addEventListener('keydown', function(e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList &&
          e.target.classList.contains('item-h') && e.target.getAttribute('role') === 'button') {
        e.preventDefault();
        toggleItem(e.target.parentNode, p);
      }
    });
  }

  /* 모달 포커스 가두기 */
  function trapTab(e, root) {
    if (e.key !== 'Tab') return;
    var f = Array.prototype.filter.call(
      root.querySelectorAll('button:not([disabled]), input:not([disabled]), select, textarea, a[href]'),
      function(el) { return el.offsetParent !== null; });
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    else if (!root.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  }
  window.addEventListener('keydown', function(e) {
    if ($('pwModal').classList.contains('show')) trapTab(e, $('pwModal'));
    else if ($('modal').classList.contains('show')) trapTab(e, $('modal'));
  });

  /* 탭 전환 */
  $('nav').addEventListener('click', function(e) {
    var btn = e.target.closest('button[data-t]');
    if (!btn) return;
    var t = btn.getAttribute('data-t');
    Array.prototype.forEach.call($('nav').children, function(b) {
      b.classList.toggle('on', b === btn);
      b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
      b.setAttribute('tabindex', b === btn ? '0' : '-1');
    });
    Array.prototype.forEach.call(document.querySelectorAll('section'), function(s) {
      s.classList.toggle('on', s.id === t);
    });
    renderAll();
  });

  $('nav').addEventListener('keydown', function(e) {
    var k = e.key;
    if (k !== 'ArrowLeft' && k !== 'ArrowRight' && k !== 'Home' && k !== 'End') return;
    var bs = Array.prototype.slice.call($('nav').querySelectorAll('button[data-t]'));
    var i = bs.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    if (k === 'ArrowLeft') i = (i + bs.length - 1) % bs.length;
    else if (k === 'ArrowRight') i = (i + 1) % bs.length;
    else if (k === 'Home') i = 0;
    else i = bs.length - 1;
    bs[i].focus();
    bs[i].click();
  });

  if ($('today')) $('today').textContent = today();
  if ($('modeNote')) $('modeNote').hidden = FB;

  function emptyText(msg) {
    return '<div class="empty">' + (store.loaded() ? msg : '불러오는 중입니다…') + '</div>';
  }

  /* 1. 고시·공고 */
  function renderNotices() {
    var h = '';
    notices.slice().sort(function(a, b) {
      return ((b.imp ? 1 : 0) - (a.imp ? 1 : 0)) || ((b.ts || 0) - (a.ts || 0));
    }).forEach(function(n) {
      var open = !!openIds['n' + n.id];
      h += '<div class="item' + (open ? ' open' : '') + '" data-id="' + esc(n.id) + '"><div class="item-h" role="button" tabindex="0" aria-expanded="' + (open ? 'true' : 'false') + '">' +
        (n.imp ? '<span class="tag imp">중요</span>' : '<span class="tag">공고</span>') +
        '<span class="t">' + esc(n.title) + '</span><span class="d">' + esc(n.date) + '</span></div>' +
        '<div class="item-b">' + esc(n.body) +
        (admin && !n.builtin ? '<div class="acts"><button class="btn danger sm" data-del-n="' + esc(n.id) + '">삭제</button></div>' : '') +
        '</div></div>';
    });
    $('noticeList').innerHTML = h || emptyText('등록된 공고가 없습니다.');
  }

  bindKeyToggle($('noticeList'), 'n');
  $('noticeList').addEventListener('click', function(e) {
    var d = e.target.getAttribute('data-del-n');
    if (d) {
      if (!admin) return;
      if (confirm('이 공고를 삭제할까요?')) {
        store.remove('notices', d).then(null, fail);
      }
      return;
    }
    var it = e.target.closest('.item');
    if (it && !e.target.closest('.item-b')) {
      toggleItem(it, 'n');
    }
  });

  /* 관리자 로그인 */
  function pwMsg(t) { $('pwMsg').textContent = t || ''; }
  function pwClose() {
    $('pwModal').classList.remove('show');
    $('pwInput').value = '';
    pwMsg('');
    $('adminToggle').focus();
  }
  function setAdmin(on) {
    admin = on;
    if (!on) adminToasted = false;
    $('adminBox').classList.toggle('show', on);
    $('adminToggle').textContent = on ? '관리자 모드 해제' : '관리자 모드';
    renderAll();
  }
  store.onAuth(setAdmin);

  $('adminToggle').onclick = function() {
    if (admin) { store.logout().then(null, fail); return; }
    $('pwInput').value = '';
    $('pwEmailRow').hidden = !FB;
    pwMsg(store.lockMessage());
    $('pwModal').classList.add('show');
    (FB ? $('pwEmail') : $('pwInput')).focus();
  };

  $('pwCancel').onclick = pwClose;
  $('pwModal').addEventListener('mousedown', function(e) {
    if (e.target === this) pwClose();
  });
  window.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && $('pwModal').classList.contains('show')) pwClose();
  });

  $('pwForm').addEventListener('submit', function(e) {
    e.preventDefault();
    var email = $('pwEmail').value.trim();
    var pw = $('pwInput').value;
    if (FB && !email) { pwMsg('이메일을 입력해 주세요.'); $('pwEmail').focus(); return; }
    if (!pw) { pwMsg('비밀번호를 입력해 주세요.'); $('pwInput').focus(); return; }

    $('pwOk').disabled = true;
    store.login(email, pw).then(function() {
      $('pwOk').disabled = false;
      pwClose();
    }, function(err) {
      $('pwOk').disabled = false;
      $('pwInput').value = '';
      $('pwInput').focus();
      pwMsg(err && err.message ? err.message : '로그인에 실패했습니다.');
    });
  });

  $('nAdd').onclick = function() {
    if (!admin) return;
    var t = $('nTitle').value.trim();
    var b = $('nBody').value.trim();
    if (need(['nTitle', 'nBody'])) {
      toast('공고 제목과 내용을 모두 입력해 주세요.', 'err');
      return;
    }
    store.add('notices', {
      title: t,
      body: b,
      date: today(),
      imp: $('nImp').checked
    }).then(function() {
      $('nTitle').value = '';
      $('nBody').value = '';
      $('nImp').checked = false;
      toast('공고를 등록했습니다.');
    }, fail);
  };

  /* 2. 감사 신청 */
  $('aSubmit').onclick = function() {
    var name = $('aName').value.trim();
    var target = $('aTarget').value.trim();
    var reason = $('aReason').value.trim();
    if (need(['aName', 'aTarget', 'aReason'])) {
      toast('신청인, 감사 대상, 감사 사유를 모두 입력해 주세요.', 'err');
      return;
    }

    var btn = $('aSubmit');
    btn.disabled = true;
    store.createApp({
      applicant: name,
      type: $('aType').value,
      target: target,
      reason: reason,
      mood: $('aMood').value,
      date: today(),
      status: ST_PEND,
      verdict: null,
      comment: null,
      judged: null
    }).then(function(r) {
      btn.disabled = false;
      $('aName').value = '';
      $('aTarget').value = '';
      $('aReason').value = '';
      toast('감사 신청이 접수되었습니다. 관리자 검토(허가) 후 심의가 진행됩니다. 접수번호: ' + r.no, 'ok', 7000);
      var listTab = document.querySelector('[data-t="list"]');
      if (listTab) listTab.click();
    }, function(err) {
      btn.disabled = false;
      fail(err);
    });
  };

  /* 3. 접수 내역 */
  function renderApps() {
    var h = '';
    apps.slice().reverse().forEach(function(a) {
      var st = a.verdict ? '완료' : (a.status || '접수');
      var mine = store.isMine('apps', a.id);
      var tag, acts = '', note = '';
      if (a.verdict) {
        tag = '<span class="tag ' + a.verdict + '">' + VERDICT[a.verdict] + '</span>';
        acts = '<button class="btn sm" data-cert="' + esc(a.id) + '">통지서 보기</button>';
      } else if (st === ST_PEND) {
        tag = '<span class="tag pend">검토중</span>';
        if (admin) {
          acts = '<button class="btn sm" data-approve-a="' + esc(a.id) + '">허가</button>' +
                 '<button class="btn danger sm" data-reject-a="' + esc(a.id) + '">반려</button>';
        } else {
          note = '<div class="meta" style="margin-top:4px">관리자의 허가를 기다리는 중입니다. 허가 후 심의를 개시할 수 있습니다.</div>';
        }
      } else if (st === ST_REJ) {
        tag = '<span class="tag rej">반려</span>';
        if (admin) acts = '<button class="btn sm" data-approve-a="' + esc(a.id) + '">허가로 변경</button>';
        else note = '<div class="meta" style="margin-top:4px">관리자가 반려한 신청입니다.</div>';
      } else {
        tag = '<span class="tag wait">허가 · 심의 대기</span>';
        if (mine || admin) acts = '<button class="btn sm" data-judge="' + esc(a.id) + '">심의 개시</button>';
      }

      h += '<div class="item">' +
        '<div class="item-h" style="cursor:default">' + tag +
        '<span class="t">' + esc(a.target) + ' <span class="meta">(' + esc(a.type) + ')</span></span>' +
        '<span class="d">' + esc(a.date) + '</span></div>' +
        '<div class="meta" style="margin-top:4px">' + esc(a.no) + ' · 신청인 ' + esc(a.applicant) + ' · 자가진단 ' + esc(MOOD[a.mood] || a.mood) + (FB && mine ? ' · 내 신청' : '') + '</div>' +
        '<div style="font-size:14px;margin-top:4px">' + esc(a.reason) + '</div>' + note +
        '<div class="acts">' + acts +
        (canDelete() ? '<button class="btn danger sm" data-del-a="' + esc(a.id) + '">삭제</button>' : '') +
        '</div></div>';
    });
    $('appList').innerHTML = h || emptyText('접수된 감사 신청이 없습니다.');
  }

  function pick(w) {
    var r = Math.random() * 100;
    var k = ['ok', 'fix', 'no'];
    for (var i = 0; i < 3; i++) {
      if (r < w[i]) return k[i];
      r -= w[i];
    }
    return 'fix';
  }

  $('appList').addEventListener('click', function(e) {
    var j = e.target.getAttribute('data-judge');
    var c = e.target.getAttribute('data-cert');
    var d = e.target.getAttribute('data-del-a');
    var ap = e.target.getAttribute('data-approve-a');
    var rj = e.target.getAttribute('data-reject-a');

    if (ap || rj) {
      if (!admin) return;
      var t0 = findBy(apps, ap || rj);
      if (!t0 || t0.verdict) return;
      if (rj && !confirm('이 감사 신청을 반려할까요?')) return;
      store.patch('apps', t0.id, { status: ap ? '접수' : ST_REJ }).then(function() {
        toast(ap ? '허가했습니다. 이제 심의를 개시할 수 있습니다.' : '반려했습니다.');
      }, fail);
      return;
    }

    if (j) {
      var a = findBy(apps, j);
      if (a && a.status === '접수' && !a.verdict && (admin || store.isMine('apps', a.id))) {
        var v = pick(WEIGHT[a.mood] || [33, 33, 34]);
        var arr = COMMENT[v];
        var p = {
          status: '완료',
          verdict: v,
          comment: arr[Math.floor(Math.random() * arr.length)],
          judged: today()
        };
        store.patch('apps', a.id, p).then(function() {
          showCert(Object.assign({}, a, p));
        }, fail);
      }
    } else if (c) {
      showCert(c);
    } else if (d) {
      if (!canDelete()) return;
      if (confirm('이 신청 내역을 삭제할까요?')) {
        store.remove('apps', d).then(null, fail);
      }
    }
  });

  /* 4. 통지서 모달 및 직인 */
  function showCert(idOrObj) {
    var a = (typeof idOrObj === 'object') ? idOrObj : findBy(apps, idOrObj);
    if (!a || !a.verdict) return;

    $('cert').innerHTML =
      '<h3>감사 결과 통지서</h3>' +
      '<div class="no">' + esc(a.no) + '</div>' +
      '<table>' +
      '<tr><td>신청인</td><td>' + esc(a.applicant) + '</td></tr>' +
      '<tr><td>감사 유형</td><td>' + esc(a.type) + '</td></tr>' +
      '<tr><td>감사 대상</td><td>' + esc(a.target) + '</td></tr>' +
      '<tr><td>감사 사유</td><td>' + esc(a.reason) + '</td></tr>' +
      '<tr><td>자가진단</td><td>' + esc(MOOD[a.mood] || a.mood) + '</td></tr>' +
      '</table>' +
      '<div class="verdict ' + esc(a.verdict) + '">' + esc(VERDICT[a.verdict]) + '</div>' +
      '<div class="cm"><b>위원회의 심의 의견</b><br>' + esc(a.comment) + '</div>' +
      '<div class="meta" style="text-align:center;margin-top:14px">판정일자: ' + esc(a.judged || a.date) + '</div>' +
      '<div class="foot-wrap">' +
        '<div class="foot">양심감사위원회 위원장' +
          '<small>이음중앙관리국 산하기관</small>' +
        '</div>' +
        '<div class="stamp" title="양심감사위원회의 공식 관인">양심감사<br>위원장인</div>' +
      '</div>' +
      '<div class="acts no-print" style="justify-content:center;margin-top:20px">' +
        '<button class="btn" id="cPrint">통지서 인쇄</button>' +
        '<button class="btn ghost" id="cClose">닫기 (ESC)</button>' +
      '</div>';

    certOpener = document.activeElement;
    $('modal').classList.add('show');

    $('cPrint').onclick = function() { window.print(); };
    $('cClose').onclick = closeCert;
    $('cClose').focus();
  }

  var certOpener = null;
  function closeCert() {
    $('modal').classList.remove('show');
    if (certOpener && document.body.contains(certOpener)) certOpener.focus();
    certOpener = null;
  }

  $('modal').addEventListener('click', function(e) {
    if (e.target === this) closeCert();
  });

  window.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && $('modal').classList.contains('show')) closeCert();
  });

  /* 5. 양심 불량 신고 */
  $('rSubmit').onclick = function() {
    var t = $('rTitle').value.trim();
    var b = $('rBody').value.trim();
    if (need(['rTitle', 'rBody'])) {
      toast('신고 제목과 내용을 모두 입력해 주세요.', 'err');
      return;
    }
    var btn = $('rSubmit');
    btn.disabled = true;
    store.add('reports', {
      name: $('rName').value.trim() || '익명',
      level: $('rLevel').value,
      title: t,
      body: b,
      date: today(),
      agree: 0,
      status: ST_PEND
    }).then(function() {
      btn.disabled = false;
      $('rTitle').value = '';
      $('rBody').value = '';
      $('rName').value = '';
      toast('양심 불량 신고가 접수되었습니다. 관리자 검토(허가) 후 게시됩니다.', 'ok', 5000);
    }, function(err) {
      btn.disabled = false;
      fail(err);
    });
  };

  function renderReports() {
    var h = '';
    reports.slice().reverse().forEach(function(r) {
      var cls = r.level === '심각' ? 'no' : r.level === '보통' ? 'fix' : 'ok';
      var isAgreed = agreedIds.indexOf(String(r.id)) !== -1;
      var st = rStatus(r);
      var isOpen = openIds['r' + r.id] !== undefined ? openIds['r' + r.id] : (admin && st === ST_PEND);
      var stTag = st === ST_PEND ? '<span class="tag pend">검토중</span>' : st === ST_REJ ? '<span class="tag rej">반려</span>' : '';
      var ctl = '';
      if (st === ST_PEND) {
        ctl = admin
          ? '<button class="btn sm" data-approve-r="' + esc(r.id) + '">허가(게시)</button>' +
            '<button class="btn danger sm" data-reject-r="' + esc(r.id) + '">반려</button>'
          : '<span class="meta">관리자 허가 후 게시되며, 그때부터 공감할 수 있습니다.</span>';
      } else if (st === ST_REJ) {
        ctl = admin ? '<button class="btn sm" data-approve-r="' + esc(r.id) + '">허가로 변경</button>'
                    : '<span class="meta">관리자가 반려한 신고입니다.</span>';
      } else {
        ctl = '<button class="btn ghost sm" data-agree="' + esc(r.id) + '"' + (isAgreed ? ' style="font-weight:700;color:var(--navy);background:#e9edf5"' : '') + '>' +
              (isAgreed ? '✓ 공감됨 ' : '공감 ') + (r.agree || 0) + '</button>';
      }
      h += '<div class="item' + (isOpen ? ' open' : '') + '" data-id="' + esc(r.id) + '"><div class="item-h" role="button" tabindex="0" aria-expanded="' + (isOpen ? 'true' : 'false') + '">' +
        stTag + '<span class="tag ' + cls + '">' + esc(r.level) + '</span>' +
        '<span class="t">' + esc(r.title) + '</span>' +
        '<span class="d">' + esc(r.name) + ' · ' + esc(r.date) + '</span></div>' +
        '<div class="item-b">' + esc(r.body) +
        '<div class="acts">' +
        ctl +
        (canDelete() ? '<button class="btn danger sm" data-del-r="' + esc(r.id) + '">삭제</button>' : '') +
        '</div></div></div>';
    });
    $('reportList').innerHTML = h || emptyText('게시된 신고가 없습니다.');
  }

  bindKeyToggle($('reportList'), 'r');
  $('reportList').addEventListener('click', function(e) {
    var ag = e.target.getAttribute('data-agree');
    var d = e.target.getAttribute('data-del-r');
    var ap = e.target.getAttribute('data-approve-r');
    var rj = e.target.getAttribute('data-reject-r');

    if (ap || rj) {
      if (!admin) return;
      var t0 = findBy(reports, ap || rj);
      if (!t0) return;
      if (rj && !confirm('이 신고를 반려할까요?')) return;
      openIds['r' + t0.id] = true;
      store.patch('reports', t0.id, { status: ap ? '게시' : ST_REJ }).then(function() {
        toast(ap ? '허가했습니다. 신고가 게시되었습니다.' : '반려했습니다.');
      }, fail);
      return;
    }

    if (ag) {
      var r = findBy(reports, ag);
      if (r && rStatus(r) === '게시') {
        var sid = String(r.id);
        var idx = agreedIds.indexOf(sid);
        var delta = idx === -1 ? 1 : -1;
        store.bump('reports', r.id, 'agree', delta).then(function() {
          if (delta === 1) agreedIds.push(sid);
          else agreedIds.splice(agreedIds.indexOf(sid), 1);
          save('gac_agreed_ids', agreedIds);
          openIds['r' + sid] = true;
          renderReports();
        }, fail);
      }
      return;
    }

    if (d) {
      if (!canDelete()) return;
      if (confirm('이 신고를 삭제할까요?')) {
        agreedIds = agreedIds.filter(function(x) { return x !== String(d); });
        save('gac_agreed_ids', agreedIds);
        store.remove('reports', d).then(null, fail);
      }
      return;
    }

    var it = e.target.closest('.item');
    if (it && !e.target.closest('.item-b')) {
      toggleItem(it, 'r');
    }
  });

  /* 6. 보고서 & 백업 */
  function graph(rows) {
    var max = Math.max.apply(null, rows.map(function(r) { return r.v; }).concat([1]));
    var h = '';
    rows.forEach(function(r) {
      h += '<div class="gr"><span class="n">' + r.n + '</span>' +
        '<div class="tr"><div class="fl" style="width:' + (r.v / max * 100) + '%;background:' + r.c + '"></div></div>' +
        '<span class="c">' + r.v + '</span></div>';
    });
    return h;
  }

  function pendingApps() {
    return apps.filter(function(x) { return x.status === ST_PEND && !x.verdict; }).length;
  }
  function pendingReports() {
    return reports.filter(function(r) { return rStatus(r) === ST_PEND; }).length;
  }
  function pendingCount() { return pendingApps() + pendingReports(); }

  function renderStat() {
    var done = apps.filter(function(a) { return a.verdict; });
    var okReports = reports.filter(function(r) { return rStatus(r) === '게시'; });
    var okApps = apps.filter(function(x) { return x.status !== ST_PEND && x.status !== ST_REJ; });
    $('sApps').textContent = okApps.length;
    $('sDone').textContent = done.length;
    $('sRep').textContent = okReports.length;
    $('sPend').textContent = pendingCount();
    $('statPend').hidden = FB && !admin; // 서버 모드에서는 관리자만 전체 대기 건수를 볼 수 있음

    function cnt(k) {
      return done.filter(function(a) { return a.verdict === k; }).length;
    }
    $('verdictGraph').innerHTML = graph([
      { n: '적합', v: cnt('ok'), c: '#1e7a46' },
      { n: '보완 요구', v: cnt('fix'), c: '#b7791f' },
      { n: '부적합', v: cnt('no'), c: '#b3261e' }
    ]);

    function lv(k) {
      return okReports.filter(function(r) { return r.level === k; }).length;
    }
    $('levelGraph').innerHTML = graph([
      { n: '경미', v: lv('경미'), c: '#1e7a46' },
      { n: '보통', v: lv('보통'), c: '#b7791f' },
      { n: '심각', v: lv('심각'), c: '#b3261e' }
    ]);

    $('statNote').textContent = FB
      ? '※ 위 수치는 관리자가 허가하여 게시된 건을 기준으로 집계됩니다.'
      : '※ 위 수치는 이 브라우저에 저장된 데이터를 기준으로 집계됩니다.';

    // 백업 영역: 로컬 모드는 모두, 서버 모드는 관리자에게 백업(내보내기)만
    $('backupRow').hidden = FB && !admin;
    $('btnImportData').hidden = FB;
    $('btnResetData').hidden = FB;
  }

  if ($('btnExportData')) {
    $('btnExportData').onclick = function() {
      var data = store.exportData();
      data.app = 'conscience-audit-committee';
      data.version = VERSION;
      data.agreedIds = agreedIds;
      data.exportedAt = new Date().toISOString();
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = '양심감사위원회_데이터_' + today().replace(/\./g, '') + '.json';
      a.click();
      URL.revokeObjectURL(url);
    };
  }

  if ($('btnImportData') && $('fileImportData')) {
    $('btnImportData').onclick = function() { $('fileImportData').click(); };
    $('fileImportData').onchange = function() {
      var f = this.files && this.files[0];
      var input = this;
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function() {
        input.value = '';
        var d;
        try { d = JSON.parse(fr.result); } catch (e) { d = null; }
        if (!d || d.app !== 'conscience-audit-committee' ||
            !Array.isArray(d.apps) || !Array.isArray(d.reports) || !Array.isArray(d.notices)) {
          toast('양심감사위원회 백업 파일이 아니거나 파일이 손상되었습니다.', 'err', 4000);
          return;
        }
        if (!confirm('백업 파일(' + (d.exportedAt || '날짜 미상').slice(0, 10) + ')로 복원할까요?\n현재 공고·신청·신고 데이터는 모두 백업 내용으로 바뀝니다.')) return;
        store.importData(d).then(function() {
          agreedIds = Array.isArray(d.agreedIds) ? d.agreedIds.map(String) : [];
          save('gac_agreed_ids', agreedIds);
          openIds = {};
          renderAll();
          toast('데이터가 복원되었습니다.');
        }, fail);
      };
      fr.onerror = function() { toast('파일을 읽지 못했습니다.', 'err'); };
      fr.readAsText(f);
    };
  }

  if ($('btnResetData')) {
    $('btnResetData').onclick = function() {
      if (confirm('모든 감사 신청 및 신고 기록을 초기화하시겠습니까?\n(고시·공고는 유지됩니다.)\n이 작업은 취소할 수 없습니다.')) {
        store.resetData().then(function() {
          agreedIds = [];
          try { localStorage.removeItem('gac_agreed_ids'); } catch (e) {}
          openIds = {};
          renderAll();
          toast('데이터가 초기화되었습니다.');
        }, fail);
      }
    };
  }

  // 관리자 모드일 때 탭에 검토 대기 건수 표시
  function setBadge(t, n) {
    var b = document.querySelector('#nav [data-t="' + t + '"]');
    if (!b) return;
    var s = b.querySelector('.badge');
    if (admin && n > 0) {
      if (!s) { s = document.createElement('span'); s.className = 'badge'; b.appendChild(s); }
      s.textContent = n;
      s.setAttribute('aria-label', '검토 대기 ' + n + '건');
    } else if (s) {
      b.removeChild(s);
    }
  }

  function renderAll() {
    renderNotices();
    renderApps();
    renderReports();
    renderStat();
    setBadge('list', pendingApps());
    setBadge('report', pendingReports());

    // 관리자로 들어왔고 데이터가 모두 불러와졌을 때 한 번만 대기 건수 안내
    if (admin && !adminToasted && store.loaded()) {
      adminToasted = true;
      var n = pendingCount();
      if (n) toast('검토 대기 중인 건이 ' + n + '건 있습니다. [접수 내역]·[양심 불량 신고]에서 허가해 주세요.', 'ok', 5000);
    }
  }

  store.subscribe(function(s) {
    notices = s.notices;
    apps = s.apps;
    reports = s.reports;
    renderAll();
  });
  if (store.isAdmin()) setAdmin(true);
})();
