(function () {
  const CFG = window.TEACHER_CONFIG || {};
  const api = window.TeacherApi;

  const $ = (id) => document.getElementById(id);

  const routes = {
    dashboard: { title: '教学驾驶舱', sub: '学生如何学习点线面与 AI 教师' },
    students: { title: '学生管理', sub: '学生列表与搜索' },
    plp: { title: '点线面分析', sub: '点 / 线 / 面互动使用情况' },
    ai: { title: 'AI 教师分析', sub: '学生提问情况' },
    teachers: { title: '教师管理', sub: '超级管理员：教师账号管理' },
    settings: { title: '系统设置', sub: '个人信息与退出' }
  };

  const navItems = [
    { key: 'dashboard', label: '驾驶舱', icon: '📊' },
    { key: 'students', label: '学生', icon: '👥' },
    { key: 'plp', label: '点线面', icon: '📐' },
    { key: 'ai', label: 'AI 教师', icon: '💬' },
    { key: 'teachers', label: '教师管理', icon: '🧑‍🏫', superOnly: true },
    { key: 'settings', label: '设置', icon: '⚙️' }
  ];

  let currentTeacher = null;

  function getToken() { return localStorage.getItem(CFG.tokenKey || 'hfjh_teacher_token') || ''; }
  function saveTeacher(t) { localStorage.setItem(CFG.teacherKey || 'hfjh_teacher_info', JSON.stringify(t)); currentTeacher = t; }
  function loadTeacher() {
    try { return JSON.parse(localStorage.getItem(CFG.teacherKey || 'hfjh_teacher_info') || 'null'); }
    catch (e) { return null; }
  }
  function clearSession() {
    localStorage.removeItem(CFG.tokenKey || 'hfjh_teacher_token');
    localStorage.removeItem(CFG.teacherKey || 'hfjh_teacher_info');
    currentTeacher = null;
  }

  function isSuper() {
    const t = currentTeacher || loadTeacher();
    return !!(t && t.role === 'super_admin');
  }

  async function handleLogin() {
    const u = ($('loginUsername').value || '').trim();
    const p = $('loginPassword').value;
    $('loginError').textContent = '';
    if (!u || !p) { $('loginError').textContent = '请输入账号和密码'; return; }
    $('loginBtn').disabled = true;
    $('loginBtn').textContent = '登录中…';
    try {
      const res = await api.login(u, p);
      if (res && res.ok && res.token) {
        localStorage.setItem(CFG.tokenKey || 'hfjh_teacher_token', res.token);
        saveTeacher(res.teacher);
        location.hash = '#/dashboard';
        showApp();
      } else {
        $('loginError').textContent = (res && res.msg) || '登录失败，请重试';
      }
    } catch (e) {
      showLoginError(e);
    } finally {
      $('loginBtn').disabled = false;
      $('loginBtn').textContent = '登 录';
    }
  }

  // 把错误渲染到登录页；网络类失败给出「先确认访问网关」的可点击引导
  function showLoginError(e) {
    const box = $('loginError');
    if (e && e.code === 'NETWORK' && e.gateway) {
      box.innerHTML = '登录失败：无法连接服务器。若为首次使用，请先 ' +
        '<a href="' + esc(e.gateway) + '" target="_blank" rel="noopener">点此确认访问</a>' +
        '，页面出现 JSON 提示后再回来登录。';
      return;
    }
    box.textContent = '登录失败：' + describeError(e);
  }

  async function handleLogout() {
    try { await api.logout(); } catch (e) {}
    clearSession();
    location.hash = '';
    showLogin();
  }

  function showLogin() {
    $('appView').classList.add('hidden');
    $('loginView').classList.remove('hidden');
  }

  function showApp() {
    $('loginView').classList.add('hidden');
    $('appView').classList.remove('hidden');
    renderSidebar();
    renderRoute();
  }

  function renderSidebar() {
    const nav = $('nav');
    nav.innerHTML = '';
    navItems.forEach((item) => {
      if (item.superOnly && !isSuper()) return;
      const btn = document.createElement('button');
      btn.className = 'nav-item';
      btn.textContent = item.icon + ' ' + item.label;
      if (item.key === currentHashKey()) btn.classList.add('active');
      btn.addEventListener('click', () => { location.hash = '#/' + item.key; });
      nav.appendChild(btn);
    });
    const t = currentTeacher || loadTeacher();
    $('teacherName').textContent = (t && t.name) || '教师';
    $('teacherRole').textContent = isSuper() ? '超级管理员' : '教师';
    $('avatarLetter').textContent = ((t && t.name) || 'T').slice(0, 1).toUpperCase();
  }

  function currentHashKey() {
    const h = location.hash.replace(/^#\//, '').split('?')[0];
    return routes[h] ? h : 'dashboard';
  }

  async function renderRoute() {
    const key = currentHashKey();
    const route = routes[key];
    $('pageTitle').textContent = route.title;
    $('pageSub').textContent = route.sub;
    if (key === 'teachers' && !isSuper()) { location.hash = '#/dashboard'; return; }

    const content = $('content');
    content.innerHTML = '';
    if (key === 'dashboard') await renderDashboard(content);
    else if (key === 'teachers') await renderTeachers(content);
    else if (key === 'students') await renderStudents(content);
    else if (key === 'plp') renderPlaceholder(content, '点线面分析');
    else if (key === 'ai') renderPlaceholder(content, 'AI 教师分析');
    else renderPlaceholder(content, '系统设置');
  }

  async function renderDashboard(container) {
    const dash = await api.dashboard();
    const d = (dash && dash.ok) ? dash : {};
    const cards = [
      { label: '学生总数', value: d.total_students || 0 },
      { label: '今日活跃', value: d.today_active_students || 0 },
      { label: '点线面今日', value: d.plp_today || 0 },
      { label: 'AI提问今日', value: d.ai_today || 0 }
    ];
    let html = '<div class="stat-grid">';
    cards.forEach((c) => {
      html += '<div class="stat-card"><div class="stat-num">' + c.value + '</div><div class="stat-label">' + c.label + '</div></div>';
    });
    html += '</div>';

    // 近 7 天趋势：按当周最大值等比缩放，避免数值大时柱子溢出卡片
    const trend = d.trend || [];
    const BAR_MAX = 150;
    const peak = trend.reduce((m, t) => Math.max(m, t.plp || 0, t.active || 0), 0);
    const barHeight = (v) => {
      const n = v || 0;
      if (n <= 0) return 0;
      if (peak <= 0) return 0;
      return Math.max(3, Math.round((n / peak) * BAR_MAX));
    };
    html += '<div class="card"><div class="card-title">近 7 天学习趋势</div>';
    if (!trend.length) {
      html += '<div class="chart-empty">暂无数据</div>';
    } else {
      html += '<div class="trend">';
      trend.forEach((t) => {
        html += '<div class="trend-item">' +
          '<div class="trend-bars">' +
            '<div class="bar plp" style="height:' + barHeight(t.plp) + 'px"></div>' +
            '<div class="bar active" style="height:' + barHeight(t.active) + 'px"></div>' +
          '</div>' +
          '<div class="trend-date">' + t.date + '</div>' +
        '</div>';
      });
      html += '</div><div class="trend-legend">' +
        '<span><span class="lg plp"></span>点线面</span>' +
        '<span><span class="lg active"></span>活跃人数</span>' +
        '</div>';
    }
    html += '</div>';
    container.innerHTML = html;
    if (!dash || !dash.ok) {
      container.insertAdjacentHTML('beforeend',
        '<div class="card" style="margin-top:16px;color:#e04444">' + ((dash && dash.msg) || '统计加载失败') + '</div>');
    }
  }

  // ---- 学生管理 ----
  const studentFilter = { keyword: '', school: '', class_name: '' };

  async function renderStudents(container) {
    container.innerHTML =
      '<div class="page-title">学生管理</div>' +
      '<div class="page-sub">共 <b id="stuTotal">--</b> 名学生（按姓名 / 学号 / 学校 / 班级管理）</div>' +
      '<div class="card">' +
        '<div class="filter-row">' +
          '<input id="stuKeyword" class="filter-input" placeholder="搜索姓名或学号" />' +
          '<select id="stuSchool" class="filter-select"></select>' +
          '<select id="stuClass" class="filter-select"></select>' +
          '<button id="stuSearch" class="login-btn filter-btn">搜索</button>' +
        '</div>' +
        '<table id="stuTable" style="width:100%;border-collapse:collapse"></table>' +
      '</div>';

    $('stuKeyword').value = studentFilter.keyword;
    $('stuSearch').addEventListener('click', () => {
      studentFilter.keyword = $('stuKeyword').value.trim();
      studentFilter.school = $('stuSchool').value;
      studentFilter.class_name = $('stuClass').value;
      loadStudents();
    });
    $('stuKeyword').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('stuSearch').click(); });
    $('stuSchool').addEventListener('change', () => $('stuSearch').click());
    $('stuClass').addEventListener('change', () => $('stuSearch').click());

    await loadStudents();
  }

  async function loadStudents() {
    const table = $('stuTable');
    if (!table) return;
    table.innerHTML = '<tr><td style="padding:16px;color:#6a7688">加载中…</td></tr>';

    const res = await api.listStudents(studentFilter);
    if (!res || !res.ok) {
      table.innerHTML = '<tr><td style="padding:16px;color:#e04444">' + ((res && res.msg) || '加载失败') + '</td></tr>';
      return;
    }

    fillSelect($('stuSchool'), res.schools || [], '全部学校', studentFilter.school);
    fillSelect($('stuClass'), res.classes || [], '全部班级', studentFilter.class_name);
    $('stuTotal').textContent = res.total;

    const items = res.items || [];
    let html = '<tr style="background:var(--panel-soft);text-align:left">' +
      '<th style="padding:10px">姓名</th><th>学号</th><th>学校</th><th>班级</th>' +
      '<th>注册时间</th><th>最近登录</th><th style="text-align:right">操作</th></tr>';

    items.forEach((s) => {
      const cls = s.class_name
        ? esc(s.class_name)
        : '<span style="color:#9aa5b2">未分班</span>';
      html += '<tr style="border-top:1px solid var(--border)">' +
        '<td style="padding:10px">' + esc(s.name) + '</td>' +
        '<td>' + esc(s.student_id) + '</td>' +
        '<td>' + esc(s.school) + '</td>' +
        '<td>' + cls + '</td>' +
        '<td style="color:#6a7688">' + fmtDate(s.created_at) + '</td>' +
        '<td style="color:#6a7688">' + fmtDate(s.last_login_at) + '</td>' +
        '<td style="text-align:right">' +
          '<button class="mini-btn" data-id="' + esc(s.id) + '" data-name="' + esc(s.name) +
          '" data-class="' + esc(s.class_name) + '">设置班级</button>' +
        '</td></tr>';
    });
    if (!items.length) {
      html += '<tr><td colspan="7" style="padding:26px;text-align:center;color:#9aa5b2">没有匹配的学生</td></tr>';
    }
    table.innerHTML = html;
    table.querySelectorAll('button[data-id]').forEach((btn) => {
      btn.addEventListener('click', () => editStudentClass(btn));
    });
  }

  function fillSelect(sel, options, allLabel, current) {
    if (!sel) return;
    let html = '<option value="">' + allLabel + '</option>';
    options.forEach((o) => {
      html += '<option value="' + esc(o) + '">' + esc(o) + '</option>';
    });
    if (current && options.indexOf(current) < 0) {
      html += '<option value="' + esc(current) + '">' + esc(current) + '</option>';
    }
    sel.innerHTML = html;
    sel.value = current || '';
  }

  async function editStudentClass(btn) {
    const id = btn.dataset.id;
    const name = btn.dataset.name;
    const current = btn.dataset.class || '';
    const value = prompt('为「' + name + '」设置班级（留空表示不设班级）：', current);
    if (value === null) return;
    const res = await api.updateStudent({ doc_id: id, class_name: value });
    if (res && res.ok) {
      await loadStudents();
    } else {
      alert((res && res.msg) || '保存失败');
    }
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso).slice(0, 10);
    const p = (n) => (n < 10 ? '0' + n : '' + n);
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function renderPlaceholder(container, name) {
    container.innerHTML = '<div class="card"><div class="placeholder"><div class="icon">🚧</div><div>「' + name + '」将在后续阶段实现</div></div></div>';
  }

  async function renderTeachers(container) {
    container.innerHTML =
      '<div class="page-title">教师管理</div>' +
      '<div class="page-sub">创建、编辑、停用、重置密码教师账号</div>' +
      '<div class="card">' +
        '<div style="margin-bottom:14px"><button id="addTeacherBtn" class="login-btn" style="width:auto;padding:9px 16px;margin-top:0">+ 新增教师</button></div>' +
        '<table id="teacherTable" style="width:100%;border-collapse:collapse"></table>' +
      '</div>';
    $('addTeacherBtn').addEventListener('click', () => openTeacherModal());
    await loadTeacherTable();
  }

  async function loadTeacherTable() {
    const table = $('teacherTable');
    try {
      const res = await api.listTeachers();
      if (!res || !res.ok) {
        table.innerHTML = '<tr><td style="padding:16px;color:#e04444">' + ((res && res.msg) || '加载失败') + '</td></tr>';
        return;
      }
      const items = res.items || [];
      let html = '<tr style="background:var(--panel-soft);text-align:left">' +
        '<th style="padding:10px">账号</th><th>姓名</th><th>角色</th><th>状态</th><th style="text-align:right">操作</th></tr>';
      items.forEach((t) => {
        const isSuperRow = t.role === 'super_admin';
        html += '<tr style="border-top:1px solid var(--border)">' +
          '<td style="padding:10px">' + esc(t.username) + '</td>' +
          '<td>' + esc(t.name) + '</td>' +
          '<td>' + (isSuperRow ? '超级管理员' : '教师') + '</td>' +
          '<td>' + (t.status === 'active' ? '<span style="color:#1a9a4b">启用</span>' : '<span style="color:#e04444">停用</span>') + '</td>' +
          '<td style="text-align:right">' +
            '<button class="mini-btn" data-op="reset" data-id="' + esc(t.id) + '">重置密码</button> ' +
            '<button class="mini-btn" data-op="toggle" data-id="' + esc(t.id) + '" data-status="' + esc(t.status) + '">' +
              (t.status === 'active' ? '停用' : '启用') + '</button> ' +
            (!isSuperRow ? '<button class="mini-btn danger" data-op="del" data-id="' + esc(t.id) + '">删除</button>' : '') +
          '</td></tr>';
      });
      table.innerHTML = html;
      table.querySelectorAll('button[data-op]').forEach((btn) => {
        btn.addEventListener('click', () => handleTeacherAction(btn));
      });
    } catch (e) {
      table.innerHTML = '<tr><td style="padding:16px;color:#e04444">加载失败：' + esc(e.message) + '</td></tr>';
    }
  }

  async function handleTeacherAction(btn) {
    const op = btn.dataset.op;
    const id = btn.dataset.id;
    if (op === 'reset') {
      const p = prompt('请输入新密码（至少6位）：');
      if (!p) return;
      const res = await api.updateTeacher({ teacher_id: id, password: p });
      alert((res && res.ok) ? '密码已重置' : ((res && res.msg) || '失败'));
      await loadTeacherTable();
    } else if (op === 'toggle') {
      const next = btn.dataset.status === 'active' ? 'inactive' : 'active';
      const res = await api.updateTeacher({ teacher_id: id, status: next });
      alert((res && res.ok) ? '已更新' : ((res && res.msg) || '失败'));
      await loadTeacherTable();
    } else if (op === 'del') {
      if (!confirm('确定删除该教师账号吗？')) return;
      const res = await api.deleteTeacher(id);
      alert((res && res.ok) ? '已删除' : ((res && res.msg) || '失败'));
      await loadTeacherTable();
    }
  }

  function openTeacherModal() {
    const username = prompt('请输入教师登录账号（唯一）：');
    if (!username) return;
    const name = prompt('请输入教师姓名：') || username;
    const password = prompt('请输入初始密码（至少6位）：');
    if (!password) return;
    const schoolName = prompt('请输入所属学校（可留空）：') || '';
    api.createTeacher({ username, name, password, school_name: schoolName }).then((res) => {
      alert((res && res.ok) ? '创建成功' : ((res && res.msg) || '创建失败'));
      loadTeacherTable();
    }).catch((e) => alert('创建失败：' + e.message));
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function describeError(e) {
    if (!e) return '未知错误';
    if (typeof e === 'string') return e;
    if (e.errMsg) return String(e.errMsg);
    if (e.message) return String(e.message);
    if (e.code) return String(e.code) + (e.msg ? '：' + e.msg : '');
    try { return JSON.stringify(e); } catch (err) { return '未知错误'; }
  }

  async function init() {
    $('loginBtn').addEventListener('click', handleLogin);
    $('loginPassword').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleLogin(); });
    $('logoutBtn').addEventListener('click', handleLogout);
    // 登录页底部的「确认访问」入口指向网关地址
    const gatewayLink = $('gatewayLink');
    if (gatewayLink && CFG.gatewayUrl) gatewayLink.href = CFG.gatewayUrl;
    window.addEventListener('hashchange', () => {
      if (!$('appView').classList.contains('hidden')) { renderSidebar(); renderRoute(); }
    });
    if (getToken()) {
      try {
        const res = await api.me();
        if (res && res.ok && res.teacher) {
          saveTeacher(res.teacher);
          showApp();
          return;
        }
      } catch (e) {}
      clearSession();
    }
    showLogin();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
