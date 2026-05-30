/* ===== Utilitários ===== */

var ws = null;
var currentSlide = 2;
var totalSlides = 4;
var _isDirty = false;
var _pendingAction = null;

/** Retorna x se não for nulo/vazio, senão fallback */
function v(x, fb) {
  return (x !== null && x !== undefined && x !== '') ? x : (fb !== undefined ? fb : '');
}

/** Escapa HTML para prevenir XSS — aplicar em todos os dados vindos do Excel */
function esc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function reEsc(s) {
  return String(s === null || s === undefined ? '' : s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Formata string de data ISO (ou Date) para o padrão dd/mmm/aa — ex.: 15/mai/26 */
function fmtDateShort(val) {
  if (!val) return '';
  var months = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  var d = null;
  if (val instanceof Date) {
    d = val;
  } else {
    var s = String(val).trim();
    var br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (br) {
      var dd = parseInt(br[1], 10);
      var mm = parseInt(br[2], 10) - 1;
      var yy = parseInt(br[3], 10);
      if (yy < 100) yy += 2000;
      d = new Date(Date.UTC(yy, mm, dd));
    } else {
      d = new Date(s);
    }
  }
  if (isNaN(d.getTime())) return String(val);
  var day   = String(d.getUTCDate()).padStart(2, '0');
  var month = months[d.getUTCMonth()];
  var year  = String(d.getUTCFullYear()).slice(-2);
  return day + '/' + month + '/' + year;
}

function markDirty() {
  _isDirty = true;
}

function clearDirty() {
  _isDirty = false;
}

function hasUnsavedChanges() {
  return editMode && _isDirty;
}

function confirmLoseUnsaved(contextLabel) {
  if (!hasUnsavedChanges()) return true;
  return confirm('Existem alterações não salvas (' + contextLabel + '). Deseja descartar e continuar?');
}

/**
 * Mapeia um valor de status/prioridade para uma classe CSS semântica.
 * Usa correspondências exatas ou prefixos para evitar colisões de substring.
 */
function sc(s) {
  var s2 = (s || '').toLowerCase().trim();

  // success / concluído / no prazo
  if (s2 === 'success' || s2 === 'no prazo' || s2 === 'ok' || s2 === 'resolved' ||
      s2 === 'concluído' || s2 === 'concluido' || s2.startsWith('conclu')) {
    return 'success';
  }

  // danger / crítico / atrasado
  if (s2 === 'danger' || s2 === 'p1' || s2 === 'atrasado' ||
      s2 === 'crítico' || s2 === 'critico' || s2 === 'critical') {
    return 'danger';
  }

  // warning / atenção / andamento
  if (s2 === 'warning' || s2 === 'p2' || s2 === 'p3' ||
      s2 === 'high' || s2 === 'medium' ||
      s2.includes('andamento') || s2.startsWith('aten') || s2 === 'em atenção' || s2 === 'em atencao') {
    return 'warning';
  }

  // gray / planejado / cancelado / outros status finais
  if (s2 === 'gray' || s2 === 'low' || s2 === 'p4' || s2 === 'planejado' ||
      s2 === 'pendente' || s2 === 'cancelado' || s2 === 'adiado' ||
      s2 === 'implementado' || s2 === 'aprovado' || s2 === 'rejeitado') {
    return 'gray';
  }

  return 'gray';
}

/* ===== Ícones SVG ===== */
var ICONS = {
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 9h18"/><path d="M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01"/></svg>',
  compass:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5 13 13l-4.5 2.5L11 11l4.5-2.5Z"/></svg>',
  progress: null,
  flag:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V3"/><path d="M5 3c4-2 7 3 14 0v11c-7 3-10-2-14 0"/></svg>',
  warning:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 20h20L12 3Z"/><path d="M12 9v4"/><circle cx="12" cy="17" r=".8" fill="currentColor" stroke="none"/></svg>',
  heart:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-8-5.5-8-10c0-3 2-5 5-5 2 0 3 1 3 1s1-1 3-1c3 0 5 2 5 5 0 4.5-8 10-8 10Z"/></svg>',
};

var MARCO_ICONS = {
  /* ── existentes ─────────────────────────────────────────────── */
  check:  '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-5"/></svg>',
  rocket: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 15c3-6 8-9 15-10-1 7-4 12-10 15l-5-5Z"/><path d="M7 17 4 20"/><circle cx="14" cy="10" r="1.6"/></svg>',
  gear:   '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 1 1 4.2 17l.1-.1A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 1 1 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.1a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>',
  star:   '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  /* ── novos ──────────────────────────────────────────────────── */
  /* flag   → Go-Live / marco de entrega */
  flag:   '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>',
  /* award  → Hypercare / encerramento com sucesso */
  award:  '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg>',
  /* shield → Gate de qualidade / UAT sign-off */
  shield: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  /* target → Objetivo / milestone estratégico */
  target: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
  /* zap    → Ativação / go-live técnico */
  zap:    '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  /* layers → Gate de fase / transição */
  layers: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
  /* users  → Marco de equipe / onboarding */
  users:  '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
};

/* ===== Carga de dados ===== */
async function loadData(force) {
  if (!force && hasUnsavedChanges() && !confirmLoseUnsaved('atualização')) return;
  try {
    var resp = await fetch('/api/status');
    var json = await resp.json();
    renderAll(json);
    if (!editMode) clearDirty();
  } catch (err) {
    document.querySelector('.page-shell').innerHTML =
      '<div style="padding:60px;text-align:center;color:var(--red-700)">' +
      '<h2>Erro ao carregar dados</h2><p>' + esc(err.message) + '</p></div>';
    document.body.style.opacity = '1';
  }
}

function connectWebSocket() {
  var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(proto + '//' + location.host + '/ws/status');
  ws.onmessage = function () {
    if (hasUnsavedChanges()) return;
    loadData(true);
  };
  ws.onclose   = function () { setTimeout(connectWebSocket, 3000); };
  ws.onerror   = function () { ws.close(); };
}

/* ===== Branding ===== */
function hexToRgb(hex) {
  return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
}
function rgbToHex(r,g,b) {
  return '#' + [r,g,b].map(function(x){ return Math.min(255,Math.max(0,Math.round(x))).toString(16).padStart(2,'0'); }).join('');
}
function darken(hex, factor) {
  var rgb = hexToRgb(hex);
  return rgbToHex(rgb[0]*factor, rgb[1]*factor, rgb[2]*factor);
}
function lighten(hex, factor) {
  var rgb = hexToRgb(hex);
  return rgbToHex(rgb[0]+(255-rgb[0])*factor, rgb[1]+(255-rgb[1])*factor, rgb[2]+(255-rgb[2])*factor);
}
function applyBranding(branding) {
  var primary   = (branding && branding.cor_primaria)   || '#2a7249';
  var secondary = (branding && branding.cor_secundaria) || darken(primary, 0.65);
  var root = document.documentElement;
  // Secondary drives the dark structural elements (topbar gradient, footer titles)
  root.style.setProperty('--green-950', darken(secondary, 0.72));
  root.style.setProperty('--green-900', secondary);
  root.style.setProperty('--green-850', lighten(secondary, 0.12));
  // Primary drives accents, icons, labels, chart lines
  root.style.setProperty('--green-800', primary);
  root.style.setProperty('--green-700', darken(primary, 0.85));
  root.style.setProperty('--green-600', lighten(primary, 0.15));
  root.style.setProperty('--green-500', lighten(primary, 0.30));
  root.style.setProperty('--green-100', lighten(primary, 0.88));
  var logoPath = (branding && branding.logo_path) || '';
  var img  = document.getElementById('logoImg');
  var mark = document.getElementById('logoMark');
  if (logoPath && img) {
    img.src = logoPath;
    if (mark) {
      mark.style.background    = 'rgba(255,255,255,0.95)';
      mark.style.borderRadius  = '10px';
      mark.style.padding       = '6px';
      mark.style.boxSizing     = 'border-box';
    }
  }
}

/* ===== Presentation Tokens ===== */
function applyPresentationConfig(pres) {
  pres = pres || {};
  var root = document.documentElement;
  var v = function (key, fallback) {
    var val = pres[key];
    return (val !== undefined && val !== null && String(val) !== '') ? String(val) : fallback;
  };
  var px = function (key, fallbackPx) {
    var raw = v(key, '');
    if (!raw) return fallbackPx;
    var s = String(raw).trim();
    if (/^\d+(\.\d+)?$/.test(s)) return s + 'px';
    return s;
  };
  root.style.setProperty('--p-font', v('font_family', "Inter, system-ui, -apple-system, sans-serif"));
  root.style.setProperty('--p-cover-hero-size', px('cover_hero_font_size', '88px'));
  root.style.setProperty('--p-cover-hero-lh', v('cover_hero_line_height', '1.02'));
  root.style.setProperty('--p-cover-sub-size', px('cover_subtitle_font_size', '24px'));
  root.style.setProperty('--p-cover-eyebrow-size', px('cover_eyebrow_font_size', '14px'));
  root.style.setProperty('--p-cover-meta-val-size', px('cover_meta_value_size', '22px'));
  root.style.setProperty('--p-cover-meta-lab-size', px('cover_meta_label_size', '11px'));
  root.style.setProperty('--p-alert-warning-bg', v('alert_warning_bg', '#e8c86a'));
  root.style.setProperty('--p-alert-warning-font', v('alert_warning_font', '#39420a'));
  root.style.setProperty('--p-alert-danger-bg', v('alert_danger_bg', '#c94a4a'));
  root.style.setProperty('--p-alert-success-bg', v('alert_success_bg', '#4a9a63'));
  root.style.setProperty('--p-slide-simple-bg', v('slide_simple_bg', '#f8fbfd'));
  root.style.setProperty('--p-chart-planned', v('chart_planned_color', '#3b5f85'));
  root.style.setProperty('--p-text-dark-primary', v('text_on_dark_primary', '#ffffff'));
  root.style.setProperty('--p-text-dark-secondary', v('text_on_dark_secondary', 'rgba(255,255,255,0.72)'));
  root.style.setProperty('--p-text-light-primary', v('text_on_light_primary', '#1e2228'));
  root.style.setProperty('--p-text-light-secondary', v('text_on_light_secondary', '#454b54'));
  root.style.setProperty('--p-font-size-alert', px('font_size_alert', '13px'));
  root.style.setProperty('--p-font-size-footer', px('font_size_footer', '12px'));
}

/* ===== Render principal ===== */
var _lastRenderData = null;   // para re-renderizar Curva S no resize

function renderAll(json) {
  _lastRenderData = json;
  var d = json.reportData || json.data || {};
  if (!d.config) return;
  var cfg = d.config;

  document.getElementById('projectTitle').textContent    = v(cfg.project_name, 'Projeto Executivo');
  document.getElementById('projectSubtitle').textContent = v(cfg.project_subtitle, '');
  document.title = v(cfg.report_title, 'Status Executivo do Projeto');

  applyBranding(d.branding || {});
  applyPresentationConfig(d.presentation_config || {});
  renderValidationErrors(json);
  renderAlert(cfg);
  renderTopInfo(cfg, d.curva_s || []);
  renderTimeline(d);
  renderKPIs(d);
  renderResumo(d);
  renderPendencias(d);
  renderAcoes(d);
  renderCurvaS(d);
  renderMarcos(d);
  renderRodape(d);
  renderDeckSlides(d);
  updateSlideView();

  // Revela o body após o branding e render estarem prontos (evita flash do tema padrão)
  document.body.style.transition = 'opacity 0.18s ease';
  document.body.style.opacity    = '1';

  // Sinaliza ao Playwright que o rendering está completo
  window.__renderComplete = true;
}

function setSlide(n) {
  currentSlide = Math.max(1, Math.min(totalSlides, n));
  updateSlideView();
}

function prevSlide() { setSlide(currentSlide - 1); }
function nextSlide() { setSlide(currentSlide + 1); }

function updateSlideView() {
  syncDeckHeights();
  for (var i = 1; i <= totalSlides; i++) {
    var el = document.getElementById('slide' + i);
    if (!el) continue;
    if (i === currentSlide) el.classList.add('active');
    else el.classList.remove('active');
  }
  var ind = document.getElementById('slideIndicator');
  if (ind) ind.textContent = 'Slide ' + currentSlide + '/' + totalSlides;
}

function syncDeckHeights() {
  var ref = document.getElementById('slide2');
  if (!ref) return;
  var h = ref.offsetHeight;
  if (!h) return;
  for (var i = 1; i <= totalSlides; i++) {
    if (i === 2) continue;
    var el = document.getElementById('slide' + i);
    if (el) el.style.height = h + 'px';
  }
}

/* ===== Gantt (Slide 3) ===== */

function parseDateBR(s) {
  if (!s) return null;
  var parts = String(s).trim().split('/');
  if (parts.length !== 3) return null;
  var d = parseInt(parts[0], 10);
  var m = parseInt(parts[1], 10) - 1;
  var y = parseInt(parts[2], 10);
  if (isNaN(d) || isNaN(m) || isNaN(y)) return null;
  var date = new Date(y, m, d);
  if (date.getFullYear() !== y || date.getMonth() !== m || date.getDate() !== d) return null;
  return date;
}

function addDays(date, days) {
  var result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function diffDays(a, b) {
  var ms = b.getTime() - a.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function formatMonthYear(d) {
  var meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return meses[d.getMonth()] + ' ' + d.getFullYear();
}

function formatShortDate(d) {
  var meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return d.getDate() + ' ' + meses[d.getMonth()];
}

function renderGantt(d) {
  var tarefas = d.gantt_tarefas || [];
  var ganttMarcos = d.gantt_marcos || [];
  var ganttCfg = d.gantt_config || {};
  var wrap = document.getElementById('ganttWrap');
  var empty = document.getElementById('ganttEmpty');
  var cards = document.getElementById('ganttPhaseCards');
  var canvas = document.getElementById('ganttCanvas');
  var svg = document.getElementById('ganttSvg');
  var legend = document.getElementById('ganttLegend');
  if (!wrap || !svg) return;

  var entries = [];
  var today = new Date();
  today.setHours(0,0,0,0);

  // Tarefas
  tarefas.forEach(function (t, idx) {
    var start = parseDateBR(t.inicio);
    var end = parseDateBR(t.fim);
    if (!end) return;
    if (!start) start = end;
    entries.push({
      type: 'task',
      name: v(t.nome, '-'),
      start: start,
      end: end,
      status: String(t.status || '').toLowerCase(),
      progress: parseInt(t.progresso) || 0,
      owner: v(t.owner, ''),
      code: v(t.id, ''),
      idx: idx,
    });
  });

  // Marcos
  ganttMarcos.forEach(function (m, idx) {
    var date = parseDateBR(m.data);
    if (!date) return;
    entries.push({
      type: 'milestone',
      name: v(m.nome, '-'),
      start: date,
      end: date,
      status: String(m.status || '').toLowerCase(),
      tipo: v(m.tipo, 'star'),
      idx: idx,
    });
  });

  if (!entries.length) {
    wrap.style.display = 'none';
    if (empty) empty.style.display = 'flex';
    if (legend) legend.innerHTML = '';
    if (cards) cards.innerHTML = '';
    return;
  }

  wrap.style.display = 'flex';
  if (empty) empty.style.display = 'none';

  // Range
  var minDate = entries[0].start;
  var maxDate = entries[0].end;
  entries.forEach(function (e) {
    if (e.start < minDate) minDate = e.start;
    if (e.end > maxDate) maxDate = e.end;
  });
  var startWindow = parseDateBR(ganttCfg.data_inicio_janela);
  var endWindow = parseDateBR(ganttCfg.data_fim_janela);
  if (startWindow) minDate = startWindow;
  if (endWindow) maxDate = endWindow;

  // Alinhar minDate para segunda-feira
  var startOffset = (minDate.getDay() + 6) % 7;
  minDate = addDays(minDate, -startOffset);
  // Alinhar maxDate para domingo (fim da semana)
  var endOffset = (7 - ((maxDate.getDay() + 6) % 7) - 1);
  maxDate = addDays(maxDate, endOffset);

  // Coletar dias úteis (seg-sex) e mapear posição
  function isWorkday(date) {
    var day = date.getDay();
    return day >= 1 && day <= 5;
  }

  var workdays = [];
  var cur = new Date(minDate);
  while (cur <= maxDate) {
    if (isWorkday(cur)) {
      workdays.push(new Date(cur));
    }
    cur = addDays(cur, 1);
  }
  var totalWorkdays = Math.max(workdays.length, 1);

  // weekStarts (segunderas) para cabeçalho
  var weekStarts = [];
  var wk = new Date(minDate);
  while (wk <= maxDate) {
    weekStarts.push(new Date(wk));
    wk = addDays(wk, 7);
  }

  // Config SVG
  var W = canvas ? Math.max(760, canvas.clientWidth - 2) : 1200;
  var H = 460;
  var headH = 55;
  var padB = 18;
  var padL = 12;
  var padR = 12;
  var chartW = W - padL - padR;
  var chartH = H - headH - padB;
  var rowH = Math.max(48, Math.floor(chartH / Math.max(entries.length, 1)));
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('preserveAspectRatio', 'xMinYMin meet');

  function workdayIndex(date) {
    // Índice do dia útil no array (0-based)
    var idx = 0;
    var d = new Date(minDate);
    while (d < date) {
      if (isWorkday(d)) idx++;
      d = addDays(d, 1);
    }
    return idx;
  }

  function sx(date) {
    var idx = workdayIndex(date);
    return padL + (idx / totalWorkdays) * chartW;
  }

  // Cores por status: navy + laranja (branding do projeto)
  var phasePalette = ['#4361ee','#e85d04','#2d9d5f','#7b2fbe','#0891b2','#c0392b','#f6a623']; // unused, kept for safety

  var hasConcluido = false;
  var hasAndamento = false;
  var hasPlanejado = false;
  var hasAtrasado  = false;
  var hasExecucao  = false;
  var hasMilestone = false;

  function formatDateBR(d) {
    var day   = String(d.getDate()).padStart(2, '0');
    var month = String(d.getMonth() + 1).padStart(2, '0');
    return day + '/' + month;
  }

  var taskList = entries.filter(function(e) { return e.type === 'task'; });
  var msList   = entries.filter(function(e) { return e.type === 'milestone'; });

  // Coluna esquerda com nomes das fases
  var leftColW = 144;
  var origPadL = padL;
  padL  = origPadL + leftColW + 4;
  chartW = W - padL - padR;

  // Layout executivo clean
  var msAnnotH  = 0;
  var monthRowH = 24;
  var weekRowH  = 16;
  var headerH   = monthRowH + weekRowH;
  var rowH      = 46;
  var barH      = 26;
  var barPadY   = Math.floor((rowH - barH) / 2);
  var chartTop  = headerH;

  var bottomZone = 52; // espaço para diamante + pill do marco abaixo das linhas
  H = Math.max(320, headerH + taskList.length * rowH + bottomZone);
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

  var html = '';

  // Defs
  html += '<defs>';
  html += '<filter id="gg" x="-60%" y="-60%" width="220%" height="220%">';
  html += '<feGaussianBlur stdDeviation="2.5" result="b"/>';
  html += '<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>';
  html += '</filter>';
  html += '</defs>';

  // Fundo branco
  html += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#ffffff"/>';

  // Month segments
  var monthNames = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
  var monthSegments = [];
  for (var i = 0; i < weekStarts.length; i++) {
    var ws = weekStarts[i];
    var key = ws.getFullYear() + '-' + ws.getMonth();
    if (!monthSegments.length || monthSegments[monthSegments.length - 1].key !== key) {
      monthSegments.push({ key: key, label: monthNames[ws.getMonth()], startIdx: i, count: 1 });
    } else {
      monthSegments[monthSegments.length - 1].count += 1;
    }
  }

  // Faixas alternadas de linha (largura total, abaixo do header)
  taskList.forEach(function(e, i) {
    if (i % 2 === 1) {
      html += '<rect x="0" y="' + (chartTop + i * rowH) + '" width="' + W + '" height="' + rowH + '" fill="rgba(30,58,110,0.025)"/>';
    }
  });

  // Header de mês: fundo alternado
  monthSegments.forEach(function(m, mi) {
    var x1 = sx(weekStarts[m.startIdx]);
    var endIdx = m.startIdx + m.count;
    var x2 = endIdx < weekStarts.length ? sx(weekStarts[endIdx]) : sx(addDays(weekStarts[weekStarts.length - 1], 7));
    if (mi % 2 === 0) {
      html += '<rect x="' + x1.toFixed(1) + '" y="' + msAnnotH + '" width="' + (x2 - x1).toFixed(1) + '" height="' + monthRowH + '" fill="rgba(30,58,110,0.035)"/>';
    }
    // Separador vertical de mês
    if (mi > 0) {
      html += '<line x1="' + x1.toFixed(1) + '" y1="' + msAnnotH + '" x2="' + x1.toFixed(1) + '" y2="' + H + '" stroke="#e2e8f0" stroke-width="1"/>';
    }
  });

  // Grid de semanas (área do gráfico, linhas muito suaves)
  for (var i = 0; i < weekStarts.length; i++) {
    var xw = sx(weekStarts[i]);
    html += '<line x1="' + xw.toFixed(1) + '" y1="' + headerH + '" x2="' + xw.toFixed(1) + '" y2="' + H + '" stroke="#f1f5f9" stroke-width="1"/>';
  }

  // Fundo da coluna de nomes (header + dados)
  html += '<rect x="0" y="0" width="' + (padL - 1) + '" height="' + H + '" fill="#f8fafc"/>';

  // Faixa de header de mês (fundo sutil em toda a largura)
  html += '<rect x="0" y="' + msAnnotH + '" width="' + W + '" height="' + (monthRowH + weekRowH) + '" fill="rgba(30,58,110,0.05)"/>';

  // Labels de mês
  monthSegments.forEach(function(m) {
    var x1 = sx(weekStarts[m.startIdx]);
    var endIdx = m.startIdx + m.count;
    var x2 = endIdx < weekStarts.length ? sx(weekStarts[endIdx]) : sx(addDays(weekStarts[weekStarts.length - 1], 7));
    var mx = (x1 + x2) / 2;
    html += '<text x="' + mx.toFixed(1) + '" y="' + (msAnnotH + 16) + '" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="10.5" font-weight="800" fill="#1e3a6e" letter-spacing="0.1em">' + esc(m.label) + '</text>';
  });

  // Label "FASE" no header da coluna esquerda
  html += '<text x="' + (origPadL + 10) + '" y="' + (msAnnotH + 16) + '" font-family="Inter,system-ui,sans-serif" font-size="8.5" font-weight="800" fill="#1e3a6e" letter-spacing="0.1em" opacity="0.55">FASE</text>';

  // Labels de semana (S1 … Sn)
  for (var i = 0; i < weekStarts.length; i++) {
    var xws = sx(weekStarts[i]);
    var xwe = i + 1 < weekStarts.length ? sx(weekStarts[i + 1]) : sx(addDays(weekStarts[i], 5));
    var wxc = (xws + xwe) / 2;
    html += '<text x="' + wxc.toFixed(1) + '" y="' + (msAnnotH + monthRowH + 11) + '" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="8" font-weight="600" fill="#94a3b8">S' + (i + 1) + '</text>';
  }

  // Borda inferior do header
  html += '<line x1="0" y1="' + headerH + '" x2="' + W + '" y2="' + headerH + '" stroke="#1e3a6e" stroke-width="1.5" opacity="0.15"/>';

  // Borda direita da coluna de nomes
  html += '<line x1="' + (padL - 1) + '" y1="' + msAnnotH + '" x2="' + (padL - 1) + '" y2="' + H + '" stroke="#e2e8f0" stroke-width="1"/>';

  // Separadores de linha (entre fases) — largura total
  taskList.forEach(function(e, i) {
    html += '<line x1="0" y1="' + (chartTop + (i + 1) * rowH) + '" x2="' + W + '" y2="' + (chartTop + (i + 1) * rowH) + '" stroke="#edf0f7" stroke-width="1"/>';
  });

  // Linha hoje — parte apenas do header (igual ao marco)
  var showToday = String(ganttCfg.exibir_hoje || 'TRUE').toLowerCase() !== 'false';
  var tx = null;
  if (showToday && today >= minDate && today <= maxDate) {
    tx = sx(today);
    var phW = 38, phH = 16;
    var tagY = H - bottomZone + 4;
    html += '<line x1="' + tx.toFixed(1) + '" y1="' + headerH + '" x2="' + tx.toFixed(1) + '" y2="' + (tagY - 2) + '" stroke="#dd6b20" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.55"/>';
    html += '<rect x="' + (tx - phW / 2).toFixed(1) + '" y="' + tagY + '" width="' + phW + '" height="' + phH + '" rx="3" fill="#dd6b20"/>';
    html += '<text x="' + tx.toFixed(1) + '" y="' + (tagY + phH / 2) + '" text-anchor="middle" dominant-baseline="middle" font-family="Inter,system-ui,sans-serif" font-size="7.5" font-weight="800" fill="white" letter-spacing="0.07em">HOJE</text>';
  }

  // Anotações de marcos — diamante acima, pill abaixo
  msList.forEach(function(e, mi) {
    hasMilestone = true;
    var mx = sx(e.start);
    var dateStr = formatDateBR(e.start);

    var dmY   = H - bottomZone + 14; // diamante
    var pillH = 22;
    var pillY = dmY + 10;            // pill abaixo do diamante

    var lblW = Math.min(Math.max(e.name.length * 6.5 + dateStr.length * 6 + 30, 95), 195);
    var lblX = Math.max(padL + 2, Math.min(W - padR - lblW - 2, mx - lblW / 2));

    // Linha vertical (do fim do header até acima do diamante)
    html += '<line x1="' + mx.toFixed(1) + '" y1="' + headerH + '" x2="' + mx.toFixed(1) + '" y2="' + (dmY - 9) + '" stroke="#dd6b20" stroke-width="1" stroke-dasharray="4 3" opacity="0.4"/>';

    // Diamante
    html += '<rect x="' + (mx - 6) + '" y="' + (dmY - 6) + '" width="12" height="12" rx="1" transform="rotate(45 ' + mx.toFixed(1) + ' ' + dmY + ')" fill="#dd6b20" stroke="white" stroke-width="1.5" filter="url(#gg)"/>';

    // Pill abaixo do diamante
    html += '<rect x="' + lblX.toFixed(1) + '" y="' + pillY + '" width="' + lblW.toFixed(1) + '" height="' + pillH + '" rx="4" fill="#1e3a6e"/>';
    html += '<text x="' + (lblX + 9) + '" y="' + (pillY + pillH / 2) + '" dominant-baseline="middle" font-family="Arial" font-size="9" fill="#dd6b20">★</text>';
    html += '<text x="' + (lblX + 19) + '" y="' + (pillY + pillH / 2) + '" dominant-baseline="middle" font-family="Inter,system-ui,sans-serif" font-size="9" font-weight="700" fill="white">' + esc(e.name) + '</text>';
    html += '<text x="' + (lblX + 19 + e.name.length * 5.6 + 4) + '" y="' + (pillY + pillH / 2) + '" dominant-baseline="middle" font-family="Inter,system-ui,sans-serif" font-size="9" font-weight="400" fill="rgba(255,255,255,0.65)">' + esc(dateStr) + '</text>';
  });

  // Barras de fase + coluna de nomes
  taskList.forEach(function(e, i) {
    var color = '#1e3a6e';
    var isPlanned = false;

    if      (e.status.indexOf('conclu')    >= 0) { hasConcluido = true; color = '#2d9d5f'; }
    else if (e.status.indexOf('atrasado')  >= 0) { hasAtrasado  = true; color = '#c0392b'; }
    else if (e.status.indexOf('andamento') >= 0) { hasAndamento = true; color = '#dd6b20'; }
    else if (e.status.indexOf('planejado') >= 0) { hasPlanejado = true; color = '#94a3b8'; isPlanned = true; }
    else                                         { hasExecucao  = true; }

    var rowY  = chartTop + i * rowH;
    var x1    = sx(e.start);
    var x2    = sx(addDays(e.end, 1));
    var barW  = Math.max(x2 - x1, 14);
    var barY  = rowY + barPadY;
    var midY  = rowY + rowH / 2;
    var rr    = 3;
    var dLbl  = formatDateBR(e.start) + ' – ' + formatDateBR(e.end);

    var midBarY = (barY + barH / 2);
    if (isPlanned) {
      html += '<rect x="' + x1.toFixed(1) + '" y="' + barY.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + barH + '" rx="' + rr + '" fill="#f1f5f9" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="5 3"/>';
      if (barW > 76) {
        html += '<text x="' + (x1 + barW / 2).toFixed(1) + '" y="' + midBarY + '" text-anchor="middle" dominant-baseline="middle" font-family="Inter,system-ui,sans-serif" font-size="9.5" font-weight="500" fill="#94a3b8">' + esc(dLbl) + '</text>';
      } else {
        var extX = x1 + barW + 5;
        if (extX + 80 < W - padR) {
          html += '<text x="' + extX.toFixed(1) + '" y="' + midBarY + '" dominant-baseline="middle" font-family="Inter,system-ui,sans-serif" font-size="9.5" font-weight="500" fill="#94a3b8">' + esc(dLbl) + '</text>';
        }
      }
    } else {
      html += '<rect x="' + (x1 + 1).toFixed(1) + '" y="' + (barY + 2).toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + barH + '" rx="' + rr + '" fill="' + color + '" opacity="0.12"/>';
      html += '<rect x="' + x1.toFixed(1) + '" y="' + barY.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + barH + '" rx="' + rr + '" fill="' + color + '"/>';
      var progW = barW * Math.min(Math.max(e.progress / 100, 0), 1);
      if (progW > 4) {
        html += '<rect x="' + x1.toFixed(1) + '" y="' + barY.toFixed(1) + '" width="' + progW.toFixed(1) + '" height="' + barH + '" rx="' + rr + '" fill="rgba(0,0,0,0.18)"/>';
      }
      html += '<line x1="' + (x1 + rr).toFixed(1) + '" y1="' + (barY + 3).toFixed(1) + '" x2="' + (x1 + barW - rr).toFixed(1) + '" y2="' + (barY + 3).toFixed(1) + '" stroke="rgba(255,255,255,0.28)" stroke-width="1.5"/>';
      var pctNum = Math.round(Math.min(Math.max(e.progress, 0), 100));
      var pctTxt = pctNum + '%';
      if (barW > 76) {
        html += '<text x="' + (x1 + barW / 2).toFixed(1) + '" y="' + (midBarY - 3).toFixed(1) + '" text-anchor="middle" dominant-baseline="middle" font-family="Inter,system-ui,sans-serif" font-size="9.5" font-weight="600" fill="rgba(255,255,255,0.92)">' + esc(dLbl) + '</text>';
        html += '<text x="' + (x1 + barW / 2).toFixed(1) + '" y="' + (midBarY + 8).toFixed(1) + '" text-anchor="middle" dominant-baseline="middle" font-family="Inter,system-ui,sans-serif" font-size="9" font-weight="800" fill="rgba(255,255,255,0.7)">' + pctTxt + '</text>';
      } else if (barW > 32) {
        html += '<text x="' + (x1 + barW / 2).toFixed(1) + '" y="' + midBarY.toFixed(1) + '" text-anchor="middle" dominant-baseline="middle" font-family="Inter,system-ui,sans-serif" font-size="9" font-weight="800" fill="rgba(255,255,255,0.85)">' + pctTxt + '</text>';
      } else {
        var extX = x1 + barW + 5;
        if (extX + 70 < W - padR) {
          html += '<text x="' + extX.toFixed(1) + '" y="' + midBarY + '" dominant-baseline="middle" font-family="Inter,system-ui,sans-serif" font-size="9.5" font-weight="600" fill="' + color + '">' + esc(dLbl) + '</text>';
        }
      }
    }

    // Nome + status badge na coluna esquerda
    var statusLabels = { conclu: 'Concluído', atrasado: 'Atrasado', andamento: 'Em andamento', planejado: 'Planejado' };
    var statusKey = e.status.indexOf('conclu') >= 0 ? 'conclu' : e.status.indexOf('atrasado') >= 0 ? 'atrasado' : e.status.indexOf('andamento') >= 0 ? 'andamento' : e.status.indexOf('planejado') >= 0 ? 'planejado' : '';
    var statusLabel = statusKey ? statusLabels[statusKey] : 'Em execução';
    var nameY = rowY + rowH / 2 - 7;
    var statusY = rowY + rowH / 2 + 8;
    var maxNameW = leftColW - 22;
    var nameStr = e.name.length > 17 ? e.name.slice(0, 16) + '…' : e.name;
    html += '<circle cx="' + (origPadL + 9) + '" cy="' + nameY.toFixed(1) + '" r="4.5" fill="' + color + '" opacity="' + (isPlanned ? '0.38' : '1') + '"/>';
    html += '<text x="' + (origPadL + 20) + '" y="' + nameY.toFixed(1) + '" dominant-baseline="middle" font-family="Inter,system-ui,sans-serif" font-size="11" font-weight="700" fill="' + (isPlanned ? '#94a3b8' : '#1e293b') + '">' + esc(nameStr) + '</text>';
    html += '<text x="' + (origPadL + 20) + '" y="' + statusY.toFixed(1) + '" dominant-baseline="middle" font-family="Inter,system-ui,sans-serif" font-size="9" font-weight="500" fill="' + color + '" opacity="' + (isPlanned ? '0.5' : '0.75') + '">' + esc(statusLabel) + '</text>';
  });

  svg.innerHTML = html;
  if (cards) cards.innerHTML = '';

  // —— Legenda ——
  if (legend) {
    var items = [];
    if (hasConcluido) items.push({ label: 'Concluído',    color: '#2d9d5f' });
    if (hasAndamento) items.push({ label: 'Em andamento', color: '#dd6b20' });
    if (hasExecucao)  items.push({ label: 'Em execução',   color: '#1e3a6e' });
    if (hasPlanejado) items.push({ label: 'Planejado',    color: '#64748b' });
    if (hasAtrasado)  items.push({ label: 'Atrasado',     color: '#c0392b' });
    if (hasMilestone) items.push({ label: 'Marco',        color: '#dd6b20' });
    if (showToday)    items.push({ label: 'Hoje', color: '#dd6b20', type: 'line' });
    legend.innerHTML = items.map(function(item) {
      if (item.type === 'line') {
        return '<div class="gantt-legend-item"><span class="gantt-legend-swatch-line"></span>' + esc(item.label) + '</div>';
      }
      return '<div class="gantt-legend-item"><span class="gantt-legend-swatch" style="background:' + item.color + '"></span>' + esc(item.label) + '</div>';
    }).join('');
  }
}

function renderDeckSlides(d) {
  var cfg = d.config || {};
  var branding = d.branding || {};
  var rodape = d.rodape || {};
  var fases = d.fases || [];
  var marcos = d.marcos || [];
  var pendencias = d.pendencias_criticas || [];
  var acoes = d.proximas_acoes || [];
  var ganttCfg = d.gantt_config || {};

  var logo = v(branding.logo_path, 'assets/logo.svg');
  var coverLogo = document.getElementById('coverLogo');
  if (coverLogo) coverLogo.src = logo;
  var logoImg = document.getElementById('logoImg');
  if (logoImg && logo) logoImg.src = logo;

  var set = function (id, text) {
    var e = document.getElementById(id);
    if (e) e.textContent = text;
  };
  var setHtml = function (id, html) {
    var e = document.getElementById(id);
    if (e) e.innerHTML = html;
  };
  set('coverTitle', v(cfg.report_title, 'STATUS REPORT'));
  var coverTitleRaw = v(cfg.cover_main_title, v(cfg.project_name, 'Projeto'));
  coverTitleRaw = coverTitleRaw.replace(/\|/g, '<br/>');

  var highlight = v(cfg.cover_highlight, '');
  var coverTitleHtml = esc(coverTitleRaw).replace(new RegExp(reEsc(highlight), 'gi'), '<em>' + esc(highlight) + '</em>');
  coverTitleHtml = coverTitleHtml.replace(/&lt;br\/&gt;/g, '<br/>');
  setHtml('coverMainTitle', coverTitleHtml);
  set('coverEyebrow', v(cfg.cover_eyebrow, ''));
  set('coverSubtitle', v(cfg.cover_subtitle, v(cfg.project_subtitle, '')));
  set('coverClient', v(cfg.sponsor, '-'));
  set('coverOwner', v(cfg.owner_name, '-'));
  set('coverDate', v(cfg.report_date, '-'));
  set('coverDuration', v(cfg.presentation_duration, ''));
  set('coverTagline', v(cfg.cover_tagline, ''));
  set('coverRestriction', v(cfg.cover_restriction_label, ''));
  set('coverFooterLeft', v(cfg.cover_footer_left, ''));
  set('coverFooterRight', v(cfg.cover_footer_right, ''));
  set('coverPartner', v(cfg.partner_name, ''));
  set('deckSummaryLine', 'Fase atual: ' + v(cfg.current_phase, '-') + ' | Dia ' + v(cfg.current_day, '-') + ' de ' + v(cfg.total_days, '-'));
  set('ganttTitle', v(ganttCfg.titulo, 'Cronograma & Marcos Críticos'));
  set('ganttSubtitle', v(ganttCfg.subtitulo, 'Fase atual: ' + v(cfg.current_phase, '-') + ' | Dia ' + v(cfg.current_day, '-') + ' de ' + v(cfg.total_days, '-')));

  renderGantt(d);

  var fl = document.getElementById('deckFasesList');
  if (fl) {
    fl.innerHTML = fases.length ? fases.slice(0, 10).map(function (f, i) {
      return '<li>' + esc(String(i + 1) + '. ' + v(f.nome, '-') + ' | ' + v(f.status, '-') + ' | ' + v(f.data_alvo, '-')) + '</li>';
    }).join('') : '<li>Nenhuma fase cadastrada</li>';
  }
  var ml = document.getElementById('deckMarcosList');
  if (ml) {
    ml.innerHTML = marcos.length ? marcos.slice(0, 10).map(function (m, i) {
      return '<li>' + esc(String(i + 1) + '. ' + v(m.nome, '-') + ' | ' + v(m.status, '-') + ' | ' + v(m.data_alvo, '-')) + '</li>';
    }).join('') : '<li>Nenhum marco cadastrado</li>';
  }
  var pl = document.getElementById('deckPendenciasList');
  if (pl) {
    pl.innerHTML = pendencias.length ? pendencias.slice(0, 8).map(function (p) {
      return '<li>' + esc(v(p.prioridade, 'P?') + ' | ' + v(p.item, '-') + ' | ' + v(p.status, '-')) + '</li>';
    }).join('') : '<li>Nenhuma pendência crítica cadastrada</li>';
  }
  var al = document.getElementById('deckAcoesList');
  if (al) {
    al.innerHTML = acoes.length ? acoes.slice(0, 10).map(function (a, i) {
      return '<li>' + esc(String(i + 1) + '. ' + v(a.texto, '-')) + '</li>';
    }).join('') : '<li>Nenhuma ação cadastrada</li>';
  }

  set('closingTitle', v(cfg.report_title, 'STATUS REPORT'));
  set('closingMilestone', 'Próximo marco: ' + v(rodape.milestone_alvo, v(cfg.current_phase, '-')));
  set('closingDates', 'Data alvo: ' + (rodape.data_alvo ? fmtDateShort(rodape.data_alvo) : '-') + ' | Go-Live: ' + (rodape.go_live_previsto ? fmtDateShort(rodape.go_live_previsto) : '-'));
}

/* ===== Erros de validação ===== */
function renderValidationErrors(json) {
  var errors = json.validation_errors || [];
  var banner = document.getElementById('validationBanner');
  if (!banner) return;
  if (errors.length === 0) {
    banner.style.display = 'none';
    return;
  }
  banner.style.display = 'flex';
  banner.innerHTML =
    '<strong>Avisos de validação (' + errors.length + '):</strong>&nbsp;' +
    errors.map(esc).join(' &middot; ');
}

/* ===== Alerta no header ===== */
function renderAlert(cfg) {
  var el    = document.getElementById('alertBar');
  var label = v(cfg.alert_label, '');
  var level = v(cfg.alert_level, 'warning');
  var root = getComputedStyle(document.documentElement);
  var warnBg = root.getPropertyValue('--p-alert-warning-bg').trim() || '#e8c86a';
  var warnFn = root.getPropertyValue('--p-alert-warning-font').trim() || '#39420a';
  var dangerBg = root.getPropertyValue('--p-alert-danger-bg').trim() || '#c94a4a';
  var successBg = root.getPropertyValue('--p-alert-success-bg').trim() || '#4a9a63';
  if (label) {
    el.style.display = 'flex';
    document.getElementById('alertText').textContent = label;
    if (level === 'warning') {
      el.style.background = 'linear-gradient(180deg, ' + warnBg + ' 0%, ' + darken(warnBg, 0.92) + ' 100%)';
      el.style.color = warnFn;
    } else if (level === 'danger') {
      el.style.background = 'linear-gradient(180deg, ' + lighten(dangerBg, 0.15) + ', ' + dangerBg + ')';
      el.style.color = '#fff';
    } else {
      el.style.background = 'linear-gradient(180deg, ' + lighten(successBg, 0.15) + ', ' + successBg + ')';
      el.style.color = '#fff';
    }
  } else {
    el.style.display = 'none';
  }
}

/* ═══════════════════════════════════════════════════════════════
   Helpers compartilhados pelos três gauges
   Todos usam: cx=45 cy=38 r=28 sw=6  viewBox "0 0 90 68"
   Semicírculo via dashoffset — 9h → 12h → 3h
   O valor (e status no SPI) é embutido como texto SVG.
   ═══════════════════════════════════════════════════════════════ */
var _GCX = 45, _GCY = 38, _GR = 28, _GSW = 6;

function _gaugeBase() {
  var C = 2 * Math.PI * _GR;
  var semi = C / 2;
  var base = C / 2;
  return { C: C, semi: semi, base: base };
}

/* Arco posicionado via dashoffset (mesma técnica para todos) */
function _zoneCircle(cx, cy, r, sw, C, from, len, color, op) {
  var base = C / 2;
  var offset = -(base + from);
  return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none"' +
    ' stroke="' + color + '" stroke-width="' + sw + '" stroke-linecap="butt"' +
    ' stroke-dasharray="' + len.toFixed(2) + ' ' + (C - len).toFixed(2) + '"' +
    ' stroke-dashoffset="' + offset.toFixed(2) + '"' +
    (op ? ' opacity="' + op + '"' : '') + '/>';
}

/* ── Plano / Real ─────────────────────────────────────────────── */
function makeRingSvg(pct, color, label) {
  var cx = _GCX, cy = _GCY, r = _GR, sw = _GSW;
  var g    = _gaugeBase();
  var fill = g.semi * Math.min(Math.max(pct, 0), 100) / 100;

  var track = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none"' +
    ' stroke="rgba(255,255,255,0.11)" stroke-width="' + sw + '"' +
    ' stroke-dasharray="' + g.semi.toFixed(2) + ' ' + g.semi.toFixed(2) + '"' +
    ' stroke-dashoffset="-' + g.base.toFixed(2) + '" stroke-linecap="butt"/>';

  var arc = fill > 0.3
    ? '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none"' +
      ' stroke="' + color + '" stroke-width="' + sw + '" stroke-linecap="round"' +
      ' stroke-dasharray="' + fill.toFixed(2) + ' ' + (g.C - fill).toFixed(2) + '"' +
      ' stroke-dashoffset="-' + g.base.toFixed(2) + '"/>'
    : '';

  var txt = '<text x="' + cx + '" y="' + (cy + 16) + '"' +
    ' text-anchor="middle" fill="white"' +
    ' font-size="17" font-weight="800" font-family="Inter,system-ui,sans-serif"' +
    ' letter-spacing="-0.4">' + (label || pct + '%') + '</text>';

  return '<svg viewBox="0 0 90 62" width="90" height="62" shape-rendering="geometricPrecision">' + track + arc + txt + '</svg>';
}

/* ── SPI — velocímetro com zonas coloridas + agulha ──────────── */
function makeGaugeSvg(spi, valueLabel, statusLabel, statusColor) {
  var MAX = 1.2;
  var cx = _GCX, cy = _GCY, r = _GR, sw = _GSW;
  var g   = _gaugeBase();

  function spiToLen(s) { return g.semi * Math.min(Math.max(s, 0), MAX) / MAX; }
  var l80 = spiToLen(0.80);
  var l95 = spiToLen(0.95);

  var track = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none"' +
    ' stroke="rgba(255,255,255,0.11)" stroke-width="' + sw + '"' +
    ' stroke-dasharray="' + g.semi.toFixed(2) + ' ' + g.semi.toFixed(2) + '"' +
    ' stroke-dashoffset="-' + g.base.toFixed(2) + '" stroke-linecap="butt"/>';

  var zones = [
    _zoneCircle(cx, cy, r, sw, g.C, 0,    l80,        '#ff7878', '0.85'),
    _zoneCircle(cx, cy, r, sw, g.C, l80,  l95 - l80,  '#f0d060', '0.85'),
    _zoneCircle(cx, cy, r, sw, g.C, l95,  g.semi-l95, '#6ecf8e', '0.85')
  ].join('');

  // Agulha
  var sv  = isNaN(spi) ? 0 : Math.min(Math.max(spi, 0), MAX);
  var deg = 180 - (sv / MAX) * 180;
  var rad = deg * Math.PI / 180;
  var nL  = r - 7;
  var nx  = (cx + nL * Math.cos(rad)).toFixed(2);
  var ny  = (cy - nL * Math.sin(rad)).toFixed(2);
  var nc  = statusColor || (sv >= 0.95 ? '#6ecf8e' : sv >= 0.80 ? '#f0d060' : '#ff7878');

  var needle = '<line x1="' + cx + '" y1="' + cy + '" x2="' + nx + '" y2="' + ny +
    '" stroke="' + nc + '" stroke-width="2.2" stroke-linecap="round"/>' +
    '<circle cx="' + cx + '" cy="' + cy + '" r="4" fill="rgba(255,255,255,0.85)"/>' +
    '<circle cx="' + cx + '" cy="' + cy + '" r="2" fill="' + nc + '"/>';

  // Valor + status embutidos
  var val = valueLabel
    ? '<text x="' + cx + '" y="' + (cy + 22) + '" text-anchor="middle"' +
      ' fill="' + nc + '" font-size="17" font-weight="800"' +
      ' font-family="Inter,system-ui,sans-serif" letter-spacing="-0.4">' + valueLabel + '</text>'
    : '';
  var lbl = statusLabel
    ? '<text x="' + cx + '" y="' + (cy + 34) + '" text-anchor="middle"' +
      ' fill="' + nc + '" font-size="8.5" font-weight="700"' +
      ' font-family="Inter,system-ui,sans-serif" letter-spacing="0.07em">' +
      statusLabel.toUpperCase() + '</text>'
    : '';

  return '<svg viewBox="0 0 90 76" width="90" height="76" shape-rendering="geometricPrecision">' +
    track + zones + needle + val + lbl + '</svg>';
}

/* ===== Top info (header direito) ===== */
function renderTopInfo(cfg, curvaS) {
  var root = document.documentElement;

  // Lê a cor primária do branding aplicada em tempo de execução
  var primaryColor  = getComputedStyle(root).getPropertyValue('--green-800').trim() || '#2a7249';
  var secondaryColor = getComputedStyle(root).getPropertyValue('--green-600').trim() || '#4a9a63';

  // ── Plano ────────────────────────────────────────────────────────────
  var plano = parseInt(cfg.progress_percent) || 0;
  var planoEl = document.getElementById('infoPlanoRing');
  if (planoEl) planoEl.innerHTML = makeRingSvg(plano, primaryColor);

  // ── Real ─────────────────────────────────────────────────────────────
  // Usa o último ponto da Curva S onde "realizado" foi preenchido,
  // independente do current_day — o usuário preenche manualmente até onde sabe.
  var realPct  = 0;
  var planoPct = plano;
  if (curvaS && curvaS.length) {
    var best = null;
    curvaS.forEach(function(p) {
      var r = parseFloat(p.realizado);
      if (!isNaN(r) && p.realizado !== null && p.realizado !== '') {
        var d = parseInt(p.dia) || 0;
        if (best === null || d >= parseInt(best.dia)) best = p;
      }
    });
    if (best) {
      realPct  = Math.round(parseFloat(best.realizado) || 0);
      planoPct = Math.round(parseFloat(best.planejado) || 0) || plano;
    }
  }
  var realEl = document.getElementById('infoRealRing');
  if (realEl) realEl.innerHTML = makeRingSvg(realPct, '#4BA8D8');

  // ── SPI = Real ÷ Plano ───────────────────────────────────────────────
  var spiGauge = document.getElementById('spiGauge');
  if (spiGauge) {
    if (planoPct > 0) {
      var spi = realPct / planoPct;
      var lbl = spi >= 0.95 ? 'No prazo' : spi >= 0.80 ? 'Atenção' : 'Crítico';
      var nc  = spi >= 0.95 ? '#6ecf8e' : spi >= 0.80 ? '#f0d060' : '#ff7878';
      spiGauge.innerHTML = makeGaugeSvg(spi, spi.toFixed(2), lbl, nc);
    } else {
      spiGauge.innerHTML = makeGaugeSvg(0, '--', '', '#fff');
    }
  }
}

/* ===== Timeline ===== */
function renderTimeline(d) {
  var el    = document.getElementById('timeline');
  var fases = d.fases || [];
  if (!fases.length) { el.innerHTML = ''; return; }

  var total      = fases.length;
  var doneCount  = 0;
  var activeIdx  = -1;
  fases.forEach(function (f, i) {
    var s = (f.status || '').toLowerCase();
    if (s.includes('conclu')) doneCount++;
    if (s.includes('andamento') && activeIdx < 0) activeIdx = i;
  });

  var tlSolid = ((doneCount + (activeIdx >= 0 ? 0.5 : 0)) / total) * 85.2;
  el.style.setProperty('--tl-solid', Math.round(tlSolid) + '%');
  // Colunas dinâmicas — suporta qualquer número de fases
  el.style.gridTemplateColumns = 'repeat(' + total + ', 1fr)';

  el.innerHTML = fases.map(function (f) {
    var s          = (f.status || '').toLowerCase();
    var isDestaque = f.destaque === true || f.destaque === 'true' || f.destaque === 1;
    var isDone     = s.includes('conclu');
    var isActive   = s.includes('andamento');
    var isFuture   = !isDone && !isActive;

    var cls = '';
    var dot = '';
    if (isDone)        { cls = 'done';   dot = '&#10003;'; }
    else if (isActive) { cls = 'active'; }
    else               { cls = 'future'; }

    if (isDestaque) cls += ' highlight';

    var badgeHtml = isActive
      ? '<div class="phase-focus-badge" aria-hidden="true">EM FOCO</div>'
      : '';

    return '<div class="phase ' + cls.trim() + '">' +
      badgeHtml +
      '<div class="phase-dot" aria-hidden="true">' + dot + '</div>' +
      '<h3>' + esc(f.nome) + '</h3>' +
      '<div class="status">' + esc(f.status) + '</div>' +
      '<div class="date">Data alvo: ' + esc(fmtDateShort(f.data_alvo)) + '</div>' +
      '</div>';
  }).join('');
}

/* ===== KPIs ===== */
function renderKPIs(d) {
  var el   = document.getElementById('kpis');
  var kpis = d.kpis || [];
  if (!kpis.length) { el.innerHTML = ''; return; }

  // Tipos omitidos: compass/progress redundam com o topbar; calendar é metadado (está no rodapé)
  var SKIP_TIPOS = { compass: true, progress: true, calendar: true };

  el.innerHTML = kpis.map(function (k, origIdx) {
    if (SKIP_TIPOS[k.tipo || '']) return '';
    var tipo  = k.tipo  || '';
    var nivel = v(k.nivel, 'success');
    var val   = v(k.valor, '');
    var label = v(k.titulo, '');
    var sub   = v(k.subtitulo, '');

    if (tipo === 'calendar' || /^\d{4}-\d{2}-\d{2}T/.test(val)) {
      var fmt = fmtDateShort(val);
      if (fmt) val = fmt;
    }
    if (/^\d{4}-\d{2}-\d{2}T/.test(sub)) {
      var fmtSub = fmtDateShort(sub);
      if (fmtSub) sub = fmtSub;
    }

    var svg      = ICONS[tipo] || ICONS['calendar'];
    var iconClass = ({ success: 'success', warning: 'warning', danger: 'danger' })[nivel] || 'gray';
    var iconHtml = '<div class="kpi-icon ' + iconClass + '" aria-hidden="true">' + svg + '</div>';

    var valClass = 'value';
    if (nivel === 'warning') valClass += ' kval-warn';
    if (nivel === 'danger')  valClass += ' kval-danger';

    var subHtml = sub ? '<div class="kpi-sub">' + esc(sub) + '</div>' : '';

    var cardExtra = nivel === 'danger'  ? ' kpi-danger'
                  : nivel === 'warning' ? ' kpi-alert'
                  : '';

    return '<article class="kpi-card' + cardExtra + '" data-kpi-orig-idx="' + origIdx + '">' +
      iconHtml +
      '<div class="kpi-body">' +
        '<div class="label">' + esc(label) + '</div>' +
        '<div class="' + valClass + '">' + esc(val) + '</div>' +
        subHtml +
      '</div></article>';
  }).join('');
}

/* ===== Resumo Executivo ===== */
function renderResumo(d) {
  var el    = document.getElementById('resumo');
  var items = d.resumo_executivo || [];
  if (!items.length) {
    el.innerHTML = '<li class="empty-state">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h6"/></svg>' +
      '<p>Nenhum item de resumo cadastrado</p></li>';
    return;
  }
  el.innerHTML = items.map(function (r, idx) {
    var s        = (r.status || '').toLowerCase();
    var dotClass = s.includes('conclu') ? 'status-dot' : 'status-dot pending';
    var dotText  = s.includes('conclu') ? '&#10003;' : '';
    return '<li data-edit-idx="' + idx + '">' +
      '<span class="' + dotClass + '" aria-hidden="true">' + dotText + '</span>' +
      '<span class="resumo-text">' + esc(r.texto) + '</span></li>';
  }).join('');
}

/* ===== Pendências Críticas ===== */
function renderPendencias(d) {
  var el    = document.getElementById('pendencias');
  var items = d.pendencias_criticas || [];
  if (!items.length) {
    el.innerHTML = '<tr><td colspan="3" class="empty-state">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 20h20L12 3Z"/><path d="M12 9v4"/><circle cx="12" cy="17" r="1"/></svg>' +
      '<p>Nenhuma pendência crítica cadastrada</p></td></tr>';
    return;
  }
  el.innerHTML = items.map(function (p, idx) {
    var statusCls = sc(p.nivel || p.status || '');

    // Pill de prioridade — escala de vermelho (P1 mais escuro → P4 mais suave)
    var prioKey = (p.prioridade || '').toLowerCase().replace(/\s/g, '');
    var prioCls = 'prio-' + (prioKey || 'p1');

    var meta = [];
    if (p.responsaveis) meta.push(esc(p.responsaveis));
    if (p.id_origem)    meta.push('ID ' + esc(p.id_origem));
    if (p.score)        meta.push('Score ' + esc(String(p.score)));
    if (p.categoria)    meta.push(esc(p.categoria));
    if (p.estrategia)   meta.push(esc(p.estrategia));
    if (p.data_limite)  meta.push('Prazo: ' + esc(p.data_limite));
    var metaHtml = meta.length
      ? '<div class="risk-meta">' + meta.join(' &middot; ') + '</div>'
      : '';

    return '<tr data-edit-idx="' + idx + '">' +
      '<td><span class="priority-pill ' + prioCls + '">' + esc(p.prioridade) + '</span></td>' +
      '<td><div class="risk-title">' + esc(p.item) + '</div>' + metaHtml + '</td>' +
      '<td><span class="status-pill ' + statusCls + '">' + esc(v(p.status, '')).toUpperCase() + '</span></td>' +
      '</tr>';
  }).join('');
}

/* ===== Próximas Ações ===== */
function renderAcoes(d) {
  var el    = document.getElementById('acoes');
  var items = d.proximas_acoes || [];
  if (!items.length) {
    el.innerHTML = '<li class="empty-state">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>' +
      '<p>Nenhuma ação cadastrada</p></li>';
    return;
  }
  el.innerHTML = items.map(function (a, idx) {
    return '<li data-edit-idx="' + idx + '"><span class="arrow-dot" aria-hidden="true">&#8250;</span>' +
      '<span class="acao-text">' + esc(v(a.texto, '')) + '</span></li>';
  }).join('');
}

/* ===== Curva S ===== */
function renderCurvaS(d) {
  var svg    = document.getElementById('curvaSvg');
  var pontos = d.curva_s  || [];
  var cfg    = d.config   || {};
  if (!pontos.length) { svg.innerHTML = ''; return; }

  var currentDay = parseInt(cfg.current_day)      || 0;
  var currentPct = parseInt(cfg.progress_percent) || 0;

  // ── Dimensões dinâmicas: o SVG se encaixa no container real ──────────────
  var W = 820;
  var wrap = svg.parentElement;
  var cw = wrap ? Math.max(300, wrap.clientWidth  - 36) : 560;  // inner width  (36 = padding LR)
  var ch = wrap ? Math.max(180, wrap.clientHeight - 14) : 240;  // inner height (14 = padding TB)
  var H  = Math.min(520, Math.max(220, Math.round(W * ch / cw)));

  var padL = 56, padR = 24;
  var padT = Math.round(H * 0.12);
  var padB = Math.max(58, Math.round(H * 0.19)); // mínimo 58 px: 30 dots + 28 legenda
  var chartW = W - padL - padR;
  var chartH = H - padT - padB;
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

  // Âncoras verticais — dots com tamanho fixo (r=10, fs=12 como original)
  var dotsR  = 10;
  var dotsY  = padT + chartH + 20;   // centro do círculo
  var dotsTY = dotsY + 5;            // baseline do texto (centrado visualmente)
  var legY   = H - 18;               // linha da legenda
  var legTY  = H - 5;                // texto da legenda

  var maxDay = Math.max.apply(null, pontos.map(function (p) { return parseInt(p.dia) || 0; }));
  maxDay = Math.max(maxDay, 1);

  function sx(dayVal) { return padL + (dayVal / maxDay) * chartW; }
  function sy(pctVal) { return padT + chartH - (pctVal / 100) * chartH; }

  var dayLabels = pontos.map(function (p) { return parseInt(p.dia) || 0; });
  if (dayLabels.indexOf(maxDay) < 0) dayLabels.push(maxDay);
  dayLabels = dayLabels.filter(function (v, i, a) { return a.indexOf(v) === i; });
  dayLabels.sort(function (a, b) { return a - b; });
  var dayLabelPos = {};
  (function buildEvenDotSpacing() {
    var n = dayLabels.length;
    if (n <= 0) return;
    if (n === 1) {
      dayLabelPos[dayLabels[0]] = padL + chartW / 2;
      return;
    }
    var left = padL + 10;
    var right = padL + chartW - 10;
    var span = right - left;
    for (var i = 0; i < n; i++) {
      dayLabelPos[dayLabels[i]] = left + (i * span / (n - 1));
    }
  })();

  // Smooth cubic bezier path through points
  function smoothPath(pts) {
    if (!pts.length) return '';
    var d = 'M' + pts[0][0].toFixed(1) + ',' + pts[0][1].toFixed(1);
    for (var i = 1; i < pts.length; i++) {
      var prev = pts[i - 1], curr = pts[i];
      var cpx = ((prev[0] + curr[0]) / 2).toFixed(1);
      d += ' C' + cpx + ',' + prev[1].toFixed(1) + ' ' + cpx + ',' + curr[1].toFixed(1) + ' ' + curr[0].toFixed(1) + ',' + curr[1].toFixed(1);
    }
    return d;
  }

  function areaPath(pts) {
    if (!pts.length) return '';
    var line = smoothPath(pts);
    var bY = (padT + chartH).toFixed(1);
    return line + ' L' + pts[pts.length - 1][0].toFixed(1) + ',' + bY + ' L' + pts[0][0].toFixed(1) + ',' + bY + ' Z';
  }

  var plannedCoords = pontos.map(function (p) {
    return [sx(parseInt(p.dia) || 0), sy(parseInt(p.planejado) || 0)];
  });
  var realCoords = pontos
    .filter(function (p) { return p.realizado !== null && p.realizado !== undefined; })
    .map(function (p) { return [sx(parseInt(p.dia) || 0), sy(parseInt(p.realizado) || 0)]; });

  var pD = smoothPath(plannedCoords);
  var rD = smoothPath(realCoords);
  var pA = areaPath(plannedCoords);
  var rA = areaPath(realCoords);

  var pcts  = [0, 25, 50, 75, 100];

  var cx = sx(currentDay);
  var cy = sy(currentPct);
  var bubbleX = Math.min(Math.max(padL + 5, cx - 41), W - padR - 82);
  var bubbleY = padT - 10;

  svg.innerHTML =
    '<text x="0" y="13" class="chart-label">% Conclusão</text>' +

    // Eixos
    '<line x1="' + padL + '" y1="' + (padT + chartH) + '" x2="' + (padL + chartW) + '" y2="' + (padT + chartH) + '" class="chart-axis"/>' +
    '<line x1="' + padL + '" y1="' + padT + '" x2="' + padL + '" y2="' + (padT + chartH) + '" class="chart-axis"/>' +

    // Grade + labels Y
    '<text x="' + (padL - 6) + '" y="' + (padT + chartH + 5) + '" class="chart-label" text-anchor="end">0</text>' +
    pcts.map(function (p) {
      var y = sy(p);
      return '<line x1="' + padL + '" y1="' + y + '" x2="' + (padL + chartW) + '" y2="' + y + '" class="grid-line"/>' +
        (p > 0 ? '<text x="' + (padL - 6) + '" y="' + (y + 5) + '" class="chart-label" text-anchor="end">' + p + '%</text>' : '');
    }).join('') +

    // Áreas preenchidas (atrás das linhas)
    '<path d="' + pA + '" class="area-planned"/>' +
    '<path d="' + rA + '" class="area-real"/>' +

    // Curvas suavizadas
    '<path d="' + pD + '" class="planned-line"/>' +
    '<path d="' + rD + '" class="real-line"/>' +

    // Linha vertical + ponto atual
    '<line x1="' + cx + '" y1="' + (padT + chartH) + '" x2="' + cx + '" y2="' + cy + '" class="current-line"/>' +
    '<circle cx="' + cx + '" cy="' + cy + '" r="7" class="current-dot"/>' +

    // Bubble de progresso
    '<rect x="' + bubbleX + '" y="' + bubbleY + '" width="82" height="63" rx="7" class="chart-bubble"/>' +
    '<text x="' + (bubbleX + 41) + '" y="' + (bubbleY + 24) + '" class="chart-bubble-text-small">Atual</text>' +
    '<text x="' + (bubbleX + 41) + '" y="' + (bubbleY + 52) + '" class="chart-bubble-text">' + currentPct + '%</text>' +

    // Labels eixo X
    dayLabels.map(function (dv) {
      var x = dayLabelPos[dv] !== undefined ? dayLabelPos[dv] : sx(dv);
      return '<circle cx="' + x + '" cy="' + dotsY + '" r="' + dotsR + '" class="day-dot"/>' +
             '<text x="' + x + '" y="' + dotsTY + '" text-anchor="middle" font-size="12" font-weight="900" fill="white">' + dv + '</text>';
    }).join('') +

    // Legenda agrupada e centralizada — posição proporcional ao padB
    (function() {
      var mid = padL + chartW / 2;
      var p1x = mid - 122, p2x = p1x + 34, ptx = p2x + 6;
      var r1x = ptx + 74 + 20, r2x = r1x + 34, rtx = r2x + 6;
      return '<line x1="' + p1x + '" y1="' + legY + '" x2="' + p2x + '" y2="' + legY + '" class="planned-line"/>' +
             '<text x="' + ptx + '" y="' + legTY + '" class="legend">Planejado</text>' +
             '<line x1="' + r1x + '" y1="' + legY + '" x2="' + r2x + '" y2="' + legY + '" class="real-line"/>' +
             '<text x="' + rtx + '" y="' + legTY + '" class="legend">Realizado</text>';
    }());
}

/* ===== Marcos ===== */
function renderMarcos(d) {
  var el    = document.getElementById('marcosBody');
  var items = d.marcos || [];
  if (!items.length) { el.innerHTML = ''; return; }

  var road = '';
  var rows = '';
  items.forEach(function (m, i) {
    var s   = (m.status || '').toLowerCase();
    var cls = '';
    var dot = '';
    if (s.includes('conclu'))         { cls = 'done';   dot = '&#10003;'; }
    else if (s.includes('andamento')) { cls = 'active'; dot = ''; }

    var icoHtml  = MARCO_ICONS[m.tipo] || MARCO_ICONS['star'];
    var icoStyle = (!cls) ? 'color:#8a909a' : '';

    var roadStatusClass = 'plan';
    if (s.includes('conclu'))         roadStatusClass = 'done';
    else if (s.includes('andamento')) roadStatusClass = 'active';

    // Cada road-section é flex:1 — alinha matematicamente com o milestone-row flex:1
    road += '<div class="road-section">' +
      '<div class="road-node ' + cls + '" aria-hidden="true">' + dot + '</div>' +
      (i < items.length - 1 ? '<div class="road-line"></div>' : '') +
      '</div>';

    rows += '<div class="milestone-row" data-edit-idx="' + i + '">' +
      '<div class="milestone-ico" style="' + icoStyle + '">' + icoHtml + '</div>' +
      '<div class="milestone-name"><span class="ms-num" aria-hidden="true">' + esc(String(i + 1)) + '.&nbsp;</span><span class="ms-name-text">' + esc(m.nome) + '</span></div>' +
      '<div class="milestone-date"><small>Data alvo:</small><span class="ms-date-text" data-raw-date="' + esc(v(m.data_alvo, '')) + '">' + esc(fmtDateShort(m.data_alvo)) + '</span></div>' +
      '<div class="milestone-status ms-status-wrap"><span class="road-status ' + roadStatusClass + '">' +
        esc(v(m.status, '')).toUpperCase() + '</span></div>' +
      '</div>';
  });

  el.innerHTML =
    '<div class="vertical-road">' + road + '</div>' +
    '<div class="milestones">' + rows + '</div>';
}

/* ===== Rodapé ===== */
function renderRodape(d) {
  var el  = document.getElementById('footerStrip');
  var r   = d.rodape || {};
  var cfg = d.config || {};

  // ── Melhoria 1: data do Relatório formatada ──────────────────────────────
  var relDateRaw = r.data_relatorio || cfg.report_date || '';
  var relDateFmt = relDateRaw ? fmtDateShort(relDateRaw) : '--';

  var items = [
    {
      title: 'Milestone Alvo',
      value: v(r.milestone_alvo, v(cfg.current_phase, '--')),
      rawVal: null,
      editAttr: 'data-edit-rodape="milestone_alvo"',
      strong: true, light: false, primary: true,
      svg: '<svg class="icon lg" viewBox="0 0 24 24"><path d="M4 21V5"/><path d="M4 5c5-3 8 3 16 0v10c-8 3-11-3-16 0"/></svg>',
    },
    {
      title: 'Data Alvo',
      value: r.data_alvo ? fmtDateShort(r.data_alvo) : '--',
      rawVal: v(r.data_alvo, ''),
      editAttr: 'data-edit-rodape="data_alvo"',
      strong: true, light: false, primary: false,
      svg: '<svg class="icon lg" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01"/></svg>',
    },
    {
      title: 'Go-Live Previsto',
      value: r.go_live_previsto ? fmtDateShort(r.go_live_previsto) : '--',
      rawVal: v(r.go_live_previsto, ''),
      editAttr: 'data-edit-rodape="go_live_previsto"',
      strong: true, light: false, primary: false,
      svg: '<svg class="icon lg" viewBox="0 0 24 24"><path d="M5 15c3-6 8-9 15-10-1 7-4 12-10 15l-5-5Z"/><path d="M7 17 4 20"/><circle cx="14" cy="10" r="1.6"/></svg>',
    },
    {
      title: 'Responsável',
      value: v(r.owner_relatorio, v(cfg.owner_name, '--')),
      rawVal: null,
      editAttr: 'data-edit-config="owner_name"',
      strong: false, light: true, primary: false,
      svg: '<svg class="icon lg" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 22c1.4-4 4.2-6 8-6s6.6 2 8 6"/></svg>',
    },
    {
      title: 'Relatório',
      value: esc(v(r.nome_relatorio, v(cfg.report_name, 'Status Executivo'))) +
             ' <span style="opacity:.55">&middot; ' + esc(relDateFmt) + '</span>',
      rawVal: null,
      editAttr: '',
      strong: false, light: true, primary: false,
      svg: '<svg class="icon lg" viewBox="0 0 24 24"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v6h5"/><path d="M10 13h6M10 17h6"/></svg>',
    },
  ];

  el.innerHTML = items.map(function (it) {
    var valClass  = 'foot-value' + (it.strong ? ' strong' : '');
    var iconClass = 'foot-icon'  + (it.light  ? ' light'  : '');
    var cardClass = 'foot-card'  + (it.primary ? ' foot-card-primary' : '');
    var editExtra = it.editAttr
      ? ' ' + it.editAttr + (it.rawVal !== null ? ' data-raw-val="' + esc(it.rawVal) + '"' : '')
      : '';
    return '<div class="' + cardClass + '">' +
      '<div class="' + iconClass + '" aria-hidden="true">' + it.svg + '</div>' +
      '<div class="foot-text">' +
        '<div class="foot-title">' + esc(it.title) + '</div>' +
        '<div class="' + valClass + '"' + editExtra + '>' + it.value + '</div>' +
      '</div></div>';
  }).join('');
}

/* ===== Exportação PDF / PPTX ===== */
async function exportPDF(ev) {
  if (hasUnsavedChanges()) {
    var saveFirst = confirm('Há alterações não salvas. Clique OK para salvar antes de exportar, ou Cancelar para abortar a exportação.');
    if (!saveFirst) return;
    await saveEdits();
    if (editMode || hasUnsavedChanges()) return;
  }
  if (editMode) _exitEditMode();
  var btn = ev.target;
  btn.textContent = 'Exportando...';
  btn.disabled = true;
  try {
    var resp = await fetch('/api/export/pdf', { method: 'POST' });
    if (!resp.ok) { var e = await resp.json(); alert(e.error || 'Erro'); return; }
    var blob = await resp.blob();
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href = url; a.download = 'status_report.pdf';
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    alert('Erro: ' + err.message);
  } finally {
    btn.textContent = 'Exportar PDF';
    btn.disabled = false;
  }
}

async function exportPPTX(ev) {
  if (hasUnsavedChanges()) {
    var saveFirst = confirm('Há alterações não salvas. Clique OK para salvar antes de exportar, ou Cancelar para abortar a exportação.');
    if (!saveFirst) return;
    await saveEdits();
    if (editMode || hasUnsavedChanges()) return;
  }
  if (editMode) _exitEditMode();
  var btn = ev.target;
  btn.textContent = 'Exportando...';
  btn.disabled = true;
  try {
    var resp = await fetch('/api/export/pptx', { method: 'POST' });
    if (!resp.ok) { var e = await resp.json(); alert(e.error || 'Erro'); return; }
    var blob = await resp.blob();
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href = url; a.download = 'status_report.pptx';
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    alert('Erro: ' + err.message);
  } finally {
    btn.textContent = 'Exportar PPTX';
    btn.disabled = false;
  }
}

async function safePrint() {
  if (hasUnsavedChanges()) {
    var saveFirst = confirm('Há alterações não salvas. Clique OK para salvar antes de imprimir, ou Cancelar para abortar.');
    if (!saveFirst) return;
    await saveEdits();
    if (editMode || hasUnsavedChanges()) return;
  }
  if (editMode) _exitEditMode();
  window.print();
}

async function requestPresentationMode() {
  if (hasUnsavedChanges()) {
    var saveFirst = confirm('Há alterações não salvas. Clique OK para salvar antes de entrar no modo apresentação, ou Cancelar para abortar.');
    if (!saveFirst) return;
    await saveEdits();
    if (editMode || hasUnsavedChanges()) return;
  }
  if (editMode) _exitEditMode();
  document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
}

/* ===== Edit Mode ===== */

var editMode = false;
var _editSnapshotData = null;

function isLockedField(name) {
  var rd = (_lastRenderData && _lastRenderData.reportData) || {};
  var locks = (((rd.meta || {}).locked_fields) || []);
  if (locks.indexOf(name) >= 0) return true;
  if (name === 'derived.raid_indicators') {
    return !!(((rd.derived || {}).raid_indicators || {}).has_pmar_source);
  }
  return false;
}

function toggleEditMode() {
  if (editMode) cancelEditMode();
  else enterEditMode();
}

function enterEditMode() {
  if (!_lastRenderData || (!_lastRenderData.data && !_lastRenderData.reportData)) return;
  _editSnapshotData = JSON.parse(JSON.stringify(_lastRenderData.reportData || _lastRenderData.data));
  editMode = true;
  clearDirty();
  document.body.classList.add('edit-mode');
  document.getElementById('editModeBar').style.display = 'flex';
  var btn = document.getElementById('btnEdit');
  if (btn) btn.classList.add('active');
  _attachAllEditHandlers();
}

function cancelEditMode() {
  if (!confirmLoseUnsaved('cancelamento')) return;
  _closeBadgeMenus();
  closeConfigDrawer();
  if (editMode && _lastRenderData) renderAll(_lastRenderData);
  _exitEditMode();
}

function _exitEditMode() {
  editMode = false;
  _editSnapshotData = null;
  clearDirty();
  document.body.classList.remove('edit-mode');
  document.getElementById('editModeBar').style.display = 'none';
  var btn = document.getElementById('btnEdit');
  if (btn) btn.classList.remove('active');
  // Remove any floating date pickers
  document.querySelectorAll('.date-overlay-input').forEach(function(el){ el.remove(); });
}

/* ── contenteditable sem quebra de layout ── */
function _ce(el) {
  if (!el || el.contentEditable === 'true') return;
  el.setAttribute('contenteditable', 'true');
  // Previne Enter de criar nova linha (mantém layout single-line)
  el.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
    if (e.key === 'Escape') { el.blur(); }
  });
  // Seleciona tudo ao focar
  el.addEventListener('focus', function() {
    var r = document.createRange();
    r.selectNodeContents(el);
    var s = window.getSelection();
    s.removeAllRanges(); s.addRange(r);
  });
  el.addEventListener('input', markDirty);
}

/* ── Date picker overlay — exibe formato executivo, nunca formato técnico ── */
function _openDatePicker(anchor, rawDateBR, onChange) {
  // Remove picker anterior
  document.querySelectorAll('.date-overlay-input').forEach(function(el){ el.remove(); });

  // dd/mm/yyyy → yyyy-mm-dd para input[type=date]
  var isoVal = '';
  var m = String(rawDateBR || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) isoVal = m[3] + '-' + m[2].padStart(2,'0') + '-' + m[1].padStart(2,'0');

  var inp = document.createElement('input');
  inp.type = 'date';
  inp.className = 'date-overlay-input';
  inp.value = isoVal;

  // Posição invisível próxima ao elemento
  var rect = anchor.getBoundingClientRect();
  inp.style.cssText = 'position:fixed;opacity:0;width:0;height:0;z-index:99999;';
  inp.style.top  = (rect.bottom + 2) + 'px';
  inp.style.left = rect.left + 'px';
  document.body.appendChild(inp);

  var done = false;
  inp.addEventListener('change', function() {
    if (done) return; done = true;
    var val = inp.value; // yyyy-mm-dd
    if (val) {
      var p = val.split('-');
      var newRaw = p[2] + '/' + p[1] + '/' + p[0];          // dd/mm/yyyy
      var formatted = fmtDateShort(val + 'T00:00:00');        // dd/mmm/aa
      onChange(newRaw, formatted || newRaw);
      markDirty();
    }
    inp.remove();
  });
  inp.addEventListener('blur', function() {
    setTimeout(function(){ if(document.body.contains(inp)) inp.remove(); }, 250);
  });

  inp.focus();
  if (typeof inp.showPicker === 'function') {
    try { inp.showPicker(); } catch(e) {}
  }
}

/* Torna elemento de data clicável (sem contenteditable) */
function _dateField(el, rawDateBR, onSave) {
  if (!el || el.dataset.editDateAttached) return;
  el.dataset.editDateAttached = '1';
  el.dataset.rawDate = rawDateBR || '';
  el.classList.add('edit-date-field');

  el.addEventListener('click', function(e) {
    if (!editMode) return;
    e.preventDefault(); e.stopPropagation();
    _openDatePicker(el, el.dataset.rawDate, function(newRaw, formatted) {
      el.textContent = formatted;
      el.dataset.rawDate = newRaw;
      onSave(newRaw);
    });
  });
}

/* ── Badge dropdown premium (substitui native select) ── */
function _closeBadgeMenus() {
  document.querySelectorAll('.badge-sel-menu.open').forEach(function(m){ m.classList.remove('open'); });
}

/* Mapeamento status → classe CSS (compatível com road-status e status-pill) */
function _bdotClass(status) {
  var s = (status || '').toLowerCase();
  if (s.includes('conclu') || s === 'no prazo' || s === 'success') return 'done';
  if (s.includes('andamento') || s === 'warning' || s.includes('aten')) return 'warning';
  if (s === 'atrasado' || s === 'danger') return 'danger';
  return 'plan';
}

function _badgeDropdown(el, options, currentVal, computeBadgeClass, onChange) {
  if (!el || el.parentNode.classList.contains('badge-sel-wrap')) return;

  var wrap = document.createElement('span');
  wrap.className = 'badge-sel-wrap';

  // Clona o badge original (mantém classes/estilos exatos)
  var badge = el.cloneNode(true);
  badge.classList.add('badge-sel-trigger');
  badge.textContent = currentVal ? currentVal.toUpperCase() : '';
  if (computeBadgeClass) {
    badge.className = el.className + ' badge-sel-trigger';
    badge.classList.remove('road-status', 'status-pill');
    badge.className = (computeBadgeClass(currentVal) || el.className) + ' badge-sel-trigger';
  }

  var menu = document.createElement('div');
  menu.className = 'badge-sel-menu';

  options.forEach(function(opt) {
    var item = document.createElement('div');
    item.className = 'badge-sel-item';
    var dot = document.createElement('span');
    dot.className = 'badge-sel-dot ' + _bdotClass(opt);
    item.appendChild(dot);
    item.appendChild(document.createTextNode(opt.toUpperCase()));
    item.addEventListener('click', function(e) {
      e.stopPropagation();
      badge.textContent = opt.toUpperCase();
      if (computeBadgeClass) badge.className = computeBadgeClass(opt) + ' badge-sel-trigger';
      menu.classList.remove('open');
      onChange(opt);
      markDirty();
    });
    menu.appendChild(item);
  });

  badge.addEventListener('click', function(e) {
    e.stopPropagation();
    var isOpen = menu.classList.contains('open');
    _closeBadgeMenus();
    if (!isOpen) menu.classList.add('open');
  });

  document.addEventListener('click', _closeBadgeMenus);

  wrap.appendChild(badge);
  wrap.appendChild(menu);
  el.parentNode.replaceChild(wrap, el);
}

/* ── Botão × absolutamente posicionado ── */
function _rmBtn(onClick) {
  var btn = document.createElement('button');
  btn.className = 'edit-rm-btn';
  btn.title = 'Remover';
  btn.innerHTML = '&times;';
  btn.type = 'button';
  btn.onclick = onClick;
  return btn;
}

/* ── Botão Adicionar (fora da lista, sem quebrar layout) ── */
function _addWrap(label, onClick) {
  var div = document.createElement('div');
  div.className = 'edit-add-wrap';
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'edit-add-btn';
  btn.textContent = '+ ' + label;
  btn.onclick = onClick;
  div.appendChild(btn);
  return div;
}

/* ── Ativa todos os handlers ── */
function _attachAllEditHandlers() {
  _attachHeaderHandlers();
  _attachKpisHandlers();
  _attachResumoHandlers();
  _attachPendenciasHandlers();
  _attachAcoesHandlers();
  _attachMarcosHandlers();
  _attachFooterHandlers();
}

/* ── Header ── */
function _attachHeaderHandlers() {
  _ce(document.getElementById('projectTitle'));
  _ce(document.getElementById('projectSubtitle'));
  _ce(document.getElementById('alertText'));
}

/* ── KPI cards (label + value, sem quebrar card) ── */
function _attachKpisHandlers() {
  document.querySelectorAll('#kpis .kpi-card[data-kpi-orig-idx]').forEach(function(card) {
    var origIdx = parseInt(card.dataset.kpiOrigIdx, 10);
    var k = ((_editSnapshotData.kpis || [])[origIdx]) || {};
    var title = String(k.titulo || '').toLowerCase();
    var lockedByRaid = isLockedField('derived.raid_indicators') && (k.tipo === 'warning' || k.tipo === 'heart');
    var lockedByCalc = title.indexOf('spi') >= 0 || title.indexOf('risco atual') >= 0 || title.indexOf('saúde geral') >= 0 || title.indexOf('saude geral') >= 0;
    if (lockedByRaid || lockedByCalc) {
      card.classList.add('edit-locked');
      card.title = 'Indicador automático';
      return;
    }
    var lbl = card.querySelector('.kpi-body .label');
    var val = card.querySelector('.kpi-body .value');
    if (lbl) _ce(lbl);
    if (val) _ce(val);
  });
}

/* ── Resumo Executivo ── */
function _attachResumoHandlers() {
  var container = document.getElementById('resumo');
  if (!container) return;

  container.querySelectorAll('li[data-edit-idx]').forEach(function(li) {
    var idx = parseInt(li.dataset.editIdx, 10);

    // Texto editável
    _ce(li.querySelector('.resumo-text'));

    // Toggle de status no dot — sem outline permanente
    var dot = li.querySelector('.status-dot');
    if (dot && !dot.classList.contains('edit-toggle')) {
      dot.classList.add('edit-toggle');
      dot.title = 'Clique: concluído ↔ em andamento';
      dot.addEventListener('click', function() {
        var cur = ((_editSnapshotData.resumo_executivo[idx] || {}).status || '').toLowerCase();
        var ns = cur.includes('conclu') ? 'andamento' : 'concluido';
        _editSnapshotData.resumo_executivo[idx].status = ns;
        dot.classList.toggle('pending', !ns.includes('conclu'));
        dot.innerHTML = ns.includes('conclu') ? '&#10003;' : '';
        markDirty();
      });
    }

    // Botão remover (absolutamente posicionado)
    if (!li.querySelector('.edit-rm-btn')) {
      li.appendChild(_rmBtn(function() {
        _editSnapshotData.resumo_executivo.splice(idx, 1);
        markDirty();
        renderResumo({ resumo_executivo: _editSnapshotData.resumo_executivo });
        _attachResumoHandlers();
        _reattachAddBtn('resumo', 'Adicionar item', addResumoItem);
      }));
    }
  });

  // Botão adicionar FORA da lista
  _reattachAddBtn('resumo', 'Adicionar item', addResumoItem);
}

function _reattachAddBtn(listId, label, fn) {
  var container = document.getElementById(listId);
  if (!container) return;
  var parent = container.parentNode;
  if (parent) parent.classList.add('edit-add-host');
  // Remove antigo wrap se existir
  var prev = parent.querySelector('.edit-add-wrap[data-for="' + listId + '"]');
  if (prev) prev.remove();
  var wrap = _addWrap(label, fn);
  wrap.dataset.for = listId;
  if (parent) parent.appendChild(wrap);
}

function addResumoItem() {
  if (!_editSnapshotData) return;
  if (!_editSnapshotData.resumo_executivo) _editSnapshotData.resumo_executivo = [];
  _editSnapshotData.resumo_executivo.push({ ordem: _editSnapshotData.resumo_executivo.length + 1, texto: 'Novo item', status: 'andamento' });
  markDirty();
  renderResumo({ resumo_executivo: _editSnapshotData.resumo_executivo });
  _attachResumoHandlers();
}

/* ── Pendências Críticas ── */
var _PEND_STATUS = ['Em atenção', 'Atrasado', 'No prazo', 'Concluído'];
var _PEND_NIVEL  = { 'em atenção': 'warning', 'atrasado': 'danger', 'no prazo': 'success', 'concluído': 'success', 'concluido': 'success' };

function _pendBadgeClass(val) {
  var c = sc(val);
  return 'status-pill ' + c;
}

function _attachPendenciasHandlers() {
  var tbody = document.getElementById('pendencias');
  if (!tbody) return;

  tbody.querySelectorAll('tr[data-edit-idx]').forEach(function(tr) {
    var idx = parseInt(tr.dataset.editIdx, 10);
    var pend = (_editSnapshotData.pendencias_criticas || [])[idx] || {};

    _ce(tr.querySelector('.risk-title'));

    // Status pill → badge dropdown
    var pill = tr.querySelector('.status-pill');
    if (pill && !pill.parentNode.classList.contains('badge-sel-wrap')) {
      _badgeDropdown(pill, _PEND_STATUS, pend.status, _pendBadgeClass, function(val) {
        if (_editSnapshotData.pendencias_criticas[idx]) {
          _editSnapshotData.pendencias_criticas[idx].status = val;
          _editSnapshotData.pendencias_criticas[idx].nivel  = _PEND_NIVEL[val.toLowerCase()] || 'warning';
          markDirty();
        }
      });
    }

    // Botão remover
    if (!tr.querySelector('.edit-rm-btn')) {
      var td = document.createElement('td');
      td.style.verticalAlign = 'middle';
      td.appendChild(_rmBtn(function() {
        _editSnapshotData.pendencias_criticas.splice(idx, 1);
        markDirty();
        renderPendencias({ pendencias_criticas: _editSnapshotData.pendencias_criticas });
        _attachPendenciasHandlers();
      }));
      tr.appendChild(td);
    }
  });

  _reattachAddBtn('pendencias', 'Adicionar pendência', addPendenciaItem);
}

function addPendenciaItem() {
  if (!_editSnapshotData) return;
  if (!_editSnapshotData.pendencias_criticas) _editSnapshotData.pendencias_criticas = [];
  var n = _editSnapshotData.pendencias_criticas.length + 1;
  _editSnapshotData.pendencias_criticas.push({
    prioridade: 'P' + n, item: 'Nova pendência', responsaveis: '',
    status: 'Em atenção', nivel: 'warning',
    id_origem: null, categoria: null, score: null, probabilidade: null,
    impacto: null, estrategia: null, data_limite: null, comentarios: null
  });
  markDirty();
  renderPendencias({ pendencias_criticas: _editSnapshotData.pendencias_criticas });
  _attachPendenciasHandlers();
}

/* ── Próximas Ações ── */
function _attachAcoesHandlers() {
  var container = document.getElementById('acoes');
  if (!container) return;

  container.querySelectorAll('li[data-edit-idx]').forEach(function(li) {
    var idx = parseInt(li.dataset.editIdx, 10);
    _ce(li.querySelector('.acao-text'));
    if (!li.querySelector('.edit-rm-btn')) {
      li.appendChild(_rmBtn(function() {
        _editSnapshotData.proximas_acoes.splice(idx, 1);
        markDirty();
        renderAcoes({ proximas_acoes: _editSnapshotData.proximas_acoes });
        _attachAcoesHandlers();
        _reattachAddBtn('acoes', 'Adicionar ação', addAcaoItem);
      }));
    }
  });

  _reattachAddBtn('acoes', 'Adicionar ação', addAcaoItem);
}

function addAcaoItem() {
  if (!_editSnapshotData) return;
  if (!_editSnapshotData.proximas_acoes) _editSnapshotData.proximas_acoes = [];
  _editSnapshotData.proximas_acoes.push({ ordem: _editSnapshotData.proximas_acoes.length + 1, texto: 'Nova ação' });
  markDirty();
  renderAcoes({ proximas_acoes: _editSnapshotData.proximas_acoes });
  _attachAcoesHandlers();
}

/* ── Marcos ── */
var _MARCO_STATUS = ['Concluído', 'Em andamento', 'Planejado', 'Atrasado'];

function _marcoBadgeClass(val) {
  var s = (val || '').toLowerCase();
  if (s.includes('conclu'))    return 'road-status done';
  if (s.includes('andamento')) return 'road-status active';
  if (s === 'atrasado')        return 'road-status danger';
  return 'road-status plan';
}

function _attachMarcosHandlers() {
  document.querySelectorAll('.milestone-row[data-edit-idx]').forEach(function(row) {
    var idx = parseInt(row.dataset.editIdx, 10);
    var marco = (_editSnapshotData.marcos || [])[idx] || {};

    // Nome (inline, sem quebrar alinhamento)
    _ce(row.querySelector('.ms-name-text'));

    // Data — usa date picker, mantém formato executivo na tela
    var dateEl = row.querySelector('.ms-date-text');
    if (dateEl && !dateEl.dataset.editDateAttached) {
      _dateField(dateEl, dateEl.dataset.rawDate || '', function(newRaw) {
        if (_editSnapshotData.marcos[idx]) _editSnapshotData.marcos[idx].data_alvo = newRaw;
        markDirty();
      });
    }

    // Status — badge dropdown premium
    var statusEl = row.querySelector('.road-status');
    if (statusEl && !statusEl.parentNode.classList.contains('badge-sel-wrap')) {
      _badgeDropdown(statusEl, _MARCO_STATUS, marco.status, _marcoBadgeClass, function(val) {
        if (_editSnapshotData.marcos[idx]) _editSnapshotData.marcos[idx].status = val;
        markDirty();
      });
    }

    // Remover
    if (!row.querySelector('.edit-rm-btn')) {
      row.appendChild(_rmBtn(function() {
        _editSnapshotData.marcos.splice(idx, 1);
        markDirty();
        renderMarcos({ marcos: _editSnapshotData.marcos });
        _attachMarcosHandlers();
      }));
    }
  });
}

/* ── Footer — datas com picker, texto com contenteditable ── */
function _attachFooterHandlers() {
  document.querySelectorAll('[data-edit-rodape]').forEach(function(el) {
    var key = el.dataset.editRodape;
    var rawVal = el.dataset.rawVal;

    if (rawVal !== undefined && rawVal !== '') {
      // Campo de data: usa picker, mantém formato executivo
      if (!el.dataset.editDateAttached) {
        _dateField(el, rawVal, function(newRaw) {
          el.dataset.rawVal = newRaw;
          if (!_editSnapshotData.rodape) _editSnapshotData.rodape = {};
          _editSnapshotData.rodape[key] = newRaw;
          markDirty();
        });
      }
    } else {
      // Campo de texto: contenteditable normal
      _ce(el);
    }
  });
  document.querySelectorAll('[data-edit-config]').forEach(function(el) {
    _ce(el);
  });
}

/* ── Coleta dados para salvar ── */
function collectEdits() {
  var data = JSON.parse(JSON.stringify(_editSnapshotData));

  // Header
  var el;
  el = document.getElementById('projectTitle');
  if (el && el.contentEditable === 'true') data.config.project_name = el.textContent.trim();
  el = document.getElementById('projectSubtitle');
  if (el && el.contentEditable === 'true') data.config.project_subtitle = el.textContent.trim();
  el = document.getElementById('alertText');
  if (el && el.contentEditable === 'true') data.config.alert_label = el.textContent.trim();

  // KPIs
  document.querySelectorAll('#kpis .kpi-card[data-kpi-orig-idx]').forEach(function(card) {
    var origIdx = parseInt(card.dataset.kpiOrigIdx, 10);
    if (!data.kpis || !data.kpis[origIdx]) return;
    var lbl = card.querySelector('.kpi-body .label');
    var val = card.querySelector('.kpi-body .value');
    if (lbl && lbl.contentEditable === 'true') data.kpis[origIdx].titulo = lbl.textContent.trim();
    if (val && val.contentEditable === 'true') data.kpis[origIdx].valor  = val.textContent.trim();
  });

  // Resumo
  document.querySelectorAll('#resumo li[data-edit-idx]').forEach(function(li) {
    var idx = parseInt(li.dataset.editIdx, 10);
    if (!data.resumo_executivo || !data.resumo_executivo[idx]) return;
    var t = li.querySelector('.resumo-text');
    if (t) data.resumo_executivo[idx].texto = t.textContent.trim();
  });

  // Ações
  document.querySelectorAll('#acoes li[data-edit-idx]').forEach(function(li) {
    var idx = parseInt(li.dataset.editIdx, 10);
    if (!data.proximas_acoes || !data.proximas_acoes[idx]) return;
    var t = li.querySelector('.acao-text');
    if (t) data.proximas_acoes[idx].texto = t.textContent.trim();
  });

  // Pendências
  document.querySelectorAll('#pendencias tr[data-edit-idx]').forEach(function(tr) {
    var idx = parseInt(tr.dataset.editIdx, 10);
    if (!data.pendencias_criticas || !data.pendencias_criticas[idx]) return;
    var rt = tr.querySelector('.risk-title');
    if (rt && rt.contentEditable === 'true') data.pendencias_criticas[idx].item = rt.textContent.trim();
    // status/nivel já atualizado pelo onChange do badge dropdown
  });

  // Marcos — data lida de dataset.rawDate (não de textContent que mostra formato executivo)
  document.querySelectorAll('.milestone-row[data-edit-idx]').forEach(function(row) {
    var idx = parseInt(row.dataset.editIdx, 10);
    if (!data.marcos || !data.marcos[idx]) return;
    var ne = row.querySelector('.ms-name-text');
    var de = row.querySelector('.ms-date-text');
    if (ne && ne.contentEditable === 'true') data.marcos[idx].nome = ne.textContent.trim();
    if (de && de.dataset.rawDate) data.marcos[idx].data_alvo = de.dataset.rawDate;
    // status já atualizado pelo onChange
  });

  // Footer — texto editável via contenteditable, datas via dataset
  document.querySelectorAll('[data-edit-rodape]').forEach(function(el) {
    if (!data.rodape) data.rodape = {};
    var key = el.dataset.editRodape;
    if (el.dataset.editDateAttached) {
      // Data: usa rawDate do dataset (atualizado pelo picker)
      if (el.dataset.rawVal) data.rodape[key] = el.dataset.rawVal;
    } else if (el.contentEditable === 'true') {
      data.rodape[key] = el.textContent.trim();
    }
  });
  document.querySelectorAll('[data-edit-config]').forEach(function(el) {
    if (el.contentEditable === 'true') data.config[el.dataset.editConfig] = el.textContent.trim();
  });

  // Reordenar arrays
  if (data.resumo_executivo) data.resumo_executivo = data.resumo_executivo.map(function(r,i){ return Object.assign({},r,{ordem:i+1}); });
  if (data.proximas_acoes)   data.proximas_acoes   = data.proximas_acoes.map(function(a,i){ return Object.assign({},a,{ordem:i+1}); });
  if (data.marcos)           data.marcos           = data.marcos.map(function(m,i){ return Object.assign({},m,{ordem:i+1}); });
  if (data.fases)            data.fases            = data.fases.map(function(f,i){ return Object.assign({},f,{ordem:i+1}); });
  if (data.kpis)             data.kpis             = data.kpis.map(function(k,i){ return Object.assign({},k,{ordem:i+1}); });

  return data;
}

/* ── Salvar ── */
async function saveEdits() {
  _closeBadgeMenus();
  closeConfigDrawer();
  var payload = collectEdits();
  var btn = document.getElementById('btnSaveEdits');
  if (btn) { btn.textContent = 'Salvando…'; btn.disabled = true; }
  try {
    var resp = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!resp.ok) {
      var err = await resp.json();
      alert('Erro ao salvar: ' + (err.error || 'Erro desconhecido'));
      return;
    }
    clearDirty();
    _exitEditMode();
  } catch(err) {
    alert('Erro: ' + err.message);
  } finally {
    if (btn) { btn.textContent = '✓ Salvar alterações'; btn.disabled = false; }
  }
}

/* ===== Config Drawer ===== */

function openConfigDrawer() {
  if (!_editSnapshotData) return;
  _buildConfigDrawer();
  document.getElementById('configDrawer').classList.add('open');
  document.getElementById('configDrawer').setAttribute('aria-hidden', 'false');
  document.getElementById('configDrawerBackdrop').style.display = 'block';
}

function closeConfigDrawer() {
  var d = document.getElementById('configDrawer');
  if (d) { d.classList.remove('open'); d.setAttribute('aria-hidden', 'true'); }
  var b = document.getElementById('configDrawerBackdrop');
  if (b) b.style.display = 'none';
}

function _buildConfigDrawer() {
  var d  = _editSnapshotData;
  var body = document.getElementById('configDrawerBody');
  body.innerHTML = '';
  var cfg    = d.config  || {};
  var rodape = d.rodape  || {};

  /* ─ helpers ─ */
  function sec(title) {
    var s = document.createElement('div'); s.className = 'drawer-section';
    var h = document.createElement('h4'); h.className = 'drawer-section-title'; h.textContent = title;
    s.appendChild(h); return s;
  }
  function addF(parent, label, inp) {
    var wrap = document.createElement('div'); wrap.className = 'drawer-field';
    var lbl  = document.createElement('label'); lbl.className = 'drawer-label'; lbl.textContent = label;
    wrap.appendChild(lbl); wrap.appendChild(inp); parent.appendChild(wrap);
  }
  function txt(val, cb) {
    var i = document.createElement('input'); i.type = 'text'; i.className = 'drawer-input';
    i.value = val != null ? String(val) : '';
    i.addEventListener('input', function(){ cb(i.value); markDirty(); }); return i;
  }
  function txtDateFriendly(val, cb) {
    var pretty = '';
    if (val !== null && val !== undefined && String(val).trim() !== '') {
      var s = String(val).trim();
      var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
      if (iso) pretty = iso[3] + '/' + iso[2] + '/' + iso[1];
      else pretty = s;
    }
    var i = document.createElement('input'); i.type = 'text'; i.className = 'drawer-input';
    i.placeholder = 'dd/mm/aaaa';
    i.value = pretty;
    i.addEventListener('input', function(){ cb(i.value); markDirty(); }); return i;
  }
  function num(val, cb) {
    var i = document.createElement('input'); i.type = 'number'; i.className = 'drawer-input';
    i.value = val != null ? String(val) : '';
    i.addEventListener('input', function(){ cb(i.value === '' ? '' : Number(i.value)); markDirty(); }); return i;
  }
  function sel(val, opts, cb) {
    var s = document.createElement('select'); s.className = 'drawer-select';
    opts.forEach(function(o){
      var op = document.createElement('option'); op.value = o.v; op.textContent = o.l;
      if (String(o.v) === String(val != null ? val : '')) op.selected = true;
      s.appendChild(op);
    });
    s.addEventListener('change', function(){ cb(s.value); markDirty(); }); return s;
  }

  /* ─ Projeto ─ */
  var s1 = sec('Projeto');
  addF(s1, 'Nome do Projeto',    txt(cfg.project_name,     function(v){d.config.project_name=v;}));
  addF(s1, 'Subtítulo',          txt(cfg.project_subtitle, function(v){d.config.project_subtitle=v;}));
  addF(s1, 'Sponsor / Cliente',  txt(cfg.sponsor,          function(v){d.config.sponsor=v;}));
  addF(s1, 'Parceiro',           txt(cfg.partner_name,     function(v){d.config.partner_name=v;}));
  addF(s1, 'Responsável (PM)',   txt(cfg.owner_name,       function(v){d.config.owner_name=v;}));
  addF(s1, 'Data do Relatório',  txtDateFriendly(cfg.report_date, function(v){d.config.report_date=v;}));
  addF(s1, 'Nome do Relatório',  txt(cfg.report_name,      function(v){d.config.report_name=v;}));
  body.appendChild(s1);

  /* ─ Andamento ─ */
  var s2 = sec('Andamento');
  addF(s2, 'Fase Atual',              txt(cfg.current_phase,    function(v){d.config.current_phase=v;}));
  addF(s2, 'Dia Atual',               num(cfg.current_day,      function(v){d.config.current_day=v;}));
  addF(s2, 'Total de Dias do Projeto',num(cfg.total_days,       function(v){d.config.total_days=v;}));
  addF(s2, '% Planejado (Curva S)',   num(cfg.progress_percent, function(v){d.config.progress_percent=v;}));
  body.appendChild(s2);

  /* ─ Alerta ─ */
  var s3 = sec('Alerta no Header');
  addF(s3, 'Texto', txt(cfg.alert_label, function(v){d.config.alert_label=v;}));
  addF(s3, 'Nível', sel(cfg.alert_level, [
    {v:'warning', l:'⚠ Atenção (amarelo)'},
    {v:'danger',  l:'🔴 Crítico (vermelho)'},
    {v:'success', l:'✅ OK (verde)'},
    {v:'',        l:'— Ocultar alerta'},
  ], function(v){d.config.alert_level=v;}));
  body.appendChild(s3);

  /* ─ Rodapé ─ */
  var s4 = sec('Rodapé');
  addF(s4, 'Milestone Alvo',          txt(rodape.milestone_alvo,    function(v){d.rodape.milestone_alvo=v;}));
  addF(s4, 'Data Alvo (dd/mm/aaaa)',  txtDateFriendly(rodape.data_alvo, function(v){d.rodape.data_alvo=v;}));
  addF(s4, 'Go-Live (dd/mm/aaaa)',    txtDateFriendly(rodape.go_live_previsto, function(v){d.rodape.go_live_previsto=v;}));
  body.appendChild(s4);

  /* ─ Fases ─ */
  var s5 = sec('Fases do Projeto (Timeline)');
  s5.appendChild(_drawerFases(d));
  body.appendChild(s5);

  /* ─ KPIs ─ */
  var s6 = sec('Indicadores — KPI Cards');
  s6.appendChild(_drawerKpis(d));
  body.appendChild(s6);

  /* ─ Curva S ─ */
  var s7 = sec('Curva S — Dados do Gráfico');
  var note = document.createElement('p'); note.className = 'drawer-note';
  note.textContent = 'Informe Dia, % Planejado e % Realizado. Deixe Realizado em branco para pontos futuros.';
  s7.appendChild(note);
  s7.appendChild(_drawerCurvaS(d));
  body.appendChild(s7);
}

/* ─ Tabela Fases no drawer ─ */
function _drawerFases(d) {
  var STATUS = ['Concluído', 'Em andamento', 'Planejado', 'Atrasado'];
  var wrap = document.createElement('div'); wrap.className = 'drawer-table-wrap';
  var tbl  = document.createElement('table'); tbl.className = 'drawer-table';
  tbl.innerHTML = '<thead><tr><th>Nome</th><th>Status</th><th>Início</th><th>Data Alvo</th><th title="Em foco">Foco</th><th></th></tr></thead>';
  var tbody = document.createElement('tbody'); tbl.appendChild(tbody); wrap.appendChild(tbl);

  function mkRow(f, idx) {
    var tr = document.createElement('tr');
    function c(el){ var td = document.createElement('td'); td.appendChild(el); return td; }

    var ni = document.createElement('input'); ni.type='text'; ni.className='drawer-table-input'; ni.value=String(f.nome||'');
    ni.oninput = function(){ d.fases[idx].nome = ni.value; markDirty(); }; tr.appendChild(c(ni));

    var ss = document.createElement('select'); ss.className='drawer-table-select';
    STATUS.forEach(function(o){ var op=document.createElement('option'); op.value=o; op.textContent=o;
      if((f.status||'').toLowerCase()===o.toLowerCase()) op.selected=true; ss.appendChild(op); });
    ss.onchange=function(){ d.fases[idx].status=ss.value; markDirty(); }; tr.appendChild(c(ss));

    var ii=document.createElement('input'); ii.type='text'; ii.className='drawer-table-input'; ii.value=String(f.data_inicio||''); ii.placeholder='dd/mm/aaaa';
    ii.oninput=function(){ d.fases[idx].data_inicio=ii.value; markDirty(); }; tr.appendChild(c(ii));

    var ai=document.createElement('input'); ai.type='text'; ai.className='drawer-table-input'; ai.value=String(f.data_alvo||''); ai.placeholder='dd/mm/aaaa';
    ai.oninput=function(){ d.fases[idx].data_alvo=ai.value; markDirty(); }; tr.appendChild(c(ai));

    var cb=document.createElement('input'); cb.type='checkbox'; cb.className='drawer-table-checkbox';
    cb.checked=!!(f.destaque===true||f.destaque==='TRUE'||f.destaque===1);
    cb.onchange=function(){ d.fases[idx].destaque=cb.checked; markDirty(); };
    var cbtd=document.createElement('td'); cbtd.style.textAlign='center'; cbtd.appendChild(cb); tr.appendChild(cbtd);

    var rb=document.createElement('button'); rb.type='button'; rb.className='drawer-rm-btn'; rb.innerHTML='×';
    rb.onclick=function(){ d.fases.splice(idx,1); markDirty(); render(); }; tr.appendChild(c(rb));
    return tr;
  }
  function render() {
    tbody.innerHTML = '';
    (d.fases||[]).forEach(function(f,i){ tbody.appendChild(mkRow(f,i)); });
  }
  render();

  var add=document.createElement('button'); add.type='button'; add.className='drawer-add-btn'; add.textContent='+ Adicionar fase';
  add.onclick=function(){
    if(!d.fases) d.fases=[];
    d.fases.push({ordem:d.fases.length+1,nome:'Nova fase',status:'Planejado',data_inicio:'',data_alvo:'',destaque:false});
    markDirty();
    render();
  };
  var cont=document.createElement('div'); cont.appendChild(wrap); cont.appendChild(add); return cont;
}

/* ─ Tabela KPIs no drawer ─ */
function _drawerKpis(d) {
  var NIVEL = ['success','warning','danger'];
  var wrap = document.createElement('div'); wrap.className='drawer-table-wrap';
  var tbl  = document.createElement('table'); tbl.className='drawer-table';
  tbl.innerHTML='<thead><tr><th>Título</th><th>Valor</th><th>Subtítulo</th><th>Nível</th></tr></thead>';
  var tbody=document.createElement('tbody'); tbl.appendChild(tbody); wrap.appendChild(tbl);

  function mkRow(k,idx) {
    var tr=document.createElement('tr');
    function c(el){ var td=document.createElement('td'); td.appendChild(el); return td; }
    var title = String(k.titulo || '').toLowerCase();
    var lockedByRaid = isLockedField('derived.raid_indicators') && (k.tipo === 'warning' || k.tipo === 'heart');
    var lockedByCalc = title.indexOf('spi') >= 0 || title.indexOf('risco atual') >= 0 || title.indexOf('saúde geral') >= 0 || title.indexOf('saude geral') >= 0;
    var isLocked = lockedByRaid || lockedByCalc;
    function inp(val,cb){
      var i=document.createElement('input');
      i.type='text'; i.className='drawer-table-input'; i.value=String(val||'');
      if (isLocked) { i.disabled = true; i.classList.add('drawer-locked'); i.title = 'Campo automático'; }
      i.oninput=function(){cb(i.value); markDirty();}; return i;
    }

    tr.appendChild(c(inp(k.titulo,  function(v){d.kpis[idx].titulo=v;})));
    tr.appendChild(c(inp(k.valor,   function(v){d.kpis[idx].valor=v;})));
    tr.appendChild(c(inp(k.subtitulo,function(v){d.kpis[idx].subtitulo=v;})));

    var ns=document.createElement('select'); ns.className='drawer-table-select';
    NIVEL.forEach(function(o){ var op=document.createElement('option'); op.value=o; op.textContent=o;
      if((k.nivel||'success')===o) op.selected=true; ns.appendChild(op); });
    if (isLocked) { ns.disabled = true; ns.classList.add('drawer-locked'); ns.title = 'Campo automático'; }
    ns.onchange=function(){ d.kpis[idx].nivel=ns.value; markDirty(); }; tr.appendChild(c(ns));
    return tr;
  }
  (d.kpis||[]).forEach(function(k,i){ tbody.appendChild(mkRow(k,i)); });
  return wrap;
}

/* ─ Tabela Curva S no drawer ─ */
function _drawerCurvaS(d) {
  var wrap=document.createElement('div'); wrap.className='drawer-table-wrap';
  var tbl=document.createElement('table'); tbl.className='drawer-table';
  tbl.innerHTML='<thead><tr><th>Dia</th><th>Planejado %</th><th>Realizado %</th><th></th></tr></thead>';
  var tbody=document.createElement('tbody'); tbl.appendChild(tbody); wrap.appendChild(tbl);

  function mkRow(pt,idx) {
    var tr=document.createElement('tr');
    function nc(val,cb){
      var i=document.createElement('input'); i.type='number'; i.className='drawer-table-input';
      i.value=val!=null?String(val):''; i.oninput=function(){cb(i.value===''?null:Number(i.value)); markDirty();};
      var td=document.createElement('td'); td.appendChild(i); return td;
    }
    tr.appendChild(nc(pt.dia,       function(v){d.curva_s[idx].dia=v;}));
    tr.appendChild(nc(pt.planejado, function(v){d.curva_s[idx].planejado=v;}));
    tr.appendChild(nc(pt.realizado, function(v){d.curva_s[idx].realizado=v;}));
    var rb=document.createElement('button'); rb.type='button'; rb.className='drawer-rm-btn'; rb.innerHTML='×';
    rb.onclick=function(){ d.curva_s.splice(idx,1); markDirty(); render(); };
    var td=document.createElement('td'); td.appendChild(rb); tr.appendChild(td); return tr;
  }
  function render(){
    tbody.innerHTML='';
    (d.curva_s||[]).forEach(function(pt,i){ tbody.appendChild(mkRow(pt,i)); });
  }
  render();

  var add=document.createElement('button'); add.type='button'; add.className='drawer-add-btn'; add.textContent='+ Adicionar ponto';
  add.onclick=function(){
    if(!d.curva_s) d.curva_s=[];
    var last=d.curva_s.length?(d.curva_s[d.curva_s.length-1].dia||0):0;
    d.curva_s.push({dia:last+7,planejado:null,realizado:null});
    markDirty();
    render();
  };
  var cont=document.createElement('div'); cont.appendChild(wrap); cont.appendChild(add); return cont;
}

/* ===== Init ===== */
document.addEventListener('DOMContentLoaded', function () {
  loadData(true);
  connectWebSocket();
  window.addEventListener('beforeunload', function(e) {
    if (!hasUnsavedChanges()) return;
    e.preventDefault();
    e.returnValue = '';
  });
  window.addEventListener('resize', function () {
    syncDeckHeights();
    if (_lastRenderData) renderCurvaS(_lastRenderData.data || {});
  });
  /* Re-render Curva S ao entrar/sair do modo impressão para usar dimensões corretas */
  window.addEventListener('beforeprint', function () {
    if (_lastRenderData) renderCurvaS(_lastRenderData.data || {});
  });
  window.addEventListener('afterprint', function () {
    if (_lastRenderData) renderCurvaS(_lastRenderData.data || {});
  });
});
