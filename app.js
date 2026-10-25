const STORAGE_KEY = 'lian-ke-fitness-v1';
const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
const seed = {
  exercises: [
    { id:'bench', name:'杠铃卧推', group:'胸部', equipment:'杠铃', type:'重量 × 次数', icon:'▰' },
    { id:'row', name:'坐姿划船', group:'背部', equipment:'器械', type:'重量 × 次数', icon:'↔' },
    { id:'squat', name:'高脚杯深蹲', group:'腿部', equipment:'壶铃', type:'重量 × 次数', icon:'◒' },
    { id:'press', name:'哑铃肩推', group:'肩部', equipment:'哑铃', type:'重量 × 次数', icon:'↥' },
    { id:'plank', name:'平板支撑', group:'核心', equipment:'自重', type:'时长', icon:'—' },
    { id:'run', name:'跑步机快走', group:'有氧', equipment:'跑步机', type:'时长', icon:'⌁' }
  ],
  routines: [
    { id:'push', name:'上肢力量 A', subtitle:'胸部 · 肩部 · 三头', duration:45, days:[1,4], exercises:[['bench',3,8],['press',3,10]] },
    { id:'pull', name:'背部与核心', subtitle:'背部 · 核心', duration:40, days:[2,5], exercises:[['row',4,10],['plank',3,45]] },
    { id:'legs', name:'下肢力量', subtitle:'腿部 · 臀部', duration:50, days:[3,6], exercises:[['squat',4,8]] }
  ],
  sessions: [],
  bodyMetrics: [],
  theme: 'dark',
  settings: { weekStart:1, defaultRest:90, selectedRoutineId:null }
};

let state = loadState();
let view = 'home';
let activeWorkout = null;
let ticker = null;
let modalContext = null;
let routinePickerDraft = null;
let renderedView = null;
let navigationParent = null;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return structuredClone(seed);
    return { ...structuredClone(seed), ...saved, settings: { ...seed.settings, ...(saved.settings || {}) }, bodyMetrics: saved.bodyMetrics || [], theme: saved.theme || 'dark' };
  } catch (_) { return structuredClone(seed); }
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function today() { return new Date(); }
function dateKey(date = today()) { const y=date.getFullYear(); const m=String(date.getMonth()+1).padStart(2,'0'); const d=String(date.getDate()).padStart(2,'0'); return `${y}-${m}-${d}`; }
function fmtDuration(seconds) { const m = Math.max(0, Math.floor(seconds / 60)); const s = Math.max(0, seconds % 60); return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; }
function fmtDate(iso) { return new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric'}).format(new Date(iso)); }
function exerciseById(id) { return state.exercises.find(e => e.id === id); }
function routineForDay(day = today().getDay()) { const selected = state.routines.find(r => r.id === state.settings.selectedRoutineId); return selected || state.routines.find(r => r.days.includes(day)) || state.routines[0]; }
function lastSessionForGroup(group) {
  return state.sessions.find(s => s.groups?.includes(group));
}
function recommendationReason(routine) {
  const day = today().getDay();
  const last = state.sessions[0];
  if (!last) return `今天是周${dayNames[day]}，从你的训练轮换开始。`;
  const daysSince = Math.floor((today() - new Date(last.startedAt)) / 86400000);
  return daysSince >= 2 ? `距离上次训练 ${daysSince} 天，身体已经有足够恢复时间。` : `沿用本周轮换，保持训练节奏。`;
}
function completedCount() { return state.sessions.length; }
function totalMinutes() { return Math.round(state.sessions.reduce((sum,s) => sum + (s.duration || 0), 0) / 60); }
function completedDayCount() { return new Set(state.sessions.map(s => dateKey(new Date(s.startedAt)))).size; }
function latestMetric() { return [...state.bodyMetrics].sort((a,b) => b.date.localeCompare(a.date))[0] || null; }
function metricForToday() { return state.bodyMetrics.find(m => m.date === dateKey()) || null; }
function applyTheme() { document.documentElement.dataset.theme = state.theme; const meta=document.querySelector('meta[name="theme-color"]'); if(meta) meta.content = state.theme === 'light' ? '#f2f2f7' : '#0b0d12'; }

function render() {
  const viewChanged = renderedView !== view;
  const topbar = document.querySelector('.topbar');
  if (topbar) topbar.classList.toggle('subpage-hidden', view !== 'me');
  const isSubpage = ['settings', 'calendar', 'workout'].includes(view) || Boolean(navigationParent);
  document.body.dataset.view = view;
  document.querySelector('.app-shell')?.classList.toggle('is-subpage', isSubpage);
  document.querySelector('.tabbar')?.classList.toggle('is-hidden', isSubpage);
  document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.view === view));
  const app = document.querySelector('#app');
  if (view === 'home') app.innerHTML = renderHome();
  if (view === 'workout') app.innerHTML = renderWorkout();
  if (view === 'plans') app.innerHTML = renderPlans();
  if (view === 'exercises') app.innerHTML = renderExercises();
  if (view === 'me') app.innerHTML = renderMe();
  if (view === 'settings') app.innerHTML = renderSettings();
  if (view === 'calendar') app.innerHTML = renderCalendarPage();
  if (viewChanged) {
    app.classList.remove('page-enter');
    void app.offsetWidth;
    app.classList.add('page-enter');
    window.scrollTo(0, 0);
  }
  renderedView = view;
  bindViewEvents();
}

function renderHome() {
  const routine = routineForDay();
  const day = today().getDay();
  const isActive = Boolean(activeWorkout);
  return `
    <section class="hero">
      <div class="eyebrow green">${today().toLocaleDateString('zh-CN',{weekday:'long',month:'long',day:'numeric'})}</div>
      <h1>${isActive ? '训练还在继续。' : '今日训练'}</h1>
      <p>${isActive ? '回到训练页面，完成剩下的动作。每一组都算数。' : recommendationReason(routine)}</p>
      <div class="hero-meta"><span class="pill accent">今日推荐</span><span class="pill">${routine.name}</span><span class="pill">约 ${routine.duration} 分钟</span></div>
      <button class="primary-button" data-action="${isActive ? 'resume' : 'start'}">${isActive ? '继续训练 →' : '开始训练 →'}</button>
    </section>
    <div class="section-head"><div><h2>本周节奏</h2><p>按你的计划自动排布</p></div><button class="ghost-button" data-view="plans">查看计划</button></div>
    <div class="calendar-strip">${renderWeekStrip(day)}</div>
    <div class="section-head"><div><h2>你的状态</h2><p>只记录真正重要的进步</p></div></div>
    <div class="stat-grid"><div class="stat-card"><strong>${completedDayCount()}</strong><span>已累计打卡天数</span></div><div class="stat-card"><strong>${totalMinutes()}</strong><span>累计训练时长（分钟）</span></div><div class="stat-card"><strong>${state.exercises.length}</strong><span>动作收藏</span></div></div>
    <div class="section-head"><div><h2>下一次训练</h2><p>保持轻盈，也保持持续</p></div></div>
    <div class="routine-card clickable" data-view="plans"><div class="routine-icon">${routine.name.slice(0,1)}</div><div><h3>${routine.name}</h3><p>${routine.subtitle} · ${routine.exercises.length} 个动作</p><div class="tag-row">${routine.exercises.map(([id]) => `<span class="tag">${exerciseById(id)?.name || '动作'}</span>`).join('')}</div></div><button class="secondary-button push-right" data-action="start">开始</button></div>
    <div class="section-head"><div><h2>小提示</h2></div></div>
    <div class="install-tip">把健身管家添加到 iPhone 主屏幕后，它会像普通 App 一样全屏打开；数据会保存在这台设备的浏览器里。</div>`;
}
function renderWeekStrip(activeDay) {
  return Array.from({length:7}, (_,i) => {
    const d = new Date(today()); d.setDate(today().getDate() - today().getDay() + i);
    const day = d.getDay(); const done = state.sessions.some(s => dateKey(new Date(s.startedAt)) === dateKey(d));
    return `<div class="day ${day===activeDay?'active':''} ${done?'done':''}"><span>周${dayNames[day]}</span><strong>${d.getDate()}</strong></div>`;
  }).join('');
}

function startWorkout() {
  const routine = routineForDay();
  activeWorkout = { id:`live-${Date.now()}`, routineId:routine.id, startedAt:new Date().toISOString(), paused:false, exercises:routine.exercises.map(([id,sets,reps]) => ({ exerciseId:id, sets:Array.from({length:sets},()=>({weight:'', reps:String(reps), done:false})) })) };
  view = 'workout'; render();
}
function renderWorkout() {
  if (!activeWorkout) return `<section class="workout-page"><div class="subpage-head"><button class="back-button icon-back" data-view="home" aria-label="返回首页"><span aria-hidden="true">‹</span></button><div class="subpage-title"><div class="eyebrow green">WORKOUT</div><h1>训练</h1></div></div><div class="empty">当前没有进行中的训练。<br><br><button class="primary-button" data-action="start">开始今天训练</button></div></section>`;
  const routine = state.routines.find(r=>r.id===activeWorkout.routineId) || routineForDay();
  const elapsed = activeWorkout.paused ? activeWorkout.elapsed : Math.floor((Date.now()-new Date(activeWorkout.startedAt))/1000);
  return `<section class="workout-page"><div class="workout-top"><button class="back-button icon-back" data-view="home" aria-label="返回首页"><span aria-hidden="true">‹</span></button><div class="workout-nav-title"><strong>训练中</strong><small>${routine.name}</small></div><span class="status-pill"><i></i>进行中</span></div>
    <div class="timer"><small>${routine.name}</small><strong id="live-timer">${fmtDuration(elapsed)}</strong><div class="timer-actions"><button class="secondary-button" data-action="pause">${activeWorkout.paused?'继续计时':'暂停计时'}</button><button class="secondary-button cancel-button" data-action="cancel">取消训练</button><button class="primary-button" data-action="finish">完成训练</button></div></div>
    ${activeWorkout.exercises.map((item,index)=>renderActiveExercise(item,index)).join('')}
    <button class="secondary-button add-exercise-button" data-action="add-live-exercise">＋ 添加动作</button></section>`;
}
function renderActiveExercise(item,index) {
  const ex = exerciseById(item.exerciseId) || {name:'未命名动作',group:'自定义',equipment:'',type:''};
  return `<article class="exercise-card"><div class="exercise-head"><div><h3>${index+1}. ${ex.name}</h3><p>${ex.group} · ${ex.equipment} · ${ex.type}</p></div><button class="ghost-button" data-action="remove-live-exercise" data-index="${index}">移除</button></div><div class="set-table">${item.sets.map((set,setIndex)=>`<div class="set-row"><span>${String(setIndex+1).padStart(2,'0')}</span><input data-field="weight" data-ex="${index}" data-set="${setIndex}" placeholder="重量" value="${set.weight}" inputmode="decimal"><input data-field="reps" data-ex="${index}" data-set="${setIndex}" placeholder="次数/秒" value="${set.reps}" inputmode="decimal"><button class="check ${set.done?'checked':''}" data-action="toggle-set" data-ex="${index}" data-set="${setIndex}">${set.done?'✓':'○'}</button></div>`).join('')}</div><div class="card-footer"><span class="tag lime">${item.sets.filter(s=>s.done).length}/${item.sets.length} 已完成</span><button class="ghost-button" data-action="add-set" data-ex="${index}">＋ 加一组</button></div></article>`;
}

function renderPlans() {
  const head = navigationParent ? renderSubpageHead('训练计划', 'YOUR PROGRAMS', navigationParent, `返回${navigationParent === 'me' ? '我的' : '首页'}`) : `<header class="tab-page-head"><div><div class="eyebrow green">YOUR PROGRAMS</div><h1>训练计划</h1><p>把想做的训练排进生活</p></div><button class="primary-button" data-action="new-routine">＋ 新建</button></header>`;
  return `${head}${navigationParent ? `<div class="subpage-action-row"><p>把想做的训练排进生活</p><button class="primary-button" data-action="new-routine">＋ 新建</button></div>` : ''}
    ${state.routines.map(r=>`<article class="plan-card"><header><div><h3>${r.name}</h3><p>${r.subtitle} · 每次约 ${r.duration} 分钟</p></div><button class="ghost-button" data-action="start-routine" data-id="${r.id}">开始 →</button></header><div class="week-row">${dayNames.slice(1).concat(dayNames[0]).map((name,index)=>{ const day=(index+1)%7; const hit=r.days.includes(day); return `<div class="week-day ${hit?'training':''}"><small>周${name}</small><span>${hit?'训练':'休息'}</span></div>`; }).join('')}</div><div class="tag-row">${r.exercises.map(([id,sets,reps])=>`<span class="tag">${exerciseById(id)?.name || '动作'} · ${sets}×${reps}</span>`).join('')}</div></article>`).join('')}`;
}

function renderExercises() {
  const head = navigationParent ? renderSubpageHead('动作库', 'MOVEMENT LIBRARY', navigationParent, `返回${navigationParent === 'me' ? '我的' : '首页'}`) : `<header class="tab-page-head"><div><div class="eyebrow green">MOVEMENT LIBRARY</div><h1>动作库</h1><p>${state.exercises.length} 个动作 · 可自由扩展</p></div><button class="primary-button" data-action="new-exercise">＋ 新动作</button></header>`;
  return `${head}${navigationParent ? `<div class="subpage-action-row"><p>${state.exercises.length} 个动作 · 可自由扩展</p><button class="primary-button" data-action="new-exercise">＋ 新动作</button></div>` : ''}<div class="search-box"><span>⌕</span><input id="exercise-search" placeholder="搜索动作、肌群或器械"></div><div class="exercise-list" id="exercise-list">${renderExerciseRows(state.exercises)}</div>`;
}
function renderExerciseRows(list) { return list.map(ex=>`<div class="library-row"><div class="library-icon">${ex.icon || '＋'}</div><div><h3>${ex.name}</h3><p>${ex.group} · ${ex.equipment} · ${ex.type}</p></div><button class="ghost-button push-right" data-action="show-exercise" data-id="${ex.id}">详情</button></div>`).join(''); }

function renderMe() {
  return `<section class="profile-card"><div class="profile-avatar">我</div><div class="profile-copy"><div class="eyebrow green">MY TRAINING SPACE</div><h1>我的</h1><p>管理你的训练记录、身体数据和偏好。</p></div><button class="secondary-button" data-view="settings">设置</button></section>
    <div class="stat-grid profile-stats"><div class="stat-card clickable" data-view="calendar"><strong>${completedDayCount()}</strong><span>已累计打卡天数</span><small>查看健身日期</small></div><div class="stat-card"><strong>${totalMinutes()}</strong><span>累计训练时长（分钟）</span><small>完成训练自动累计</small></div><div class="stat-card clickable" data-view="plans"><strong>${state.routines.length}</strong><span>训练计划</span><small>查看计划方案</small></div></div>
    ${renderBodyMetrics()}
    ${renderHistorySection()}`;
}

function renderBodyMetrics() {
  const current = latestMetric();
  const todayMetric = metricForToday();
  const rows = [...state.bodyMetrics].sort((a,b) => b.date.localeCompare(a.date));
  return `<div class="section-head"><div><h2>身体数据</h2><p>每天最多记录一次，保留变化轨迹</p></div><button class="primary-button" data-action="update-metrics">${todayMetric ? '今天已记录' : '更新数据'}</button></div><div class="metric-card"><div><span>身高</span><strong>${current?.height ?? '--'}<small> cm</small></strong></div><div><span>体重</span><strong>${current?.weight ?? '--'}<small> kg</small></strong></div><div class="metric-note">${current ? `最近更新 ${current.date}` : '还没有身体数据'}</div></div>${rows.length ? `<div class="metric-history">${rows.map(m=>`<div class="metric-row"><div><strong>${m.date}</strong><small>身高 ${m.height} cm · 体重 ${m.weight} kg</small></div><button class="delete-button" data-action="delete-metric" data-id="${m.id}">删除</button></div>`).join('')}</div>` : ''}`;
}

function renderSettings() {
  const selected = state.routines.find(r => r.id === state.settings.selectedRoutineId);
  return `${renderSubpageHead('设置', 'PREFERENCES', 'me', '返回我的')} 
    <div class="section-head"><div><h2>外观</h2><p>选择你喜欢的显示方式</p></div></div><div class="theme-switch"><button class="theme-option ${state.theme==='light'?'selected':''}" data-action="theme-light">☀️ 浅色</button><button class="theme-option ${state.theme==='dark'?'selected':''}" data-action="theme-dark">🌙 深色</button></div>
    <div class="section-head"><div><h2>训练计划</h2><p>选择一个已设置好的方案作为今日推荐</p></div></div><div class="settings-list"><button class="settings-row" data-action="open-routine-picker"><span class="settings-icon">▤</span><span><strong>${selected ? selected.name : '选择训练计划'}</strong><small>${selected ? `${selected.subtitle} · 每次约 ${selected.duration} 分钟` : '点击后选择已有训练方案'}</small></span><b>›</b></button></div>
    <div class="section-head"><div><h2>数据与账号</h2><p>同步、备份和数据迁移</p></div></div><div class="settings-list"><button class="settings-row" data-action="show-sync"><span class="settings-icon">☁</span><span><strong>账号与同步</strong><small>当前仅保存在本机，登录同步即将接入</small></span><b>›</b></button><button class="settings-row" data-action="export-training"><span class="settings-icon">↗</span><span><strong>导出训练数据</strong><small>只导出训练记录、动作组和训练时长</small></span><b>›</b></button><button class="settings-row" data-action="export-all"><span class="settings-icon">⇩</span><span><strong>导出全部数据</strong><small>包含动作、计划、身体数据和训练记录</small></span><b>›</b></button></div>
    <div class="section-head"><div><h2>关于</h2><p>健身管家</p></div></div><div class="about-card"><strong>健身管家 1.0</strong><p>移动端 PWA 原型。你的训练数据优先保存在本机，后续可接入账号同步。</p></div>`;
}

function renderSubpageHead(title, eyebrow, backView = 'me', backLabel = '返回') {
  return `<header class="subpage-head"><button class="back-button icon-back" data-view="${backView}" aria-label="${backLabel}"><span aria-hidden="true">‹</span></button><div class="subpage-title"><div class="eyebrow green">${eyebrow}</div><h1>${title}</h1></div></header>`;
}

function renderCalendarPage() {
  return `${renderSubpageHead('健身日期', 'WORKOUT CALENDAR', 'me', '返回我的')}${renderFitnessCalendar()}`;
}

function renderFitnessCalendar() {
  const current = today();
  const year = current.getFullYear();
  const month = current.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const trained = new Set(state.sessions.map(s => dateKey(new Date(s.startedAt))));
  const cells = [];
  for (let i=0; i<firstDay; i++) cells.push('<div class="calendar-cell empty-cell"></div>');
  for (let day=1; day<=daysInMonth; day++) {
    const d = new Date(year, month, day);
    const key = dateKey(d);
    cells.push(`<div class="calendar-cell ${trained.has(key)?'trained':''} ${key===dateKey(current)?'today-cell':''}"><span>${day}</span>${trained.has(key)?'<b>✓</b>':''}</div>`);
  }
  return `<section class="calendar-card"><div class="calendar-title"><div><h2>${year} 年 ${month+1} 月</h2><p>绿色日期代表已完成训练</p></div><span class="calendar-total">${completedDayCount()} 天</span></div><div class="calendar-weekdays">${['日','一','二','三','四','五','六'].map(d=>`<span>周${d}</span>`).join('')}</div><div class="calendar-grid">${cells.join('')}</div></section><div class="install-tip">训练完成后，日期会自动标记为绿色。删除训练记录后，对应日期的标记也会消失。</div>`;
}

function renderHistorySection() {
  const sessions = state.sessions;
  return `<div class="section-head"><div><div class="eyebrow green">TRAINING LOG</div><h2>训练历史</h2><p>每一次完成都会留下痕迹</p></div></div><div class="history-hero"><div><strong>${totalMinutes()}<small style="font-size:14px"> min</small></strong><span>累计训练时长</span></div><div class="bars">${[20,35,28,50,42,60,48].map((h,i)=>`<div class="bar ${i===6?'hot':''}" style="height:${h}px"></div>`).join('')}</div></div><div class="section-head"><div><h2>最近训练</h2><p>${sessions.length ? `最近 ${sessions.length} 次记录` : '开始第一次训练吧'}</p></div></div>${sessions.length ? sessions.map(s=>`<div class="session-row"><div><h3>${s.name}</h3><p>${fmtDate(s.startedAt)} · ${s.exerciseCount} 个动作 · ${s.groups.join(' · ')}</p></div><div style="display:flex;align-items:center"><strong>${fmtDuration(s.duration)}</strong><button class="delete-button" data-action="delete-session" data-id="${s.id}" aria-label="删除这条训练记录">×</button></div></div>`).join('') : '<div class="empty">还没有训练记录。完成第一次训练后，这里会出现你的节奏。</div>'}`;
}

function showModal(type) {
  const root = document.querySelector('#modal-root');
  if (type === 'exercise') root.innerHTML = `<div class="modal-backdrop" data-action="close-modal"><form class="modal" id="exercise-form" data-action="save-exercise"><h2>添加自定义动作</h2><p>动作会立刻出现在动作库，也可以加入任何训练模板。</p><div class="field"><label>动作名称</label><input name="name" placeholder="例如：单臂绳索下压" required></div><div class="field"><label>所属肌群</label><select name="group"><option>胸部</option><option>背部</option><option>肩部</option><option>腿部</option><option>手臂</option><option>核心</option><option>有氧</option><option>自定义</option></select></div><div class="field"><label>器械</label><input name="equipment" placeholder="例如：绳索器械"></div><div class="field"><label>记录类型</label><select name="type"><option>重量 × 次数</option><option>徒手 × 次数</option><option>时长</option><option>距离</option></select></div><div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">取消</button><button class="primary-button">保存动作</button></div></form></div>`;
  if (type === 'routine') root.innerHTML = `<div class="modal-backdrop" data-action="close-modal"><form class="modal" id="routine-form" data-action="save-routine"><h2>新建训练模板</h2><p>先用一个简单模板开始，之后可以继续扩展。</p><div class="field"><label>模板名称</label><input name="name" placeholder="例如：周末全身训练" required></div><div class="field"><label>训练时长（分钟）</label><input name="duration" type="number" value="45" min="10"></div><div class="field"><label>训练日</label><select name="day"><option value="1">周一</option><option value="2">周二</option><option value="3">周三</option><option value="4">周四</option><option value="5">周五</option><option value="6">周六</option><option value="0">周日</option></select></div><div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">取消</button><button class="primary-button">创建模板</button></div></form></div>`;
  if (type === 'sync') root.innerHTML = `<div class="modal-backdrop" data-action="close-modal"><div class="modal"><h2>账号与同步</h2><p>当前版本先把训练数据保存在本机。下一阶段会接入邮箱登录、云端备份和多设备同步。</p><div class="install-tip">在设置里可以导出训练数据或全部数据。登录同步后，动作、计划、身体数据和训练记录会按账号隔离。</div><div class="modal-actions"><button class="primary-button" data-action="close-modal">知道了</button></div></div></div>`;
  if (type === 'rules') root.innerHTML = `<div class="modal-backdrop" data-action="close-modal"><form class="modal" id="rules-form" data-action="save-rules"><h2>训练偏好</h2><p>这些设置会影响训练中计时和后续推荐。</p><div class="field"><label>默认组间休息</label><select name="defaultRest"><option value="60" ${state.settings.defaultRest===60?'selected':''}>60 秒</option><option value="90" ${state.settings.defaultRest===90?'selected':''}>90 秒</option><option value="120" ${state.settings.defaultRest===120?'selected':''}>120 秒</option><option value="180" ${state.settings.defaultRest===180?'selected':''}>180 秒</option></select></div><div class="field"><label>每周起始日</label><select name="weekStart"><option value="1" ${state.settings.weekStart===1?'selected':''}>周一</option><option value="0" ${state.settings.weekStart===0?'selected':''}>周日</option></select></div><div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">取消</button><button class="primary-button">保存设置</button></div></form></div>`;
  if (type === 'routine-picker') root.innerHTML = `<div class="modal-backdrop" data-action="close-modal"><div class="modal"><h2>选择训练计划</h2><p>点选方案后会保留在此页面；点击弹窗外空白区域保存。</p><div class="picker-list">${state.routines.map(r=>`<button class="picker-row ${r.id===routinePickerDraft?'selected-row':''}" data-action="select-routine" data-id="${r.id}"><span class="settings-icon">${r.id===routinePickerDraft?'✓':'▤'}</span><span><strong>${r.name}</strong><small>${r.subtitle} · 每次约 ${r.duration} 分钟</small></span><b>${r.id===routinePickerDraft?'已选':'选择'}</b></button>`).join('')}</div><div class="modal-actions"><button class="secondary-button" data-action="close-modal">取消</button></div></div></div>`;
  if (type === 'metrics') {
    const current = latestMetric();
    const todayMetric = metricForToday();
    root.innerHTML = `<div class="modal-backdrop" data-action="close-modal"><form class="modal" id="metrics-form" data-action="save-metrics"><h2>更新身体数据</h2><p>${todayMetric ? '今天已经更新过一次。删除今天的记录后，才可以重新记录。' : '每天只能保存一次，提交前会再次确认。'}</p><div class="field"><label>身高（cm）</label><input name="height" type="number" min="1" step="0.1" value="${current?.height ?? ''}" placeholder="例如 175" required></div><div class="field"><label>体重（kg）</label><input name="weight" type="number" min="1" step="0.1" value="${current?.weight ?? ''}" placeholder="例如 70" required></div><div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">取消</button><button class="primary-button" ${todayMetric?'disabled':''}>${todayMetric?'今天已记录':'保存数据'}</button></div></form></div>`;
  }
}

function finishWorkout() {
  if (!activeWorkout) return;
  const elapsed = activeWorkout.paused ? activeWorkout.elapsed : Math.floor((Date.now()-new Date(activeWorkout.startedAt))/1000);
  const routine = state.routines.find(r=>r.id===activeWorkout.routineId) || routineForDay();
  const groups = [...new Set(activeWorkout.exercises.map(i=>exerciseById(i.exerciseId)?.group).filter(Boolean))];
  state.sessions.unshift({id:Date.now(), name:routine.name, startedAt:activeWorkout.startedAt, duration:elapsed, exerciseCount:activeWorkout.exercises.length, groups, exercises:clone(activeWorkout.exercises)});
  saveState(); activeWorkout = null; if(ticker) clearInterval(ticker); navigationParent=null; view='me'; render();
}
function cancelWorkout() {
  if (!activeWorkout) return;
  if (!window.confirm('确定取消这次训练吗？本次未完成的记录不会进入历史。')) return;
  activeWorkout = null;
  if (ticker) clearInterval(ticker);
  ticker = null;
  navigationParent = null;
  view = 'home';
  render();
}
function bindViewEvents() {
  const search = document.querySelector('#exercise-search');
  if (search) search.addEventListener('input', e => { const q=e.target.value.trim().toLowerCase(); document.querySelector('#exercise-list').innerHTML=renderExerciseRows(state.exercises.filter(ex=>`${ex.name}${ex.group}${ex.equipment}`.toLowerCase().includes(q))); });
  if (view === 'workout' && activeWorkout && !activeWorkout.paused) { if(ticker) clearInterval(ticker); ticker=setInterval(()=>{ const el=document.querySelector('#live-timer'); if(el) { const sec=Math.floor((Date.now()-new Date(activeWorkout.startedAt))/1000); el.textContent=fmtDuration(sec); } },1000); }
}

document.addEventListener('click', event => {
  const target = event.target.closest('[data-action], [data-view]'); if (!target) return;
  if (target.dataset.view) {
    const nextView = target.dataset.view;
    navigationParent = target.classList.contains('tab') || target.classList.contains('back-button') ? null : view;
    view = nextView;
    render();
    return;
  }
  const action=target.dataset.action;
  if (action==='start' || action==='resume') { if(!activeWorkout) startWorkout(); else {view='workout';render();} }
  if (action==='start-routine') { const r=state.routines.find(x=>x.id===target.dataset.id); if(r){ activeWorkout={id:`live-${Date.now()}`,routineId:r.id,startedAt:new Date().toISOString(),paused:false,exercises:r.exercises.map(([id,sets,reps])=>({exerciseId:id,sets:Array.from({length:sets},()=>({weight:'',reps:String(reps),done:false}))}))}; view='workout';render(); } }
  if (action==='finish') finishWorkout();
  if (action==='cancel') cancelWorkout();
  if (action==='delete-session') { const id=String(target.dataset.id); if(window.confirm('删除这条训练记录吗？删除后无法恢复。')) { state.sessions=state.sessions.filter(s=>String(s.id)!==id); saveState(); navigationParent=null; view='me'; render(); } }
  if (action==='pause') { if(activeWorkout.paused){activeWorkout.startedAt=new Date(Date.now()-activeWorkout.elapsed*1000).toISOString(); activeWorkout.paused=false;} else {activeWorkout.elapsed=Math.floor((Date.now()-new Date(activeWorkout.startedAt))/1000);activeWorkout.paused=true;} render(); }
  if (action==='toggle-set') { const s=activeWorkout.exercises[+target.dataset.ex].sets[+target.dataset.set]; s.done=!s.done; saveState(); render(); }
  if (action==='add-set') { const item=activeWorkout.exercises[+target.dataset.ex]; const prev=item.sets[item.sets.length-1]||{reps:'',weight:''}; item.sets.push({weight:prev.weight,reps:prev.reps,done:false}); render(); }
  if (action==='remove-live-exercise') { activeWorkout.exercises.splice(+target.dataset.index,1); render(); }
  if (action==='add-live-exercise') { modalContext='live'; showModal('exercise'); }
  if (action==='new-exercise') { modalContext=null; showModal('exercise'); }
  if (action==='new-routine') showModal('routine');
  if (action==='show-sync') showModal('sync');
  if (action==='show-rules') showModal('rules');
  if (action==='open-routine-picker') { modalContext='routine-picker'; routinePickerDraft=state.settings.selectedRoutineId; showModal('routine-picker'); }
  if (action==='select-routine' && modalContext==='routine-picker') { routinePickerDraft=target.dataset.id; showModal('routine-picker'); }
  if (action==='update-metrics') showModal('metrics');
  if (action==='delete-metric') { const id=String(target.dataset.id); if(window.confirm('删除这条身体数据吗？删除后无法恢复。')) { state.bodyMetrics=state.bodyMetrics.filter(m=>String(m.id)!==id); saveState(); render(); } }
  if (action==='theme-light' || action==='theme-dark') { state.theme=action==='theme-light'?'light':'dark'; saveState(); applyTheme(); render(); }
  if (action==='export-training') exportTrainingData();
  if (action==='export-all') exportAllData();
  if (action==='close-modal') {
    if (target.classList.contains('modal-backdrop') && event.target !== target) return;
    let refreshSettings=false;
    if (modalContext==='routine-picker') {
      if (target.classList.contains('modal-backdrop') && event.target === target) { state.settings.selectedRoutineId=routinePickerDraft; saveState(); refreshSettings=true; }
      routinePickerDraft=null;
      modalContext=null;
    }
    document.querySelector('#modal-root').innerHTML='';
    if (refreshSettings) { view='settings'; render(); }
  }
  if (action==='export') exportData();
});
document.addEventListener('input', event => { const el=event.target; if(!el.matches('[data-field]') || !activeWorkout) return; const set=activeWorkout.exercises[+el.dataset.ex].sets[+el.dataset.set]; set[el.dataset.field]=el.value; });
document.addEventListener('submit', event => {
  const form=event.target; if(!form.dataset.action) return; event.preventDefault(); const data=Object.fromEntries(new FormData(form));
  if(form.dataset.action==='save-exercise'){ const id=`custom-${Date.now()}`; state.exercises.push({id,name:data.name,group:data.group,equipment:data.equipment||'未指定',type:data.type,icon:'＋'}); if(modalContext==='live' && activeWorkout) activeWorkout.exercises.push({exerciseId:id,sets:[{weight:'',reps:data.type==='时长'?'30':'10',done:false}]}); modalContext=null; saveState(); document.querySelector('#modal-root').innerHTML=''; view=activeWorkout?'workout':'exercises'; render(); }
  if(form.dataset.action==='save-routine'){ const id=`routine-${Date.now()}`; state.routines.push({id,name:data.name,subtitle:'自定义训练',duration:+data.duration||45,days:[+data.day],exercises:[[state.exercises[0].id,3,10]]}); saveState(); document.querySelector('#modal-root').innerHTML=''; view='plans'; render(); }
  if(form.dataset.action==='save-rules'){ state.settings.defaultRest=+data.defaultRest||90; state.settings.weekStart=+data.weekStart; saveState(); document.querySelector('#modal-root').innerHTML=''; navigationParent=null; view='me'; render(); }
  if(form.dataset.action==='save-metrics'){
    if(metricForToday()){ window.alert('今天已经记录过一次，请先删除今天的记录再重新保存。'); return; }
    const height=Number(data.height), weight=Number(data.weight);
    if(!height || !weight || height<=0 || weight<=0){ window.alert('请输入有效的身高和体重。'); return; }
    if(!window.confirm('保存后今天不能再次更新，确定保存当前数据吗？')) return;
    state.bodyMetrics.unshift({id:`metric-${Date.now()}`,date:dateKey(),height,weight,createdAt:new Date().toISOString()}); saveState(); document.querySelector('#modal-root').innerHTML=''; navigationParent=null; view='me'; render();
  }
});

function downloadJson(payload, filename){ const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a');a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url); }
function exportTrainingData(){ downloadJson({sessions:state.sessions, exercises:state.exercises, exportedAt:new Date().toISOString()}, `jianshen-guanjia-training-${dateKey()}.json`); }
function exportAllData(){ downloadJson(state, `jianshen-guanjia-backup-${dateKey()}.json`); }
function exportData(){ exportAllData(); }

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(()=>{}));
applyTheme();
render();
