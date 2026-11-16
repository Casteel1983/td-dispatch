/* Freyr feed for the Dispatch Planner. Added by the Odin chat, 2026-11-16.
   Freyr commits each run's files to feed/<day>_<run>/ in this repo (dailyplan.csv, Route-N.txt, Local.txt) plus feed/index.json.
   This script adds "Load from Freyr" to the Daily Plan tab and to each route tab. Nothing here writes anywhere: it only reads the feed
   and fills the same inputs the Load CSV and Import Stop List buttons already use. To remove it, delete the one <script src="freyr_feed.js">
   line at the bottom of dispatch_planner.html. */
(function () {
  'use strict';
  var S = { index: null, day: null, run: null, msg: '', msgOk: true };
  var ROUTE_FILE = { 'Local': 'Local.txt', 'Route 3': 'Route-3.txt', 'Route 4': 'Route-4.txt', 'Route 5': 'Route-5.txt',
                     'Route 6': 'Route-6.txt', 'Route 7': 'Route-7.txt', 'Route 8': 'Route-8.txt' };
  var RUN_LABEL = { morning: 'Morning', afternoon: 'Afternoon', local: 'Local, whole day' };

  function url(p) { return new URL('feed/' + p + (p.indexOf('?') < 0 ? '?t=' + Date.now() : ''), document.baseURI).href; }
  function getText(p) {
    return fetch(url(p), { cache: 'no-store' }).then(function (r) {
      if (!r.ok) { var e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
      return r.text();
    });
  }
  function dayLabel(d) {
    var t = new Date(d + 'T12:00:00');
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][t.getDay()] + ' ' + (t.getMonth() + 1) + '/' + t.getDate();
  }
  function days() { var s = {}, o = []; (S.index ? S.index.runs : []).forEach(function (r) { if (!s[r.day]) { s[r.day] = 1; o.push(r.day); } }); return o; }
  function runsFor(day) { return (S.index ? S.index.runs : []).filter(function (r) { return r.day === day; }); }
  function entry() { return (S.index ? S.index.runs : []).filter(function (r) { return r.day === S.day && r.run === S.run; })[0]; }

  var _t; function say(msg, ok) { S.msg = msg; S.msgOk = ok !== false; paintAll(); clearTimeout(_t); _t = setTimeout(function () { S.msg = ''; paintAll(); }, 9000); }

  function loadIndex() {
    return getText('index.json').then(function (t) {
      S.index = JSON.parse(t);
      var ds = days();
      if (!S.day || ds.indexOf(S.day) < 0) S.day = ds[0] || null;
      var rs = runsFor(S.day).map(function (r) { return r.run; });
      if (!S.run || rs.indexOf(S.run) < 0) S.run = (typeof _dailyMode !== 'undefined' && rs.indexOf(_dailyMode) >= 0) ? _dailyMode : (rs.indexOf('morning') >= 0 ? 'morning' : rs[0] || null);
      paintAll();
    }).catch(function (e) { S.index = null; say('Feed not available yet (' + e.message + ')', false); });
  }

  function controls(kind) {
    var wrap = document.createElement('span');
    wrap.className = 'freyr-ctl';
    wrap.style.cssText = 'display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:11px;color:#374151';
    wrap.innerHTML = '<select class="freyr-day" style="font-size:11px;padding:2px 4px"></select>' +
                     '<select class="freyr-run" style="font-size:11px;padding:2px 4px"></select>' +
                     '<span class="freyr-msg" style="color:#6b7280"></span>';
    wrap.querySelector('.freyr-day').onchange = function () { S.day = this.value; S.run = null; ensureRun(); paintAll(); };
    wrap.querySelector('.freyr-run').onchange = function () { S.run = this.value; paintAll(); };
    return wrap;
  }
  function ensureRun() {
    var rs = runsFor(S.day).map(function (r) { return r.run; });
    if (rs.indexOf(S.run) < 0) S.run = rs.indexOf('morning') >= 0 ? 'morning' : rs[0] || null;
  }
  function paintAll() {
    var ds = days();
    [].forEach.call(document.querySelectorAll('.freyr-ctl'), function (w) {
      var d = w.querySelector('.freyr-day'), r = w.querySelector('.freyr-run'), m = w.querySelector('.freyr-msg');
      d.innerHTML = ds.map(function (x) { return '<option value="' + x + '"' + (x === S.day ? ' selected' : '') + '>' + dayLabel(x) + '</option>'; }).join('');
      var rs = runsFor(S.day);
      r.innerHTML = rs.map(function (x) { return '<option value="' + x.run + '"' + (x.run === S.run ? ' selected' : '') + '>' + (RUN_LABEL[x.run] || x.run) + '</option>'; }).join('');
      var e = entry();
      m.style.color = S.msg ? (S.msgOk ? '#047857' : '#b91c1c') : '#6b7280';
      m.textContent = S.msg || (e ? (e.orders + ' orders; feed updated ' + (S.index.updated || '').replace('T', ' ').slice(0, 16)) : '');
    });
  }

  function loadDaily() {
    var e = entry();
    if (!e || e.run === 'local') { say('Pick Morning or Afternoon for the Daily Plan', false); return; }
    getText(S.day + '_' + S.run + '/dailyplan.csv').then(function (txt) {
      if (typeof setDailyMode === 'function') setDailyMode(S.run);
      var file = new File([txt], 'freyr_' + S.day + '_' + S.run + '_dailyplan.csv', { type: 'text/csv' });
      handleDailyUpload({ files: [file], value: '' }, 'load');
      say('Loaded ' + dayLabel(S.day) + ' ' + RUN_LABEL[S.run] + ' from Freyr');
    }).catch(function (err) { say(err.status === 404 ? 'No ' + RUN_LABEL[S.run] + ' file for ' + dayLabel(S.day) : 'Could not load: ' + err.message, false); });
  }

  function loadRoute(route) {
    var f = ROUTE_FILE[route];
    getText(S.day + '_' + S.run + '/' + f).then(function (txt) {
      var ta = document.getElementById('import-textarea');
      if (!ta || typeof doImportStops !== 'function') throw new Error('import box not found');
      ta.value = txt;
      _importRoute = route;
      doImportStops();
      say(route + ': loaded ' + dayLabel(S.day) + ' ' + RUN_LABEL[S.run] + ' from Freyr');
    }).catch(function (err) { say(err.status === 404 ? 'No ' + route + ' stops in ' + dayLabel(S.day) + ' ' + RUN_LABEL[S.run] : 'Could not load: ' + err.message, false); });
  }

  function mkBtn(text, fn) {
    var b = document.createElement('button');
    b.className = 'plan-action-btn freyr-btn';
    b.type = 'button';
    b.textContent = text;
    b.style.cssText = 'border-color:#047857;color:#047857';
    b.onclick = fn;
    return b;
  }

  function ensureUi() {
    var bar = document.querySelector('.dp-upload-btns');
    if (bar && !document.getElementById('freyr-dp')) {
      var box = document.createElement('div');
      box.id = 'freyr-dp';
      box.style.cssText = 'margin:8px 0;padding:8px 10px;border:1px dashed #047857;border-radius:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap';
      var lab = document.createElement('strong'); lab.textContent = 'From Freyr'; lab.style.cssText = 'font-size:11px;color:#047857;text-transform:uppercase;letter-spacing:1px';
      box.appendChild(lab); box.appendChild(controls('dp')); box.appendChild(mkBtn('Load from Freyr', loadDaily));
      bar.parentNode.insertBefore(box, bar.nextSibling);
      paintAll();
    }
    [].forEach.call(document.querySelectorAll('.plan-action-row'), function (row) {
      if (row.querySelector('.freyr-btn')) return;
      var pane = row.closest('[id^="pane-"]'); if (!pane) return;
      var route = Object.keys(ROUTE_FILE).filter(function (r) { return pane.id.indexOf('pane-' + r.replace(/ /g, '-') + '-') === 0; })[0];
      if (!route) return;
      row.appendChild(mkBtn('Load from Freyr', function () { loadRoute(route); }));
      row.appendChild(controls('route'));
      paintAll();
    });
  }

  loadIndex();
  setInterval(ensureUi, 1500);
  setInterval(loadIndex, 5 * 60 * 1000);
})();
