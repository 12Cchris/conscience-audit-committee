(function() {
  'use strict';

  var VERSION = '1.4.0';
  var $ = function(id) { return document.getElementById(id); };
  if ($('ver')) $('ver').textContent = 'v' + VERSION;

  function load(k, d) {
    try {
      var v = localStorage.getItem(k);
      return v ? JSON.parse(v) : d;
    } catch(e) {
      return d;
    }
  }

  var saveWarned = false;
  function save(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
      return true;
    } catch(e) {
      if (!saveWarned) {
        saveWarned = true;
        alert('이 브라우저에서는 데이터를 저장할 수 없습니다.\n(시크릿 모드이거나 저장 공간이 가득 찼을 수 있습니다.)\n페이지를 닫으면 입력한 내용이 사라집니다. 필요하면 [감사 보고서]에서 백업(JSON)을 받아 주세요.');
      }
      return false;
    }
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

  // 1. 공고 초기화
  var notices = load('gac_notices', null);
  if (!notices) {
    notices = [
      {
        id: 1,
        title: '양심감사위원회 출범 안내',
        body: '국민의 양심을 투명하게 감사하기 위해 양심감사위원회가 출범하였음을 알립니다.\n\n감사 신청과 불량 신고는 상시 접수합니다.',
        date: today(),
        imp: true
      },
      {
        id: 2,
        title: '양심 감사 신청 절차 안내',
        body: '1. [감사 신청] 메뉴에서 신청서 제출\n2. [접수 내역]에서 심의 개시\n3. 감사 결과 통지서 발급 및 출력',
        date: today(),
        imp: false
      },
      {
        id: 3,
        title: '거짓 신청에 대한 유의사항',
        body: '양심 상태 자가진단은 솔직하게 작성해 주시기 바랍니다. 허위 기재 시 판정에 불리하게 작용할 수 있습니다.',
        date: today(),
        imp: false
      }
    ];
    save('gac_notices', notices);
  }

  // 2. 신청 내역 및 순번 관리 (중복 번호 버그 방지)
  var apps = load('gac_apps', []);
  var appSeq = load('gac_app_seq', apps.length);
  if (appSeq < apps.length) {
    appSeq = apps.length;
    save('gac_app_seq', appSeq);
  }

  // 3. 신고 목록 및 공감 중복 방지
  var reports = load('gac_reports', []);
  var agreedIds = load('gac_agreed_ids', []);

  var admin = false;
  var openIds = {}; // 펼쳐 둔 공고·신고 (다시 그려도 유지)

  /* 탭 전환 */
  $('nav').addEventListener('click', function(e) {
    var btn = e.target.closest('button[data-t]');
    if (!btn) return;
    var t = btn.getAttribute('data-t');
    Array.prototype.forEach.call($('nav').children, function(b) {
      b.classList.toggle('on', b === btn);
    });
    Array.prototype.forEach.call(document.querySelectorAll('section'), function(s) {
      s.classList.toggle('on', s.id === t);
    });
    renderAll();
  });

  if ($('today')) $('today').textContent = today();

  /* 1. 고시·공고 */
  function renderNotices() {
    var h = '';
    notices.slice().sort(function(a, b) {
      return (b.imp - a.imp) || (b.id - a.id);
    }).forEach(function(n) {
      h += '<div class="item' + (openIds['n' + n.id] ? ' open' : '') + '" data-id="' + n.id + '"><div class="item-h">' +
        (n.imp ? '<span class="tag imp">중요</span>' : '<span class="tag">공고</span>') +
        '<span class="t">' + esc(n.title) + '</span><span class="d">' + esc(n.date) + '</span></div>' +
        '<div class="item-b">' + esc(n.body) +
        (admin ? '<div class="acts"><button class="btn danger sm" data-del-n="' + n.id + '">삭제</button></div>' : '') +
        '</div></div>';
    });
    $('noticeList').innerHTML = h || '<div class="empty">등록된 공고가 없습니다.</div>';
  }

  $('noticeList').addEventListener('click', function(e) {
    var d = e.target.getAttribute('data-del-n');
    if (d) {
      if (confirm('이 공고를 삭제할까요?')) {
        notices = notices.filter(function(n) { return String(n.id) !== String(d); });
        save('gac_notices', notices);
        renderNotices();
      }
      return;
    }
    var it = e.target.closest('.item');
    if (it && !e.target.closest('.item-b')) {
      openIds['n' + it.getAttribute('data-id')] = it.classList.toggle('open');
    }
  });

  // SHA-256 해시 (비밀번호 원문은 코드에 저장되지 않음)
  var ADMIN_HASH = '4a65d874a5cbe25286e5d5d6db3ce24fc06c9d99eef619718fe839941cecc39c';

  function sha256(str) {
    var encoder = new TextEncoder();
    var data = encoder.encode(str);
    return crypto.subtle.digest('SHA-256', data).then(function(buf) {
      return Array.from(new Uint8Array(buf))
        .map(function(b) { return b.toString(16).padStart(2, '0'); })
        .join('');
    });
  }

  var adminAttempts = parseInt(load('gac_admin_attempts', 0), 10) || 0;
  var adminLockUntil = load('gac_admin_lock_until', 0) || 0;

  $('adminToggle').onclick = function() {
    if (admin) {
      admin = false;
      $('adminBox').classList.remove('show');
      this.textContent = '관리자 모드';
      renderNotices();
      return;
    }

    // 잠금 체크
    var now = Date.now();
    if (adminLockUntil > now) {
      var remainSec = Math.ceil((adminLockUntil - now) / 1000);
      alert('로그인 시도 횟수 초과로 잠금되었습니다.\n' + remainSec + '초 후 다시 시도해 주세요.');
      return;
    }

    var pw = prompt('관리자 비밀번호를 입력하세요:');
    if (pw === null) return;

    var btn = this;
    sha256(pw).then(function(hash) {
      if (hash === ADMIN_HASH) {
        adminAttempts = 0;
        save('gac_admin_attempts', 0);
        save('gac_admin_lock_until', 0);
        admin = true;
        $('adminBox').classList.add('show');
        btn.textContent = '관리자 모드 해제';
        renderNotices();
      } else {
        adminAttempts++;
        save('gac_admin_attempts', adminAttempts);
        if (adminAttempts >= 5) {
          adminLockUntil = Date.now() + 5 * 60 * 1000; // 5분 잠금
          save('gac_admin_lock_until', adminLockUntil);
          adminAttempts = 0;
          save('gac_admin_attempts', 0);
          alert('비밀번호가 틀렸습니다.\n5회 연속 실패로 5분간 잠금됩니다.');
        } else {
          alert('비밀번호가 틀렸습니다. (' + adminAttempts + '/5회)');
        }
      }
    });
  };

  $('nAdd').onclick = function() {
    var t = $('nTitle').value.trim();
    var b = $('nBody').value.trim();
    if (!t || !b) {
      alert('공고 제목과 내용을 모두 입력해 주세요.');
      return;
    }
    notices.push({
      id: Date.now(),
      title: t,
      body: b,
      date: today(),
      imp: $('nImp').checked
    });
    save('gac_notices', notices);
    $('nTitle').value = '';
    $('nBody').value = '';
    $('nImp').checked = false;
    renderNotices();
  };

  /* 2. 감사 신청 */
  $('aSubmit').onclick = function() {
    var name = $('aName').value.trim();
    var target = $('aTarget').value.trim();
    var reason = $('aReason').value.trim();
    if (!name || !target || !reason) {
      alert('신청인, 감사 대상, 감사 사유를 모두 입력해 주세요.');
      return;
    }

    appSeq++;
    save('gac_app_seq', appSeq);

    var no = '양감 제' + new Date().getFullYear() + '-' + String(appSeq).padStart(4, '0') + '호';
    apps.push({
      id: Date.now(),
      no: no,
      applicant: name,
      type: $('aType').value,
      target: target,
      reason: reason,
      mood: $('aMood').value,
      date: today(),
      status: '접수',
      verdict: null,
      comment: null
    });
    save('gac_apps', apps);

    $('aName').value = '';
    $('aTarget').value = '';
    $('aReason').value = '';
    alert('감사 신청이 정상 접수되었습니다.\n접수번호: ' + no);

    var listTab = document.querySelector('[data-t="list"]');
    if (listTab) listTab.click();
  };

  /* 3. 접수 내역 */
  function renderApps() {
    var h = '';
    apps.slice().reverse().forEach(function(a) {
      var tag = a.verdict
        ? '<span class="tag ' + a.verdict + '">' + VERDICT[a.verdict] + '</span>'
        : '<span class="tag wait">접수</span>';

      h += '<div class="item">' +
        '<div class="item-h" style="cursor:default">' + tag +
        '<span class="t">' + esc(a.target) + ' <span class="meta">(' + esc(a.type) + ')</span></span>' +
        '<span class="d">' + esc(a.date) + '</span></div>' +
        '<div class="meta" style="margin-top:4px">' + esc(a.no) + ' · 신청인 ' + esc(a.applicant) + ' · 자가진단 ' + (MOOD[a.mood] || a.mood) + '</div>' +
        '<div style="font-size:14px;margin-top:4px">' + esc(a.reason) + '</div>' +
        '<div class="acts">' +
        (a.verdict
          ? '<button class="btn sm" data-cert="' + a.id + '">통지서 보기</button>'
          : '<button class="btn sm" data-judge="' + a.id + '">심의 개시</button>') +
        '<button class="btn danger sm" data-del-a="' + a.id + '">삭제</button>' +
        '</div></div>';
    });
    $('appList').innerHTML = h || '<div class="empty">접수된 감사 신청이 없습니다.</div>';
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

    if (j) {
      var a = apps.filter(function(x) { return String(x.id) === String(j); })[0];
      if (a) {
        a.verdict = pick(WEIGHT[a.mood] || [33, 33, 34]);
        a.status = '완료';
        var arr = COMMENT[a.verdict];
        a.comment = arr[Math.floor(Math.random() * arr.length)];
        a.judged = today();
        save('gac_apps', apps);
        renderApps();
        showCert(a.id);
      }
    } else if (c) {
      showCert(c);
    } else if (d) {
      if (confirm('이 신청 내역을 삭제할까요?')) {
        apps = apps.filter(function(x) { return String(x.id) !== String(d); });
        save('gac_apps', apps);
        renderApps();
      }
    }
  });

  /* 4. 통지서 모달 및 직인 */
  function showCert(id) {
    var a = apps.filter(function(x) { return String(x.id) === String(id); })[0];
    if (!a) return;

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
      '<div class="verdict ' + a.verdict + '">' + VERDICT[a.verdict] + '</div>' +
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

    $('modal').classList.add('show');

    $('cPrint').onclick = function() { window.print(); };
    $('cClose').onclick = function() { $('modal').classList.remove('show'); };
  }

  $('modal').addEventListener('click', function(e) {
    if (e.target === this) {
      this.classList.remove('show');
    }
  });

  window.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && $('modal').classList.contains('show')) {
      $('modal').classList.remove('show');
    }
  });

  /* 5. 양심 불량 신고 */
  $('rSubmit').onclick = function() {
    var t = $('rTitle').value.trim();
    var b = $('rBody').value.trim();
    if (!t || !b) {
      alert('신고 제목과 내용을 모두 입력해 주세요.');
      return;
    }
    reports.push({
      id: Date.now(),
      name: $('rName').value.trim() || '익명',
      level: $('rLevel').value,
      title: t,
      body: b,
      date: today(),
      agree: 0
    });
    save('gac_reports', reports);
    $('rTitle').value = '';
    $('rBody').value = '';
    $('rName').value = '';
    renderReports();
    alert('양심 불량 신고가 공식 접수되었습니다.');
  };

  function renderReports() {
    var h = '';
    reports.slice().reverse().forEach(function(r) {
      var cls = r.level === '심각' ? 'no' : r.level === '보통' ? 'fix' : 'ok';
      var isAgreed = agreedIds.indexOf(r.id) !== -1;
      h += '<div class="item' + (openIds['r' + r.id] ? ' open' : '') + '" data-id="' + r.id + '"><div class="item-h">' +
        '<span class="tag ' + cls + '">' + esc(r.level) + '</span>' +
        '<span class="t">' + esc(r.title) + '</span>' +
        '<span class="d">' + esc(r.name) + ' · ' + esc(r.date) + '</span></div>' +
        '<div class="item-b">' + esc(r.body) +
        '<div class="acts">' +
        '<button class="btn ghost sm" data-agree="' + r.id + '"' + (isAgreed ? ' style="font-weight:700;color:var(--navy);background:#e9edf5"' : '') + '>' +
        (isAgreed ? '✓ 공감됨 ' : '공감 ') + r.agree + '</button>' +
        '<button class="btn danger sm" data-del-r="' + r.id + '">삭제</button>' +
        '</div></div></div>';
    });
    $('reportList').innerHTML = h || '<div class="empty">접수된 신고가 없습니다.</div>';
  }

  $('reportList').addEventListener('click', function(e) {
    var ag = e.target.getAttribute('data-agree');
    var d = e.target.getAttribute('data-del-r');

    if (ag) {
      var r = reports.filter(function(x) { return String(x.id) === String(ag); })[0];
      if (r) {
        var idx = agreedIds.indexOf(r.id);
        if (idx === -1) {
          r.agree++;
          agreedIds.push(r.id);
        } else {
          r.agree = Math.max(0, r.agree - 1);
          agreedIds.splice(idx, 1);
        }
        save('gac_reports', reports);
        save('gac_agreed_ids', agreedIds);
        openIds['r' + ag] = true;
        renderReports();
      }
      return;
    }

    if (d) {
      if (confirm('이 신고를 삭제할까요?')) {
        reports = reports.filter(function(x) { return String(x.id) !== String(d); });
        agreedIds = agreedIds.filter(function(x) { return String(x) !== String(d); });
        save('gac_reports', reports);
        save('gac_agreed_ids', agreedIds);
        renderReports();
      }
      return;
    }

    var it = e.target.closest('.item');
    if (it && !e.target.closest('.item-b')) {
      openIds['r' + it.getAttribute('data-id')] = it.classList.toggle('open');
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

  function renderStat() {
    var done = apps.filter(function(a) { return a.verdict; });
    $('sApps').textContent = apps.length;
    $('sDone').textContent = done.length;
    $('sRep').textContent = reports.length;

    function cnt(k) {
      return done.filter(function(a) { return a.verdict === k; }).length;
    }
    $('verdictGraph').innerHTML = graph([
      { n: '적합', v: cnt('ok'), c: '#1e7a46' },
      { n: '보완 요구', v: cnt('fix'), c: '#b7791f' },
      { n: '부적합', v: cnt('no'), c: '#b3261e' }
    ]);

    function lv(k) {
      return reports.filter(function(r) { return r.level === k; }).length;
    }
    $('levelGraph').innerHTML = graph([
      { n: '경미', v: lv('경미'), c: '#1e7a46' },
      { n: '보통', v: lv('보통'), c: '#b7791f' },
      { n: '심각', v: lv('심각'), c: '#b3261e' }
    ]);
  }

  // 데이터 백업 및 복원 이벤트
  if ($('btnExportData')) {
    $('btnExportData').onclick = function() {
      var data = {
        app: 'conscience-audit-committee',
        version: VERSION,
        notices: notices,
        apps: apps,
        appSeq: appSeq,
        reports: reports,
        agreedIds: agreedIds,
        exportedAt: new Date().toISOString()
      };
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
          alert('양심감사위원회 백업 파일이 아니거나 파일이 손상되었습니다.');
          return;
        }
        if (!confirm('백업 파일(' + (d.exportedAt || '날짜 미상').slice(0, 10) + ')로 복원할까요?\n현재 공고·신청·신고 데이터는 모두 백업 내용으로 바뀝니다.')) return;
        notices = d.notices;
        apps = d.apps;
        reports = d.reports;
        agreedIds = Array.isArray(d.agreedIds) ? d.agreedIds : [];
        appSeq = Math.max(parseInt(d.appSeq, 10) || 0, apps.length);
        save('gac_notices', notices);
        save('gac_apps', apps);
        save('gac_reports', reports);
        save('gac_agreed_ids', agreedIds);
        save('gac_app_seq', appSeq);
        openIds = {};
        renderAll();
        alert('데이터가 복원되었습니다.');
      };
      fr.onerror = function() { alert('파일을 읽지 못했습니다.'); };
      fr.readAsText(f);
    };
  }

  if ($('btnResetData')) {
    $('btnResetData').onclick = function() {
      if (confirm('모든 감사 신청 및 신고 기록을 초기화하시겠습니까?\n(고시·공고는 유지됩니다.)\n이 작업은 취소할 수 없습니다.')) {
        try {
          localStorage.removeItem('gac_apps');
          localStorage.removeItem('gac_app_seq');
          localStorage.removeItem('gac_reports');
          localStorage.removeItem('gac_agreed_ids');
        } catch (e) {}
        apps = [];
        appSeq = 0;
        reports = [];
        agreedIds = [];
        openIds = {};
        renderAll();
        alert('데이터가 초기화되었습니다.');
      }
    };
  }

  function renderAll() {
    renderNotices();
    renderApps();
    renderReports();
    renderStat();
  }

  renderAll();
})();
