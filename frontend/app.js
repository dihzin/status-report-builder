/* ===== Utilitários ===== */

var ws = null;
var SLIDE_STORAGE_KEY = 'statusDeck.currentSlide';
var currentSlide = _readStoredSlide();
var totalSlides = 5;
var _isDirty = false;
var _pendingAction = null;
var _isPresentationMode = false;
var _latestReleaseUrl = '';
var _updatePayload = null;
var EXPORT_TIMEOUT_MS = 45000;
var _appReady = false;
var _isLoadingData = false;
var _appState = 'booting';
var _appError = '';
var _updateUiState = {
  phase: 'idle',
  progress: 0,
  status: 'Não verificado',
  detail: 'Nenhuma operação em andamento.',
  bytes: 'Percentual exato disponível quando informado pela etapa.',
  variant: 'neutral',
  latestVersion: '',
  downloaded: false,
  modalMode: 'details'
};
var _updateConfirmPending = false;

function _readStoredSlide() {
  try {
    var raw = window.sessionStorage ? window.sessionStorage.getItem(SLIDE_STORAGE_KEY) : null;
    var n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 2;
  } catch (_) {
    return 2;
  }
}

function _writeStoredSlide(n) {
  try {
    if (window.sessionStorage) window.sessionStorage.setItem(SLIDE_STORAGE_KEY, String(n));
  } catch (_) {}
}

var UPDATE_PHASES = ['checking', 'downloading', 'validating', 'preparing', 'installing', 'restarting'];
var UPDATE_PHASE_META = {
  idle: { title: 'Aguardando ação', progress: 0 },
  checking: { title: 'Verificando release', progress: 12 },
  downloading: { title: 'Baixando atualização', progress: 46 },
  validating: { title: 'Validando integridade', progress: 68 },
  preparing: { title: 'Preparando instalação', progress: 82 },
  installing: { title: 'Instalando pacote', progress: 92 },
  restarting: { title: 'Reiniciando aplicativo', progress: 100 },
  success: { title: 'Verificação concluída', progress: 100 },
  error: { title: 'Ação interrompida', progress: 100 }
};

function _toErrorDetails(stage, err) {
  var fallback = err && err.message ? err.message : String(err || 'Erro desconhecido');
  return {
    stage: stage || 'unknown',
    message: fallback,
    stack: err && err.stack ? String(err.stack) : ''
  };
}

function _renderBootError(details) {
  var shell = document.querySelector('.page-shell');
  if (!shell) return;
  shell.innerHTML =
    '<div style="padding:60px;text-align:center;color:var(--red-700)">' +
    '<h2>Erro ao inicializar aplicação</h2><p>' + esc(details.message) + '</p></div>';
}

function markAppBooting() {
  _appReady = false;
  _appState = 'booting';
  _appError = '';
  if (window.__appInitError) window.__appInitError = null;
  _syncAppStateUi();
}

function markAppReady() {
  _appReady = true;
  _appState = 'ready';
  _appError = '';
  window.__appInitError = null;
  _syncAppStateUi();
}

function markAppInitError(stage, err) {
  var details = _toErrorDetails(stage, err);
  _appReady = false;
  _appState = 'error';
  _appError = details.message;
  window.__appInitError = details;
  console.error('[app-init:' + details.stage + ']', details.message, details.stack || '');
  _renderBootError(details);
  document.body.style.opacity = '1';
  _syncAppStateUi();
}

function _syncAppStateUi() {
  if (!document.body) return;
  document.body.dataset.appReady = _appReady ? 'true' : 'false';
  document.body.dataset.loading = _isLoadingData ? 'loading' : 'idle';
  document.body.dataset.mode = editMode ? 'edit' : 'view';
  document.body.dataset.appState = _appState;
  document.body.dataset.appError = _appError;
  var btn = document.getElementById('btnEdit');
  if (btn) {
    var canEnterEdit = _appReady && _appState === 'ready' && !_isLoadingData;
    btn.disabled = !canEnterEdit;
    btn.setAttribute('aria-disabled', canEnterEdit ? 'false' : 'true');
  }
  window.__renderComplete = _appReady && !_isLoadingData;
}

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

function _coverMetaDefault(key) {
  var defaults = {
    client: 'CLIENTE',
    owner: 'APRESENTADOR',
    date: 'DATA',
    duration: 'DURAÇÃO'
  };
  return defaults[key] || '';
}

function _coverTitleToStorage(text) {
  return String(text || '')
    .replace(/\u00a0/g, ' ')
    .split(/\r?\n+/)
    .map(function (line) { return line.trim(); })
    .filter(Boolean)
    .join(' | ');
}

function _renderCoverTitleHtml(rawTitle, highlight) {
  var titleRaw = v(rawTitle, 'Projeto').replace(/\|/g, '<br/>');
  var titleHtml = esc(titleRaw);
  if (highlight) {
    titleHtml = titleHtml.replace(new RegExp(reEsc(highlight), 'gi'), '<em>' + esc(highlight) + '</em>');
  }
  return titleHtml.replace(/&lt;br\/&gt;/g, '<br/>');
}

function markDirty() {
  _isDirty = true;
  _syncDirtyUi();
}

function clearDirty() {
  _isDirty = false;
  _syncDirtyUi();
}

function hasUnsavedChanges() {
  return editMode && _isDirty;
}

function confirmLoseUnsaved(contextLabel) {
  if (!hasUnsavedChanges()) return true;
  if (contextLabel === 'atualização') {
    return confirm('Você tem alterações não salvas. Deseja descartar e atualizar?');
  }
  return confirm('Existem alterações não salvas. Deseja descartar e continuar?');
}

function showToast(message, kind) {
  var t = document.getElementById('appToast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'appToast';
    t.className = 'app-toast';
    document.body.appendChild(t);
  }
  t.textContent = message;
  t.className = 'app-toast show ' + (kind || 'info');
  clearTimeout(t._hideTimer);
  t._hideTimer = setTimeout(function () { t.className = 'app-toast'; }, 2800);
}

function _clampPercent(value) {
  var n = Number(value);
  if (!isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function _setUpdatePhase(phase, options) {
  options = options || {};
  var meta = UPDATE_PHASE_META[phase] || UPDATE_PHASE_META.idle;
  _updateUiState.phase = phase;
  _updateUiState.progress = options.progress !== undefined ? _clampPercent(options.progress) : meta.progress;
  _updateUiState.status = options.status || _updateUiState.status || meta.title;
  _updateUiState.detail = options.detail || meta.title;
  _updateUiState.bytes = options.bytes || _updateUiState.bytes || '';
  _updateUiState.variant = options.variant || _updateUiState.variant || 'neutral';
  if (options.downloaded !== undefined) _updateUiState.downloaded = !!options.downloaded;
  if (options.latestVersion !== undefined) _updateUiState.latestVersion = options.latestVersion || '';
  _renderUpdateSurface();
}

function _formatUpdateBadge() {
  if (_updatePayload && _updatePayload.ok && _updatePayload.has_update) {
    if (_updateUiState.downloaded) return 'Pronto';
    return (_updatePayload.latest_version || 'Update').replace(/^v/i, 'v');
  }
  if (_updateUiState.phase === 'success') return 'Atualizado';
  if (_updateUiState.phase === 'error') return 'Atenção';
  if (_updateUiState.phase !== 'idle') return _updateUiState.progress + '%';
  return 'Verificar';
}

function _getToolbarUpdateStatus(payload, phase) {
  payload = payload || {};
  if (phase === 'checking') return 'Verificando';
  if (phase === 'downloading') return 'Baixando';
  if (phase === 'validating') return 'Validando';
  if (phase === 'preparing') return _updateUiState.downloaded ? 'Pronto para instalar' : 'Preparando';
  if (phase === 'installing') return 'Instalando';
  if (phase === 'restarting') return 'Reiniciando';
  if (phase === 'error') return 'Atenção';
  if (payload.ok && payload.has_update) {
    return _updateUiState.downloaded
      ? 'Pronto para instalar'
      : ((payload.latest_version || 'Nova versão') + ' disponível');
  }
  if (phase === 'success') return 'Sem novidades';
  return 'Não verificado';
}

function _renderUpdateSurface() {
  var payload = _updatePayload || {};
  var phase = _updateUiState.phase || 'idle';
  var badgeText = _formatUpdateBadge();
  var statusText = _updateUiState.status || 'Não verificado';
  var toolbarStatusText = _getToolbarUpdateStatus(payload, phase);
  var detailText = _updateUiState.detail || 'Nenhuma operação em andamento.';
  var progressValue = _clampPercent(_updateUiState.progress);
  var variant = _updateUiState.variant || 'neutral';
  var currentVersion = payload.current_version || '-';
  var latestVersion = payload.latest_version || _updateUiState.latestVersion || '-';
  var versionLabel = document.getElementById('appVersionLabel');
  var statusLabel = document.getElementById('updateStatusLabel');
  var badge = document.getElementById('updateBadge');
  var badgeLarge = document.getElementById('updateBadgeLarge');
  var rail = document.getElementById('updateRail');
  var summary = document.querySelector('.update-summary');
  var toolbarA11y = document.getElementById('updateToolbarA11y');
  var inlineWrap = document.getElementById('updateInlineProgress');
  var inlineFill = document.getElementById('updateInlineProgressFill');
  var inlineText = document.getElementById('updateInlineProgressText');
  var modalCurrent = document.getElementById('updateModalCurrentVersion');
  var modalTarget = document.getElementById('updateModalTargetVersion');
  var modalDesc = document.getElementById('updateModalDescription');
  var checkBtn = document.getElementById('btnCheckUpdateAction');
  var progressTitle = document.getElementById('updateProgressTitle');
  var progressText = document.getElementById('updateProgressText');
  var progressBytes = document.getElementById('updateProgressBytes');
  var progressPercent = document.getElementById('updateProgressPercent');
  var progressFill = document.getElementById('updateProgressFill');
  var releaseBtn = document.getElementById('btnOpenRelease');
  var dlBtn = document.getElementById('btnDownloadUpdate');
  var apBtn = document.getElementById('btnApplyUpdate');
  var secondaryBtn = document.getElementById('updateModalSecondary');

  if (versionLabel) versionLabel.textContent = 'v' + currentVersion;
  if (statusLabel) statusLabel.textContent = toolbarStatusText;
  if (badge) {
    badge.textContent = badgeText;
    badge.className = 'update-badge ' + variant;
  }
  if (badgeLarge) {
    badgeLarge.textContent = badgeText;
    badgeLarge.className = 'update-badge large ' + variant;
  }
  if (summary) summary.dataset.variant = variant;
  if (summary) {
    var toolbarHint = 'Atualizações';
    if (toolbarStatusText) toolbarHint += ': ' + toolbarStatusText;
    if (currentVersion && currentVersion !== '-') toolbarHint += '. Versão atual ' + currentVersion;
    if (payload.latest_version) toolbarHint += '. Release ' + payload.latest_version;
    summary.setAttribute('title', toolbarHint);
    summary.setAttribute('aria-label', toolbarHint);
  }
  if (toolbarA11y) {
    toolbarA11y.textContent = toolbarStatusText
      ? ('Atualizações: ' + toolbarStatusText)
      : 'Atualizações';
  }
  if (rail) rail.dataset.variant = variant;
  if (modalCurrent) modalCurrent.textContent = 'Versão atual: ' + currentVersion;
  if (modalTarget) modalTarget.textContent = 'Release: ' + latestVersion;
  if (modalDesc) {
    modalDesc.textContent = _updateConfirmPending
      ? 'O aplicativo será fechado e reiniciado para aplicar a atualização com backup e validação de integridade.'
      : detailText;
  }
  if (progressTitle) progressTitle.textContent = UPDATE_PHASE_META[phase] ? UPDATE_PHASE_META[phase].title : 'Aguardando ação';
  if (progressText) progressText.textContent = detailText;
  if (progressBytes) progressBytes.textContent = _updateUiState.bytes || 'Percentual exato disponível quando informado pela etapa.';
  if (progressPercent) progressPercent.textContent = progressValue + '%';
  if (progressFill) progressFill.style.width = progressValue + '%';
  if (inlineWrap) inlineWrap.classList.toggle('tb-btn-hidden', !(phase !== 'idle' && phase !== 'success' && phase !== 'error'));
  if (inlineFill) inlineFill.style.width = progressValue + '%';
  if (inlineText) inlineText.textContent = progressValue + '%';
  if (releaseBtn) releaseBtn.classList.toggle('tb-btn-hidden', !_latestReleaseUrl);
  if (checkBtn) checkBtn.disabled = phase === 'checking' || phase === 'installing' || phase === 'restarting';

  var canShowUpdateActions = !!(payload.ok && payload.has_update);
  var canDownload = canShowUpdateActions && !_updateUiState.downloaded;
  var canApply = canShowUpdateActions && _updateUiState.downloaded;
  if (dlBtn) dlBtn.classList.toggle('tb-btn-hidden', !canDownload);
  if (apBtn) apBtn.classList.toggle('tb-btn-hidden', !canApply);
  if (secondaryBtn) secondaryBtn.textContent = _updateConfirmPending ? 'Cancelar' : 'Fechar';

  var nodes = document.querySelectorAll('#updateStepper li');
  nodes.forEach(function (node) {
    var step = node.getAttribute('data-step');
    var idx = UPDATE_PHASES.indexOf(step);
    var currentIdx = UPDATE_PHASES.indexOf(phase);
    node.classList.remove('is-done', 'is-active', 'is-waiting', 'is-error');
    if (phase === 'error' && idx === currentIdx) {
      node.classList.add('is-error');
    } else if (idx > -1 && currentIdx > -1) {
      if (idx < currentIdx) node.classList.add('is-done');
      else if (idx === currentIdx) node.classList.add('is-active');
      else node.classList.add('is-waiting');
    } else {
      node.classList.add('is-waiting');
    }
  });
}

function openUpdateModal(mode) {
  var modal = document.getElementById('updateModal');
  if (!modal) return;
  _updateUiState.modalMode = mode || 'details';
  if (_updateUiState.modalMode !== 'confirm') _updateConfirmPending = false;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  _syncModalOpenState();
  _renderUpdateSurface();
}

function closeUpdateModal() {
  if (_updateConfirmPending) {
    _updateConfirmPending = false;
    _renderUpdateSurface();
  }
  var modal = document.getElementById('updateModal');
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  _syncModalOpenState();
}

function _syncModalOpenState() {
  if (document.querySelector('.app-modal.open')) document.body.classList.add('modal-open');
  else document.body.classList.remove('modal-open');
}

function _syncDirtyUi() {
  var saveBtn = document.getElementById('btnSaveEdits');
  var hint = document.getElementById('unsavedHint');
  if (saveBtn) saveBtn.textContent = hasUnsavedChanges() ? '✓ Salvar alterações *' : '✓ Salvar alterações';
  if (hint) hint.style.display = hasUnsavedChanges() ? 'inline-flex' : 'none';
}

async function _fetchWithTimeout(url, options, timeoutMs) {
  var ctrl = new AbortController();
  var timer = setTimeout(function () { ctrl.abort('timeout'); }, timeoutMs || EXPORT_TIMEOUT_MS);
  try {
    var opts = Object.assign({}, options || {}, { signal: ctrl.signal });
    return await fetch(url, opts);
  } finally {
    clearTimeout(timer);
  }
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
  var initialBoot = !_lastRenderData;
  _isLoadingData = true;
  if (initialBoot) {
    markAppBooting();
  } else {
    _syncAppStateUi();
  }
  try {
    var resp = await fetch('/api/status');
    var json = await resp.json();
    renderAll(json);
    if (!editMode) clearDirty();
  } catch (err) {
    if (initialBoot) {
      markAppInitError('loadData', err);
    } else {
      console.error('[app-refresh:loadData]', err && err.message ? err.message : String(err), err && err.stack ? err.stack : '');
      showToast('Não foi possível atualizar os dados agora.', 'error');
    }
  } finally {
    _isLoadingData = false;
    _syncAppStateUi();
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
  var marks = document.querySelectorAll('.topbar .logo-mark');
  if (logoPath && img) {
    img.src = logoPath;
  }
  marks.forEach(function (mark) {
    mark.style.background   = 'rgba(255,255,255,0.95)';
    mark.style.borderRadius = '10px';
    mark.style.padding      = '6px';
    mark.style.boxSizing    = 'border-box';
    mark.style.boxShadow    = '0 6px 18px rgba(0,0,0,0.12)';
  });
  if (!logoPath) {
    marks.forEach(function (mark) {
      mark.style.background = '';
      mark.style.borderRadius = '';
      mark.style.padding = '';
      mark.style.boxSizing = '';
      mark.style.boxShadow = '';
    });
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
  if (!d.config) {
    throw new Error('Payload inicial sem reportData.config');
  }
  var cfg = d.config;

  document.querySelectorAll('#projectTitle,[data-shared-project-title]').forEach(function (el) {
    el.textContent = v(cfg.project_name, 'Projeto Executivo');
  });
  document.querySelectorAll('#projectSubtitle,[data-shared-project-subtitle]').forEach(function (el) {
    el.textContent = v(cfg.project_subtitle, '');
  });
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

  // Sinaliza estado pronto para UI e testes E2E.
  markAppReady();
}

function setSlide(n) {
  currentSlide = Math.max(1, Math.min(totalSlides, n));
  _writeStoredSlide(currentSlide);
  updateSlideView();
}

function prevSlide() { setSlide(currentSlide - 1); }
function nextSlide() { setSlide(currentSlide + 1); }

function updateSlideView() {
  for (var i = 1; i <= totalSlides; i++) {
    var el = document.getElementById('slide' + i);
    if (!el) continue;
    if (i === currentSlide) el.classList.add('active');
    else el.classList.remove('active');
  }
  var ind = document.getElementById('slideIndicator');
  if (ind) ind.textContent = 'Slide ' + currentSlide + '/' + totalSlides;
  refreshDeckViewportLayout();
}

function syncDeckViewportScale() {
  var root = document.documentElement;
  if (!root) return;
  var baseW = 1920;
  var baseH = 1080;
  var inPresentation = document.body.classList.contains('presentation-mode');
  var availW = window.innerWidth;
  var availH = window.innerHeight;
  if (!inPresentation) {
    var toolbar = document.querySelector('.toolbar');
    var banner = document.querySelector('.validation-banner');
    if (banner && getComputedStyle(banner).display !== 'none') availH -= banner.offsetHeight;
    if (toolbar && getComputedStyle(toolbar).display !== 'none') availH -= toolbar.offsetHeight;
    availW -= 12;
    availH -= 18;
  }
  availW = Math.max(320, availW);
  availH = Math.max(240, availH);
  var scale = Math.min(availW / baseW, availH / baseH);
  if (!isFinite(scale) || scale <= 0) scale = 1;
  root.style.setProperty('--deck-scale', scale.toFixed(5));
  var topOffset = 0;
  if (inPresentation) {
    topOffset = Math.max(0, (window.innerHeight - (baseH * scale)) / 2);
  }
  root.style.setProperty('--deck-top-offset', Math.round(topOffset) + 'px');
}

function refreshDeckViewportLayout() {
  requestAnimationFrame(function () {
    syncDeckViewportScale();
    syncDeckHeights();
    if (_lastRenderData) renderCurvaS(_lastRenderData.data || {});
    if (_lastRenderData) renderGantt((_lastRenderData.reportData || _lastRenderData.data || {}));
  });
}

function syncDeckHeights() {
  for (var i = 1; i <= totalSlides; i++) {
    var el = document.getElementById('slide' + i);
    if (el) el.style.height = '1080px';
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

function _statusToneKey(status) {
  var s = String(status || '').toLowerCase();
  if (s.indexOf('conclu') >= 0) return 'done';
  if (s.indexOf('andamento') >= 0) return 'live';
  if (s.indexOf('atrasado') >= 0) return 'risk';
  return 'planned';
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
  var configuredDayW = Math.max(14, Math.min(36, parseInt(ganttCfg.largura_dia, 10) || 18));
  var configuredRowH = Math.max(38, Math.min(64, parseInt(ganttCfg.altura_linha, 10) || 40));
  var W = canvas ? Math.max(860, canvas.clientWidth - 2) : 1200;
  var H = 520;
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
  var showProgress = String(ganttCfg.exibir_progresso || 'TRUE').toLowerCase() !== 'false';

  if (cards) {
    var activeCandidates = taskList.filter(function (e) {
      return e.start <= today && e.end >= today;
    }).sort(function (a, b) {
      var aOpen = (a.status.indexOf('atras') >= 0 || a.status.indexOf('andamento') >= 0) ? 0 : 1;
      var bOpen = (b.status.indexOf('atras') >= 0 || b.status.indexOf('andamento') >= 0) ? 0 : 1;
      if (aOpen !== bOpen) return aOpen - bOpen;
      if ((Number(b.progress) || 0) !== (Number(a.progress) || 0)) return (Number(b.progress) || 0) - (Number(a.progress) || 0);
      return a.start - b.start;
    });
    var nextTask = taskList.slice().sort(function (a, b) { return a.start - b.start; }).find(function (e) {
      return e.start > today;
    }) || null;
    var activeTask = activeCandidates[0]
      || taskList.find(function (e) { return e.status.indexOf('andamento') >= 0; })
      || nextTask
      || taskList.slice().sort(function (a, b) { return b.end - a.end; })[0]
      || null;
    var avgProgress = taskList.length
      ? Math.round(taskList.reduce(function (sum, e) { return sum + (Number(e.progress) || 0); }, 0) / taskList.length)
      : 0;
    var nextMilestone = msList.slice().sort(function (a, b) { return a.start - b.start; }).find(function (m) { return m.start >= today; }) || msList[0] || null;
    var windowLabel = formatShortDate(minDate) + ' → ' + formatShortDate(maxDate);
    var derived = d.derived || {};
    var realPercent = Number(derived.real_percent);
    if (!isFinite(realPercent)) realPercent = avgProgress;
    var plannedPercent = Number(derived.planned_percent);
    if (!isFinite(plannedPercent)) plannedPercent = Number((d.config || {}).progress_percent) || 0;
    var spi = Number(derived.spi);
    if (!isFinite(spi) && plannedPercent > 0) spi = realPercent / plannedPercent;
    if (!isFinite(spi)) spi = 0;
    var realTone = realPercent >= 90 ? 'done' : (spi > 0 && spi < 0.95 ? 'risk' : (realPercent > 0 ? 'live' : 'planned'));
    var activeEyebrow = 'Próxima frente';
    if (activeTask) {
      if (activeTask.start <= today && activeTask.end >= today) activeEyebrow = 'Frente vigente';
      else if (activeTask.start > today) activeEyebrow = 'Próxima frente';
      else activeEyebrow = 'Última frente';
    }
    var activeMeta = 'Aguardando definição';
    if (activeTask) {
      if (activeTask.start <= today && activeTask.end >= today) activeMeta = (activeTask.progress || 0) + '% concluído';
      else if (activeTask.start > today) activeMeta = 'Início em ' + formatDateBR(activeTask.start);
      else activeMeta = 'Encerrada em ' + formatDateBR(activeTask.end);
    }
    var summaryCards = [
      {
        label: 'Frente ativa',
        value: activeTask ? activeTask.name : 'Sem tarefa ativa',
        meta: activeMeta,
        tone: activeTask ? _statusToneKey(activeTask.status) : 'planned',
        accent: activeTask ? (activeTask.owner || 'Execução principal') : 'Sem owner definido',
        eyebrow: activeTask ? (activeEyebrow + ' · ' + (activeTask.status || 'Planejado')) : 'Próxima frente'
      },
      {
        label: 'Janela do cronograma',
        value: windowLabel,
        meta: totalWorkdays + ' dias úteis mapeados',
        tone: 'calendar',
        accent: 'Cadência semanal',
        eyebrow: 'Faixa operacional'
      },
      {
        label: 'Real acumulado',
        value: realPercent + '%',
        meta: 'Plano ' + plannedPercent + '% · SPI ' + spi.toFixed(2),
        tone: realTone,
        accent: showProgress ? 'Curva S consolidada' : 'Leitura executiva',
        eyebrow: realTone === 'done' ? 'Fechamento' : (realTone === 'risk' ? 'Abaixo do plano' : (realTone === 'live' ? 'Ritmo de execução' : 'Ramp-up'))
      },
      {
        label: 'Próximo marco',
        value: nextMilestone ? nextMilestone.name : 'Sem marco',
        meta: nextMilestone ? formatDateBR(nextMilestone.start) : 'Sem data cadastrada',
        tone: nextMilestone ? 'milestone' : 'planned',
        accent: nextMilestone ? 'Ponto de decisão' : 'Marco pendente',
        eyebrow: nextMilestone ? 'Checkpoint executivo' : 'Sem checkpoint'
      }
    ];
    cards.innerHTML = summaryCards.map(function (card) {
      return '<article class="gantt-summary-card tone-' + esc(card.tone) + '">' +
        '<div class="gantt-summary-topline">' +
          '<span class="gantt-summary-kicker">' + esc(card.eyebrow || card.label) + '</span>' +
          '<span class="gantt-summary-accent">' + esc(card.accent || '') + '</span>' +
        '</div>' +
        '<p class="gantt-summary-label">' + esc(card.label) + '</p>' +
        '<h3>' + esc(card.value) + '</h3>' +
        '<p class="gantt-summary-meta">' + esc(card.meta) + '</p>' +
        '<span class="gantt-summary-orb" aria-hidden="true"></span>' +
      '</article>';
    }).join('');
  }

  // Coluna esquerda com nomes das fases
  var leftColW = 210;
  var origPadL = padL;
  padL  = origPadL + leftColW + 4;
  chartW = Math.max(W - padL - padR, totalWorkdays * configuredDayW);
  W = padL + chartW + padR;

  // Layout executivo clean
  var msAnnotH  = 0;
  var monthRowH = 32;
  var weekRowH  = 26;
  var headerH   = monthRowH + weekRowH;
  var rowH      = configuredRowH;
  var barH      = Math.max(24, rowH - 16);
  var barPadY   = Math.floor((rowH - barH) / 2);
  var chartTop  = headerH;

  var bottomZone = 70; // espaço para diamante + pill do marco abaixo das linhas
  H = Math.max(360, headerH + taskList.length * rowH + bottomZone);
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
    var weekTopY = msAnnotH + monthRowH + 8;
    var weekBottomY = msAnnotH + monthRowH + 18;
    html += '<text x="' + wxc.toFixed(1) + '" y="' + weekTopY + '" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="6.8" font-weight="800" fill="#8b99b1">S' + (i + 1) + '</text>';
    html += '<text x="' + wxc.toFixed(1) + '" y="' + weekBottomY + '" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="6.6" font-weight="700" fill="#9aa7bc">' + esc(formatDateBR(weekStarts[i])) + '</text>';
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
    html += '<line data-gantt-edit="today" x1="' + tx.toFixed(1) + '" y1="' + headerH + '" x2="' + tx.toFixed(1) + '" y2="' + (tagY - 2) + '" stroke="#dd6b20" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.55"/>';
    html += '<rect data-gantt-edit="today" x="' + (tx - phW / 2).toFixed(1) + '" y="' + tagY + '" width="' + phW + '" height="' + phH + '" rx="3" fill="#dd6b20"/>';
    html += '<text data-gantt-edit="today" x="' + tx.toFixed(1) + '" y="' + (tagY + phH / 2) + '" text-anchor="middle" dominant-baseline="middle" font-family="Inter,system-ui,sans-serif" font-size="7.5" font-weight="800" fill="white" letter-spacing="0.07em">HOJE</text>';
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
    html += '<line data-gantt-edit="milestone-date" data-gantt-ms-idx="' + e.idx + '" x1="' + mx.toFixed(1) + '" y1="' + headerH + '" x2="' + mx.toFixed(1) + '" y2="' + (dmY - 9) + '" stroke="#dd6b20" stroke-width="1" stroke-dasharray="4 3" opacity="0.4"/>';

    // Diamante
    html += '<rect data-gantt-edit="milestone-date" data-gantt-ms-idx="' + e.idx + '" x="' + (mx - 6) + '" y="' + (dmY - 6) + '" width="12" height="12" rx="1" transform="rotate(45 ' + mx.toFixed(1) + ' ' + dmY + ')" fill="#dd6b20" stroke="white" stroke-width="1.5" filter="url(#gg)"/>';

    // Pill abaixo do diamante
    html += '<rect data-gantt-edit="milestone-name" data-gantt-ms-idx="' + e.idx + '" x="' + lblX.toFixed(1) + '" y="' + pillY + '" width="' + lblW.toFixed(1) + '" height="' + pillH + '" rx="4" fill="#1e3a6e"/>';
    html += '<text data-gantt-edit="milestone-name" data-gantt-ms-idx="' + e.idx + '" x="' + (lblX + 9) + '" y="' + (pillY + pillH / 2) + '" dominant-baseline="middle" font-family="Arial" font-size="9" fill="#dd6b20">★</text>';
    html += '<text data-gantt-edit="milestone-name" data-gantt-ms-idx="' + e.idx + '" x="' + (lblX + 19) + '" y="' + (pillY + pillH / 2) + '" dominant-baseline="middle" font-family="Inter,system-ui,sans-serif" font-size="9" font-weight="700" fill="white">' + esc(e.name) + '</text>';
    html += '<text data-gantt-edit="milestone-date" data-gantt-ms-idx="' + e.idx + '" x="' + (lblX + 19 + e.name.length * 5.6 + 4) + '" y="' + (pillY + pillH / 2) + '" dominant-baseline="middle" font-family="Inter,system-ui,sans-serif" font-size="9" font-weight="400" fill="rgba(255,255,255,0.65)">' + esc(dateStr) + '</text>';
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
      html += '<rect data-gantt-edit="task-progress" data-gantt-task-idx="' + e.idx + '" x="' + x1.toFixed(1) + '" y="' + barY.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + barH + '" rx="' + rr + '" fill="#f1f5f9" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="5 3"/>';
      if (barW > 76) {
        html += '<text x="' + (x1 + barW / 2).toFixed(1) + '" y="' + midBarY + '" text-anchor="middle" dominant-baseline="middle" font-family="Inter,system-ui,sans-serif" font-size="9.5" font-weight="500" fill="#94a3b8">' + esc(dLbl) + '</text>';
      } else {
        var extX = x1 + barW + 5;
        if (extX + 80 < W - padR) {
          html += '<text x="' + extX.toFixed(1) + '" y="' + midBarY + '" dominant-baseline="middle" font-family="Inter,system-ui,sans-serif" font-size="9.5" font-weight="500" fill="#94a3b8">' + esc(dLbl) + '</text>';
        }
      }
    } else {
      html += '<rect data-gantt-edit="task-progress" data-gantt-task-idx="' + e.idx + '" x="' + (x1 + 1).toFixed(1) + '" y="' + (barY + 2).toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + barH + '" rx="' + rr + '" fill="' + color + '" opacity="0.12"/>';
      html += '<rect data-gantt-edit="task-progress" data-gantt-task-idx="' + e.idx + '" x="' + x1.toFixed(1) + '" y="' + barY.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + barH + '" rx="' + rr + '" fill="' + color + '"/>';
      var progW = barW * Math.min(Math.max(e.progress / 100, 0), 1);
      if (showProgress && progW > 4) {
        html += '<rect x="' + x1.toFixed(1) + '" y="' + barY.toFixed(1) + '" width="' + progW.toFixed(1) + '" height="' + barH + '" rx="' + rr + '" fill="rgba(0,0,0,0.18)"/>';
      }
      html += '<line x1="' + (x1 + rr).toFixed(1) + '" y1="' + (barY + 3).toFixed(1) + '" x2="' + (x1 + barW - rr).toFixed(1) + '" y2="' + (barY + 3).toFixed(1) + '" stroke="rgba(255,255,255,0.28)" stroke-width="1.5"/>';
      var pctNum = Math.round(Math.min(Math.max(e.progress, 0), 100));
      var pctTxt = pctNum + '%';
      if (barW > 76) {
        html += '<text x="' + (x1 + barW / 2).toFixed(1) + '" y="' + (midBarY - 3).toFixed(1) + '" text-anchor="middle" dominant-baseline="middle" font-family="Inter,system-ui,sans-serif" font-size="9.5" font-weight="600" fill="rgba(255,255,255,0.92)">' + esc(dLbl) + '</text>';
        if (showProgress) html += '<text data-gantt-edit="task-progress" data-gantt-task-idx="' + e.idx + '" x="' + (x1 + barW / 2).toFixed(1) + '" y="' + (midBarY + 8).toFixed(1) + '" text-anchor="middle" dominant-baseline="middle" font-family="Inter,system-ui,sans-serif" font-size="9" font-weight="800" fill="rgba(255,255,255,0.7)">' + pctTxt + '</text>';
      } else if (barW > 32) {
        if (showProgress) html += '<text data-gantt-edit="task-progress" data-gantt-task-idx="' + e.idx + '" x="' + (x1 + barW / 2).toFixed(1) + '" y="' + midBarY.toFixed(1) + '" text-anchor="middle" dominant-baseline="middle" font-family="Inter,system-ui,sans-serif" font-size="9" font-weight="800" fill="rgba(255,255,255,0.85)">' + pctTxt + '</text>';
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
    var maxNameW = leftColW - 30;
    var nameStr = e.name.length > 24 ? e.name.slice(0, 23) + '…' : e.name;
    html += '<circle data-gantt-edit="task-status" data-gantt-task-idx="' + e.idx + '" cx="' + (origPadL + 9) + '" cy="' + nameY.toFixed(1) + '" r="4.5" fill="' + color + '" opacity="' + (isPlanned ? '0.38' : '1') + '"/>';
    html += '<text data-gantt-edit="task-name" data-gantt-task-idx="' + e.idx + '" x="' + (origPadL + 20) + '" y="' + nameY.toFixed(1) + '" dominant-baseline="middle" font-family="Inter,system-ui,sans-serif" font-size="11" font-weight="700" fill="' + (isPlanned ? '#94a3b8' : '#1e293b') + '">' + esc(nameStr) + '</text>';
    html += '<text data-gantt-edit="task-status" data-gantt-task-idx="' + e.idx + '" x="' + (origPadL + 20) + '" y="' + statusY.toFixed(1) + '" dominant-baseline="middle" font-family="Inter,system-ui,sans-serif" font-size="9" font-weight="500" fill="' + color + '" opacity="' + (isPlanned ? '0.5' : '0.75') + '">' + esc(statusLabel) + '</text>';
  });

  svg.innerHTML = html;

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

function _ganttTitleDefault() {
  return 'Cronograma & Marcos Críticos';
}

function _ganttSubtitleDefault(d) {
  var cfg = (d && d.config) || {};
  return 'Fase atual: ' + v(cfg.current_phase, '-') + ' | Dia ' + v(cfg.current_day, '-') + ' de ' + v(cfg.total_days, '-');
}

function _closeFloatingEditors() {
  document.querySelectorAll('.gantt-floating-input').forEach(function (el) { el.remove(); });
}

function _openFloatingInput(anchor, opts) {
  _closeFloatingEditors();
  if (!anchor || !opts || typeof opts.onSave !== 'function') return;
  var rect = anchor.getBoundingClientRect();
  var input = document.createElement(opts.multiline ? 'textarea' : 'input');
  input.className = 'gantt-floating-input';
  if (!opts.multiline) input.type = opts.type || 'text';
  if (opts.placeholder) input.placeholder = opts.placeholder;
  input.value = opts.value != null ? String(opts.value) : '';
  input.style.top = Math.max(12, rect.bottom + 6) + 'px';
  input.style.left = Math.max(12, Math.min(window.innerWidth - 240, rect.left)) + 'px';
  input.style.width = (opts.width || Math.max(180, Math.min(320, rect.width + 80))) + 'px';
  document.body.appendChild(input);

  var done = false;
  function finish(save) {
    if (done) return;
    done = true;
    if (save) opts.onSave(input.value);
    input.remove();
  }

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      finish(false);
    }
    if (e.key === 'Enter' && !opts.multiline) {
      e.preventDefault();
      finish(true);
    }
  });
  input.addEventListener('blur', function () {
    setTimeout(function () { finish(true); }, 80);
  });
  input.focus();
  if (typeof input.select === 'function') input.select();
}

function _openFloatingSelect(anchor, opts) {
  _closeFloatingEditors();
  if (!anchor || !opts || !Array.isArray(opts.options) || typeof opts.onSave !== 'function') return;
  var rect = anchor.getBoundingClientRect();
  var select = document.createElement('select');
  select.className = 'gantt-floating-input';
  select.style.top = Math.max(12, rect.bottom + 6) + 'px';
  select.style.left = Math.max(12, Math.min(window.innerWidth - 220, rect.left)) + 'px';
  select.style.width = (opts.width || Math.max(160, rect.width + 90)) + 'px';
  opts.options.forEach(function (opt) {
    var option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    if (String(opt.value) === String(opts.value)) option.selected = true;
    select.appendChild(option);
  });
  document.body.appendChild(select);

  var done = false;
  function finish(save) {
    if (done) return;
    done = true;
    if (save) opts.onSave(select.value);
    select.remove();
  }

  select.addEventListener('change', function () { finish(true); });
  select.addEventListener('blur', function () {
    setTimeout(function () { finish(false); }, 80);
  });
  select.focus();
}

function _syncGanttLivePreview(opts) {
  if (!_editSnapshotData) return;
  var d = _editSnapshotData;
  if (!d.config) d.config = {};
  if (!d.gantt_config) d.gantt_config = {};
  var titleEl = document.getElementById('ganttTitle');
  var subtitleEl = document.getElementById('ganttSubtitle');
  if (titleEl && titleEl !== document.activeElement) titleEl.textContent = v(d.gantt_config.titulo, _ganttTitleDefault());
  if (subtitleEl && subtitleEl !== document.activeElement) subtitleEl.textContent = v(d.gantt_config.subtitulo, _ganttSubtitleDefault(d));
  renderGantt(d);
  _bindGanttSvgTargets();
  if (opts && opts.rebuildInlineEditor) _renderGanttInlineEditor();
}

function _makeGanttInlineField(label, control, wide) {
  var wrap = document.createElement('div');
  wrap.className = 'gantt-inline-field' + (wide ? ' wide' : '');
  var lbl = document.createElement('label');
  lbl.textContent = label;
  wrap.appendChild(lbl);
  wrap.appendChild(control);
  return wrap;
}

function _renderGanttInlineEditor() {
  var host = document.getElementById('ganttInlineEditor');
  if (!host) return;
  host.hidden = true;
  host.innerHTML = '';
}

function _moveArrayItem(list, idx, direction) {
  if (!Array.isArray(list)) return false;
  var target = idx + direction;
  if (idx < 0 || idx >= list.length || target < 0 || target >= list.length) return false;
  var tmp = list[idx];
  list[idx] = list[target];
  list[target] = tmp;
  return true;
}

function _isGanttManageModalOpen() {
  var modal = document.getElementById('ganttManageModal');
  return !!(modal && modal.classList.contains('open'));
}

function _refreshGanttEditorSurfaces() {
  _syncGanttLivePreview({ rebuildInlineEditor: true });
  if (_isGanttManageModalOpen()) _renderGanttManageModalBody();
}

function _isGanttSlideActive() {
  return currentSlide === 4;
}

function openGanttManageModal() {
  if (!_editSnapshotData) return;
  var modal = document.getElementById('ganttManageModal');
  if (!modal) return;
  _renderGanttManageModalBody();
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  _syncModalOpenState();
}

function closeGanttManageModal() {
  var modal = document.getElementById('ganttManageModal');
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  _syncModalOpenState();
}

function _renderGanttManageModalBody() {
  var body = document.getElementById('ganttManageModalBody');
  if (!body || !_editSnapshotData) return;
  var d = _editSnapshotData;
  if (!d.gantt_tarefas) d.gantt_tarefas = [];
  if (!d.gantt_marcos) d.gantt_marcos = [];
  body.innerHTML = '';

  function section(title, subtitle) {
    var wrap = document.createElement('section');
    wrap.className = 'gantt-manage-section';
    wrap.innerHTML = '<div class="gantt-manage-section-head"><div><h4>' + esc(title) + '</h4><p>' + esc(subtitle || '') + '</p></div></div>';
    return wrap;
  }

  function mkTable(headers) {
    var wrap = document.createElement('div');
    wrap.className = 'gantt-inline-table gantt-manage-table';
    var table = document.createElement('table');
    table.innerHTML = '<thead><tr>' + headers.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead>';
    var tbody = document.createElement('tbody');
    table.appendChild(tbody);
    wrap.appendChild(table);
    return { wrap: wrap, tbody: tbody };
  }

  function textField(value, cb, type, placeholder) {
    var input = document.createElement('input');
    input.type = type || 'text';
    if (placeholder) input.placeholder = placeholder;
    input.value = value != null ? String(value) : '';
    input.addEventListener('input', function () {
      cb(input.type === 'number' && input.value !== '' ? Number(input.value) : input.value);
      markDirty();
      _syncGanttLivePreview();
    });
    return input;
  }

  function selectField(value, options, cb) {
    var select = document.createElement('select');
    options.forEach(function (opt) {
      var option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      if (String(opt.value) === String(value)) option.selected = true;
      select.appendChild(option);
    });
    select.addEventListener('change', function () {
      cb(select.value);
      markDirty();
      _syncGanttLivePreview();
    });
    return select;
  }

  function actionBtn(label, cls, handler, disabled) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gantt-inline-btn gantt-inline-btn-sm' + (cls ? ' ' + cls : '');
    btn.textContent = label;
    if (disabled) btn.disabled = true;
    btn.addEventListener('click', handler);
    return btn;
  }

  var taskSection = section('Tarefas', 'Reordene com subir e descer. O preview do Gantt atualiza em tempo real.');
  var taskTable = mkTable(['', 'Nome', 'Início', 'Fim', 'Progresso', 'Status', 'Owner', '']);
  d.gantt_tarefas.forEach(function (task, idx) {
    var tr = document.createElement('tr');
    function td(el) { var cell = document.createElement('td'); cell.appendChild(el); return cell; }
    var orderCell = document.createElement('div');
    orderCell.className = 'gantt-order-actions';
    orderCell.appendChild(actionBtn('↑', '', function () {
      if (_moveArrayItem(d.gantt_tarefas, idx, -1)) { markDirty(); _refreshGanttEditorSurfaces(); }
    }, idx === 0));
    orderCell.appendChild(actionBtn('↓', '', function () {
      if (_moveArrayItem(d.gantt_tarefas, idx, 1)) { markDirty(); _refreshGanttEditorSurfaces(); }
    }, idx === d.gantt_tarefas.length - 1));
    tr.appendChild(td(orderCell));
    tr.appendChild(td(textField(task.nome, function (val) { d.gantt_tarefas[idx].nome = val; })));
    tr.appendChild(td(textField(task.inicio, function (val) { d.gantt_tarefas[idx].inicio = val; }, 'text', 'dd/mm/aaaa')));
    tr.appendChild(td(textField(task.fim, function (val) { d.gantt_tarefas[idx].fim = val; }, 'text', 'dd/mm/aaaa')));
    tr.appendChild(td(textField(task.progresso, function (val) { d.gantt_tarefas[idx].progresso = val === '' ? 0 : val; }, 'number')));
    tr.appendChild(td(selectField(task.status || 'Planejado', [
      { value: 'Concluído', label: 'Concluído' },
      { value: 'Em andamento', label: 'Em andamento' },
      { value: 'Planejado', label: 'Planejado' },
      { value: 'Atrasado', label: 'Atrasado' }
    ], function (val) { d.gantt_tarefas[idx].status = val; })));
    tr.appendChild(td(textField(task.owner, function (val) { d.gantt_tarefas[idx].owner = val; })));
    tr.appendChild(td(actionBtn('Remover', 'danger', function () {
      d.gantt_tarefas.splice(idx, 1);
      markDirty();
      _refreshGanttEditorSurfaces();
    })));
    taskTable.tbody.appendChild(tr);
  });
  taskSection.appendChild(taskTable.wrap);
  var taskActions = document.createElement('div');
  taskActions.className = 'gantt-inline-actions';
  taskActions.appendChild(actionBtn('+ Adicionar tarefa', 'gantt-inline-btn-primary', function () {
    d.gantt_tarefas.push({ id: Date.now(), parent_id: null, nome: 'Nova tarefa', inicio: '', fim: '', progresso: 0, status: 'Planejado', owner: '', dependencias: '' });
    markDirty();
    _refreshGanttEditorSurfaces();
  }));
  taskSection.appendChild(taskActions);
  body.appendChild(taskSection);

  var milestoneSection = section('Marcos', 'Ajuste nome, data e ordem dos marcos críticos sem perder o contexto do slide.');
  var milestoneTable = mkTable(['', 'Nome', 'Data', 'Status', 'Tipo', '']);
  d.gantt_marcos.forEach(function (milestone, idx) {
    var tr = document.createElement('tr');
    function td(el) { var cell = document.createElement('td'); cell.appendChild(el); return cell; }
    var orderCell = document.createElement('div');
    orderCell.className = 'gantt-order-actions';
    orderCell.appendChild(actionBtn('↑', '', function () {
      if (_moveArrayItem(d.gantt_marcos, idx, -1)) { markDirty(); _refreshGanttEditorSurfaces(); }
    }, idx === 0));
    orderCell.appendChild(actionBtn('↓', '', function () {
      if (_moveArrayItem(d.gantt_marcos, idx, 1)) { markDirty(); _refreshGanttEditorSurfaces(); }
    }, idx === d.gantt_marcos.length - 1));
    tr.appendChild(td(orderCell));
    tr.appendChild(td(textField(milestone.nome, function (val) { d.gantt_marcos[idx].nome = val; })));
    tr.appendChild(td(textField(milestone.data, function (val) { d.gantt_marcos[idx].data = val; }, 'text', 'dd/mm/aaaa')));
    tr.appendChild(td(textField(milestone.status, function (val) { d.gantt_marcos[idx].status = val; })));
    tr.appendChild(td(textField(milestone.tipo, function (val) { d.gantt_marcos[idx].tipo = val; })));
    tr.appendChild(td(actionBtn('Remover', 'danger', function () {
      d.gantt_marcos.splice(idx, 1);
      markDirty();
      _refreshGanttEditorSurfaces();
    })));
    milestoneTable.tbody.appendChild(tr);
  });
  milestoneSection.appendChild(milestoneTable.wrap);
  var milestoneActions = document.createElement('div');
  milestoneActions.className = 'gantt-inline-actions';
  milestoneActions.appendChild(actionBtn('+ Adicionar marco', 'gantt-inline-btn-primary', function () {
    d.gantt_marcos.push({ id: Date.now(), nome: 'Novo marco', data: '', status: 'Planejado', tipo: 'star' });
    markDirty();
    _refreshGanttEditorSurfaces();
  }));
  milestoneSection.appendChild(milestoneActions);
  body.appendChild(milestoneSection);
}

function _bindGanttSvgTargets() {
  if (!editMode || !_editSnapshotData) return;
  var d = _editSnapshotData;
  var svg = document.getElementById('ganttSvg');
  if (!svg) return;

  svg.querySelectorAll('[data-gantt-edit]').forEach(function (el) {
    if (el.dataset.ganttBound) return;
    el.dataset.ganttBound = '1';
    el.addEventListener('click', function (evt) {
      evt.preventDefault();
      evt.stopPropagation();
      var kind = el.dataset.ganttEdit;
      if (kind === 'today') {
        d.gantt_config.exibir_hoje = String(v(d.gantt_config.exibir_hoje, 'TRUE')).toLowerCase() === 'false' ? 'TRUE' : 'FALSE';
        markDirty();
        _syncGanttLivePreview({ rebuildInlineEditor: true });
        return;
      }

      var msIdx = parseInt(el.dataset.ganttMsIdx || '-1', 10);
      if (msIdx >= 0 && d.gantt_marcos && d.gantt_marcos[msIdx]) {
        if (kind === 'milestone-name') {
          _openFloatingInput(el, {
            value: d.gantt_marcos[msIdx].nome || '',
            onSave: function (val) {
              d.gantt_marcos[msIdx].nome = String(val || '').trim();
              markDirty();
              _syncGanttLivePreview({ rebuildInlineEditor: true });
            }
          });
          return;
        }
        if (kind === 'milestone-date') {
          _openDatePicker(el, d.gantt_marcos[msIdx].data || '', function (newRaw) {
            d.gantt_marcos[msIdx].data = newRaw;
            markDirty();
            _syncGanttLivePreview({ rebuildInlineEditor: true });
          });
          return;
        }
      }

      var taskIdx = parseInt(el.dataset.ganttTaskIdx || '-1', 10);
      if (taskIdx >= 0 && d.gantt_tarefas && d.gantt_tarefas[taskIdx]) {
        if (kind === 'task-name') {
          _openFloatingInput(el, {
            value: d.gantt_tarefas[taskIdx].nome || '',
            onSave: function (val) {
              d.gantt_tarefas[taskIdx].nome = String(val || '').trim();
              markDirty();
              _syncGanttLivePreview({ rebuildInlineEditor: true });
            }
          });
          return;
        }
        if (kind === 'task-status') {
          _openFloatingSelect(el, {
            value: d.gantt_tarefas[taskIdx].status || 'Planejado',
            options: [
              { value: 'Concluído', label: 'Concluido' },
              { value: 'Em andamento', label: 'Em andamento' },
              { value: 'Planejado', label: 'Planejado' },
              { value: 'Atrasado', label: 'Atrasado' }
            ],
            onSave: function (val) {
              d.gantt_tarefas[taskIdx].status = val;
              markDirty();
              _syncGanttLivePreview({ rebuildInlineEditor: true });
            }
          });
          return;
        }
        if (kind === 'task-progress') {
          _openFloatingInput(el, {
            type: 'number',
            value: d.gantt_tarefas[taskIdx].progresso || 0,
            onSave: function (val) {
              var num = Number(val);
              d.gantt_tarefas[taskIdx].progresso = isFinite(num) ? Math.max(0, Math.min(100, num)) : 0;
              markDirty();
              _syncGanttLivePreview({ rebuildInlineEditor: true });
            }
          });
        }
      }
    });
  });
}

function _priorityNum(priority) {
  var m = String(priority || '').toUpperCase().match(/P(\d+)/);
  return m ? parseInt(m[1], 10) : 99;
}

function _priorityLabel(priority) {
  var n = _priorityNum(priority);
  if (n === 1) return 'P1 Crítico';
  if (n === 2) return 'P2 Alto';
  if (n === 3) return 'P3 Médio';
  if (n === 4) return 'P4 Baixo';
  return String(priority || 'Sem prior.');
}

function _riskTypeForBoard(item) {
  if (item.tipo) return String(item.tipo).trim(); // override explícito do usuário
  var status = String(item.status || '').toLowerCase();
  var prio = _priorityNum(item.prioridade);
  if (status.indexOf('control') >= 0 || status.indexOf('conclu') >= 0) return 'Action';
  if (prio <= 2 || Number(item.score || 0) >= 8) return 'Issue';
  return 'Risk';
}

function _riskToneForBoard(item) {
  var type = _riskTypeForBoard(item);
  if (type === 'Issue') return 'critical';
  if (type === 'Action') return 'steady';
  return 'watch';
}

function _riskStatusTone(status) {
  var s = String(status || '').toLowerCase();
  if (s.indexOf('aberto') >= 0) return 'critical';
  if (s.indexOf('ação') >= 0 || s.indexOf('acao') >= 0 || s.indexOf('mitiga') >= 0 || s.indexOf('aten') >= 0) return 'attention';
  if (s.indexOf('monitor') >= 0) return 'watch';
  if (s.indexOf('control') >= 0 || s.indexOf('conclu') >= 0) return 'steady';
  return 'neutral';
}

function _humanLevel(val) {
  var s = String(val || '').trim();
  if (!s) return '';
  var low = s.toLowerCase();
  if (low === 'high') return 'Alto';
  if (low === 'medium') return 'Médio';
  if (low === 'low') return 'Baixo';
  return s;
}

function _isRiskOpen(item) {
  var s = String(item.status || '').toLowerCase();
  return s.indexOf('control') === -1 && s.indexOf('conclu') === -1 && s.indexOf('cancel') === -1;
}

function _truncateForBoard(text, max) {
  var raw = String(text || '').trim();
  if (!raw) return '-';
  return raw.length > max ? raw.slice(0, max - 1) + '…' : raw;
}

function _nextPhaseLabel(fases, currentPhase) {
  var current = String(currentPhase || '').trim().toLowerCase();
  var list = Array.isArray(fases) ? fases : [];
  var idx = -1;
  list.forEach(function (f, i) {
    if (idx >= 0) return;
    var nome = String((f && f.nome) || '').trim().toLowerCase();
    var status = String((f && f.status) || '').trim().toLowerCase();
    if ((current && nome === current) || status.indexOf('andamento') >= 0 || status.indexOf('em andamento') >= 0) idx = i;
  });
  if (idx >= 0 && list[idx + 1] && list[idx].nome && list[idx + 1].nome) {
    return String(list[idx].nome) + ' → ' + String(list[idx + 1].nome);
  }
  if (idx >= 0 && list[idx] && list[idx].nome) return String(list[idx].nome);
  return String(currentPhase || '-');
}

function _riskImpactSummary(item) {
  if (item.impacto_display) return String(item.impacto_display).trim();
  var impact = _humanLevel(item.impacto);
  var prob = _humanLevel(item.probabilidade);
  if (prob && impact) return prob + ' prob. • ' + impact + ' impacto';
  if (impact) return 'Impacto ' + impact;
  if (Number(item.score || 0) > 0) return 'Score ' + item.score;
  return 'Avaliar impacto';
}

function _riskMitigationSummary(item) {
  var raw = String(item.comentarios || item.estrategia || '').trim();
  if (!raw) return 'Definir plano de mitigação e owner final';
  return _truncateForBoard(raw, 72);
}

function _riskMetaSummary(item) {
  var parts = [];
  if (item.responsaveis) parts.push(item.responsaveis);
  if (item.id_origem) parts.push(item.id_origem);
  if (item.categoria) parts.push(item.categoria);
  return parts.length ? parts.join(' • ') : 'Sem contexto adicional';
}

function _buildRiskBoardModel(d) {
  var cfg = d.config || {};
  var fases = Array.isArray(d.fases) ? d.fases : [];
  var pendencias = (d.pendencias_criticas || []).slice();
  var acoes = (d.proximas_acoes || []).slice();
  var openItems = pendencias.filter(_isRiskOpen);
  var sorted = pendencias.slice().sort(function (a, b) {
    var p = _priorityNum(a.prioridade) - _priorityNum(b.prioridade);
    if (p !== 0) return p;
    return Number(b.score || 0) - Number(a.score || 0);
  });
  var topRisk = sorted[0] || null;
  var p1Count = openItems.filter(function (item) { return _priorityNum(item.prioridade) === 1; }).length;
  var openCount = openItems.length;
  var summaryExecutive = p1Count > 0
    ? p1Count + ' issue' + (p1Count > 1 ? 's críticos' : ' crítico')
    : (openCount > 0 ? openCount + (openCount === 1 ? ' item' : ' itens') + ' em atenção' : 'Nenhum item crítico');
  var summaryTopRisk = topRisk ? _truncateForBoard(topRisk.item, 42) : 'Sem riscos críticos';
  var summaryImpact = _nextPhaseLabel(fases, cfg.current_phase);
  var summaryDecision = acoes[0] && acoes[0].texto ? _truncateForBoard(acoes[0].texto, 40) : 'Definir decisão executiva';

  // Em edit mode: ordem original (sem sort, sem limite) → novo item sempre no final
  // Em view mode: top 5 ordenados por prioridade (comportamento padrão)
  var displayItems = editMode ? pendencias : sorted.slice(0, 5);
  var boardRows = displayItems.map(function (item) {
    return {
      origIdx: pendencias.indexOf(item),
      type: _riskTypeForBoard(item),
      tone: _riskToneForBoard(item),
      priority: String(item.prioridade || 'P?').toUpperCase(),
      priorityLabel: _priorityLabel(item.prioridade),
      theme: _truncateForBoard(item.item, 44),
      meta: _truncateForBoard(_riskMetaSummary(item), 56),
      impact: _riskImpactSummary(item),
      impactMeta: item.score ? 'Score ' + item.score : (item.estrategia ? _humanLevel(item.estrategia) : 'Sem score'),
      mitigation: _riskMitigationSummary(item),
      owner: _truncateForBoard(item.responsaveis || 'A definir', 18),
      due: item.data_limite ? fmtDateShort(item.data_limite) : '-',
      rawDue: item.data_limite || '',
      status: _truncateForBoard(item.status || 'Aberto', 18),
      statusTone: _riskStatusTone(item.status)
    };
  });

  var decisions = acoes.slice(0, 3).map(function (acao, idx) {
    var linked = sorted[idx] || null;
    return {
      title: _truncateForBoard(acao.texto || 'Definir encaminhamento', 56),
      body: linked ? _truncateForBoard((_riskMitigationSummary(linked) || '') + ' • ' + (linked.responsaveis || 'Owner a definir'), 112) : 'Formalizar owner, prazo e desbloqueio para a frente seguinte.'
    };
  });
  // Sem fallback automático — mostrar apenas proximas_acoes reais (até 3)
  // Fallbacks causavam duplicatas e reaparecimento de itens já excluídos

  var legend = ['P1', 'P2', 'P3', 'P4'].map(function (p) {
    var count = openItems.filter(function (item) { return String(item.prioridade || '').toUpperCase() === p; }).length;
    return { label: _priorityLabel(p), count: count };
  });

  var heatRows = ['Alto', 'Médio', 'Baixo'];
  var heatCols = ['Baixo', 'Médio', 'Alto', 'Crítico'];
  var heatmap = {};
  heatRows.forEach(function (row) {
    heatmap[row] = {};
    heatCols.forEach(function (col) { heatmap[row][col] = 0; });
  });
  openItems.forEach(function (item) {
    var row = _humanLevel(item.probabilidade) || 'Médio';
    var col = _humanLevel(item.impacto) || 'Médio';
    if (Number(item.score || 0) >= 10 || _priorityNum(item.prioridade) === 1) col = 'Crítico';
    if (!heatmap[row]) row = 'Médio';
    if (!(col in heatmap[row])) col = col === 'Crítico' ? 'Crítico' : 'Médio';
    heatmap[row][col] += 1;
  });

  return {
    summaryExecutive: summaryExecutive,
    summaryTopRisk: summaryTopRisk,
    summaryImpact: summaryImpact,
    summaryDecision: summaryDecision,
    boardRows: boardRows,
    decisions: decisions,
    legend: legend,
    heatRows: heatRows,
    heatCols: heatCols,
    heatmap: heatmap
  };
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
  document.querySelectorAll('#logoImg,[data-shared-logo]').forEach(function (el) {
    if (logo) el.src = logo;
  });

  var set = function (id, text) {
    var e = document.getElementById(id);
    if (e) e.textContent = text;
  };
  var setHtml = function (id, html) {
    var e = document.getElementById(id);
    if (e) e.innerHTML = html;
  };
  set('coverTitle', v(cfg.report_title, 'STATUS REPORT'));
  var highlight = v(cfg.cover_highlight, '');
  setHtml('coverMainTitle', _renderCoverTitleHtml(v(cfg.cover_main_title, v(cfg.project_name, 'Projeto')), highlight));
  set('coverEyebrow', v(cfg.cover_eyebrow, ''));
  set('coverSubtitle', v(cfg.cover_subtitle, v(cfg.project_subtitle, '')));
  set('coverClientLabel', v(cfg.cover_client_label, _coverMetaDefault('client')));
  set('coverOwnerLabel', v(cfg.cover_owner_label, _coverMetaDefault('owner')));
  set('coverDateLabel', v(cfg.cover_date_label, _coverMetaDefault('date')));
  set('coverDurationLabel', v(cfg.cover_duration_label, _coverMetaDefault('duration')));
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

  var riskBoard = _buildRiskBoardModel(d);
  set('riskSummaryExecutive', riskBoard.summaryExecutive);
  set('riskSummaryTopRisk', riskBoard.summaryTopRisk);
  set('riskSummaryImpact', riskBoard.summaryImpact);
  set('riskSummaryDecision', riskBoard.summaryDecision);
  setHtml('riskBoardLegend', riskBoard.legend.map(function (item) {
    return '<span class="risk-legend-pill"><strong>' + esc(String(item.count)) + '</strong> ' + esc(item.label) + '</span>';
  }).join(''));
  setHtml('riskBoardRows', riskBoard.boardRows.length ? riskBoard.boardRows.map(function (row) {
    return '<tr class="risk-board-row tone-' + esc(row.tone) + '" data-edit-idx="' + row.origIdx + '">' +
      '<td><span class="risk-type-chip tone-' + esc(row.tone) + '">' + esc(row.type) + '</span></td>' +
      '<td><span class="risk-priority-pill p' + esc(String(_priorityNum(row.priority))) + '">' + esc(row.priority) + '</span></td>' +
      '<td><div class="risk-board-theme">' + esc(row.theme) + '</div>' +
          '<div class="risk-board-meta risk-board-meta-edit" data-edit-field="contexto">' + esc(row.meta) + '</div></td>' +
      '<td><div class="risk-board-impact">' + esc(row.impact) + '</div>' +
          '<div class="risk-board-meta risk-board-score-edit" data-edit-field="score">' + esc(row.impactMeta) + '</div></td>' +
      '<td><div class="risk-board-mitigation">' + esc(row.mitigation) + '</div></td>' +
      '<td><div class="risk-board-owner">' + esc(row.owner) + '</div></td>' +
      '<td><div class="risk-board-due" data-raw-due="' + esc(row.rawDue) + '">' + esc(row.due) + '</div></td>' +
      '<td><span class="risk-status-pill tone-' + esc(row.statusTone) + '">' + esc(row.status) + '</span></td>' +
    '</tr>';
  }).join('') : '<tr><td colspan="8" class="risk-board-empty">Nenhum risco ou issue cadastrado.</td></tr>');
  setHtml('riskDecisionList', riskBoard.decisions.map(function (item, idx) {
    return '<li data-edit-idx="' + idx + '"><span class="risk-decision-index">' + esc(String(idx + 1)) + '.</span><div><strong>' + esc(item.title) + '</strong><p>' + esc(item.body) + '</p></div></li>';
  }).join(''));
  setHtml('riskHeatmapGrid',
    '<div class="risk-heatmap-head-spacer"></div>' +
    riskBoard.heatCols.map(function (col) { return '<div class="risk-heatmap-colhead">' + esc(col) + '</div>'; }).join('') +
    riskBoard.heatRows.map(function (row) {
      return '<div class="risk-heatmap-rowhead">' + esc(row) + '</div>' +
        riskBoard.heatCols.map(function (col) {
          var count = riskBoard.heatmap[row][col] || 0;
          var tone = count === 0 ? 'zero' : (col === 'Crítico' ? 'critical' : (col === 'Alto' ? 'high' : (col === 'Médio' ? 'medium' : 'low')));
          return '<div class="risk-heatmap-cell tone-' + esc(tone) + '">' + (count === 0 ? '—' : esc(String(count))) + '</div>';
        }).join('');
    }).join('')
  );

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

  set('closingTitle', v(cfg.closing_eyebrow, 'Encerramento executivo'));
  set('closingThanks', v(cfg.closing_thanks, 'Obrigado.'));
  set('closingLead', v(cfg.closing_lead, 'Seguimos para o proximo marco com clareza, governanca e prontidao para a etapa seguinte.'));
  set('closingCardLabel', v(cfg.closing_next_step_label, 'Próximo passo'));
  set('closingMilestone', v(cfg.closing_milestone_text, v(rodape.milestone_alvo, v(cfg.current_phase, '-'))));
  set('closingDates', v(cfg.closing_dates_text, 'Data alvo ' + (rodape.data_alvo ? fmtDateShort(rodape.data_alvo) : '-') + '  •  Go-Live ' + (rodape.go_live_previsto ? fmtDateShort(rodape.go_live_previsto) : '-')));
  set('closingFooterLabel', v(cfg.closing_footer_label, 'Encerramento Executivo'));
  set('closingFooterMeta', v(cfg.closing_footer_meta, v(cfg.owner_name, 'PMO') + ' · ' + (cfg.report_date ? fmtDateShort(cfg.report_date) : '')));
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
  if (!el) return;
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
  document.querySelectorAll('#infoPlanoRing,[data-top-ring="plano"]').forEach(function (el) {
    el.innerHTML = makeRingSvg(plano, primaryColor);
  });

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
  document.querySelectorAll('#infoRealRing,[data-top-ring="real"]').forEach(function (el) {
    el.innerHTML = makeRingSvg(realPct, '#4BA8D8');
  });

  // ── SPI = Real ÷ Plano ───────────────────────────────────────────────
  document.querySelectorAll('#spiGauge,[data-top-ring="spi"]').forEach(function (el) {
    if (planoPct > 0) {
      var spi = realPct / planoPct;
      var lbl = spi >= 0.95 ? 'No prazo' : spi >= 0.80 ? 'Atenção' : 'Crítico';
      var nc  = spi >= 0.95 ? '#6ecf8e' : spi >= 0.80 ? '#f0d060' : '#ff7878';
      el.innerHTML = makeGaugeSvg(spi, spi.toFixed(2), lbl, nc);
    } else {
      el.innerHTML = makeGaugeSvg(0, '--', '', '#fff');
    }
  });
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

  // Pré-computa contagens do RAID para o KPI "risco atual"
  var _raidOpenItems = (d.pendencias_criticas || []).filter(_isRiskOpen);
  var _raidOpenCount = _raidOpenItems.length;
  var _raidP1Count   = _raidOpenItems.filter(function(i){ return _priorityNum(i.prioridade) === 1; }).length;
  var _raidKpiVal    = _raidOpenCount + (_raidOpenCount === 1 ? ' aberto' : ' abertos') +
                       (_raidP1Count > 0 ? ' / ' + _raidP1Count + (_raidP1Count === 1 ? ' crítico' : ' críticos') : '');

  el.innerHTML = kpis.map(function (k, origIdx) {
    if (SKIP_TIPOS[k.tipo || '']) return '';
    var tipo  = k.tipo  || '';
    var nivel = v(k.nivel, 'success');
    var val   = v(k.valor, '');
    var label = v(k.titulo, '');
    // KPI "risco atual": valor sempre derivado ao vivo de pendencias_criticas
    if (String(label).toLowerCase().indexOf('risco atual') >= 0) val = _raidKpiVal;
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
    // Pill de prioridade — escala de vermelho (P1 mais escuro → P4 mais suave)
    var prioKey = (p.prioridade || '').toLowerCase().replace(/\s/g, '');
    var prioCls = 'prio-' + (prioKey || 'p1');

    var meta = [];
    if (p.responsaveis) meta.push('<span class="risk-meta-val" data-edit-pend-meta="responsaveis">' + esc(p.responsaveis) + '</span>');
    if (p.id_origem)    meta.push('<span class="risk-meta-label">ID </span><span class="risk-meta-val" data-edit-pend-meta="id_origem">' + esc(p.id_origem) + '</span>');
    if (p.score !== null && p.score !== undefined && String(p.score) !== '') {
      meta.push('<span class="risk-meta-label">Score </span><span class="risk-meta-val" data-edit-pend-meta="score">' + esc(String(p.score)) + '</span>');
    }
    if (p.categoria)    meta.push('<span class="risk-meta-val" data-edit-pend-meta="categoria">' + esc(p.categoria) + '</span>');
    if (p.estrategia)   meta.push('<span class="risk-meta-val" data-edit-pend-meta="estrategia">' + esc(p.estrategia) + '</span>');
    if (p.data_limite)  meta.push('<span class="risk-meta-label">Prazo: </span><span class="risk-meta-val risk-meta-date" data-edit-pend-date="data_limite" data-raw-val="' + esc(p.data_limite) + '">' + esc(p.data_limite) + '</span>');
    if (!meta.length && editMode) {
      meta.push('<span class="risk-meta-val risk-meta-placeholder is-placeholder" data-edit-pend-meta="responsaveis" data-placeholder="Detalhes da pendência">Detalhes da pendência</span>');
    }
    var metaHtml = meta.length
      ? '<div class="risk-meta">' + meta.map(function(part) {
          return '<span class="risk-meta-part">' + part + '</span>';
        }).join('<span class="risk-meta-sep" aria-hidden="true">&middot;</span>') + '</div>'
      : '';

    return '<tr data-edit-idx="' + idx + '">' +
      '<td><span class="priority-pill ' + prioCls + '">' + esc(p.prioridade) + '</span></td>' +
      '<td><div class="risk-title">' + esc(p.item) + '</div>' + metaHtml + '</td>' +
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

function _toFiniteNumber(value) {
  var n = parseFloat(value);
  return isFinite(n) ? n : null;
}

function _clampCurvePercent(value) {
  if (!isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function _roundCurvePercent(value) {
  return Math.round(_clampCurvePercent(value));
}

function _normalizeCurvaSPoints(pontos) {
  return (pontos || [])
    .map(function (p) {
      return {
        dia: _toFiniteNumber(p && p.dia),
        planejado: _toFiniteNumber(p && p.planejado),
        realizado: _toFiniteNumber(p && p.realizado),
      };
    })
    .filter(function (p) { return p.dia !== null; })
    .sort(function (a, b) { return a.dia - b.dia; });
}

function _interpolateCurveValue(points, key, day) {
  if (!points.length) return null;
  var usable = points.filter(function (p) { return p[key] !== null; });
  if (!usable.length) return null;
  if (day <= usable[0].dia) return usable[0][key];
  if (day >= usable[usable.length - 1].dia) return usable[usable.length - 1][key];
  for (var i = 0; i < usable.length; i++) {
    if (usable[i].dia === day) return usable[i][key];
  }
  for (var j = 0; j < usable.length - 1; j++) {
    var left = usable[j];
    var right = usable[j + 1];
    if (day > left.dia && day < right.dia) {
      var span = right.dia - left.dia;
      if (span <= 0) return left[key];
      var ratio = (day - left.dia) / span;
      return left[key] + ((right[key] - left[key]) * ratio);
    }
  }
  return usable[usable.length - 1][key];
}

function getCurvaSCurrentMetrics(d) {
  d = d || {};
  var cfg = d.config || {};
  var points = _normalizeCurvaSPoints(d.curva_s || []);
  if (!points.length) {
    return {
      day: 0,
      planned: 0,
      real: 0,
      delta: 0,
      pointValue: 0,
      deltaLabel: 'Δ 0 p.p.',
      deltaVariant: 'neutral'
    };
  }

  var fallbackDay = points[points.length - 1].dia || 0;
  var currentDay = _toFiniteNumber(cfg.current_day);
  if (currentDay === null) currentDay = fallbackDay;

  var fallbackProgress = _toFiniteNumber(cfg.progress_percent);
  var plannedRaw = _interpolateCurveValue(points, 'planejado', currentDay);
  if (plannedRaw === null) plannedRaw = fallbackProgress !== null ? fallbackProgress : 0;

  var exactReal = null;
  var latestReal = null;
  points.forEach(function (p) {
    if (p.realizado === null) return;
    if (p.dia === currentDay) exactReal = p.realizado;
    if (p.dia <= currentDay) latestReal = p.realizado;
  });
  var realRaw = exactReal !== null ? exactReal : latestReal;
  if (realRaw === null) realRaw = fallbackProgress !== null ? fallbackProgress : plannedRaw;

  plannedRaw = _clampCurvePercent(plannedRaw);
  realRaw = _clampCurvePercent(realRaw);

  var planned = _roundCurvePercent(plannedRaw);
  var real = _roundCurvePercent(realRaw);
  var delta = real - planned;

  return {
    day: currentDay,
    planned: planned,
    real: real,
    delta: delta,
    pointValue: real,
    deltaLabel: 'Δ ' + (delta > 0 ? '+' : '') + delta + ' p.p.',
    deltaVariant: delta > 0 ? 'positive' : (delta < 0 ? 'negative' : 'neutral')
  };
}

/* ===== Curva S ===== */
function renderCurvaS(d) {
  var svg    = document.getElementById('curvaSvg');
  var pontos = d.curva_s  || [];
  var cfg    = d.config   || {};
  if (!pontos.length) { svg.innerHTML = ''; return; }

  var currentMetrics = getCurvaSCurrentMetrics(d);
  var currentDay = currentMetrics.day;
  var currentPct = currentMetrics.pointValue;

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

  var maxDay = Math.max.apply(null, pontos.map(function (p) { return parseFloat(p.dia) || 0; }));
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
    return [sx(parseFloat(p.dia) || 0), sy(parseFloat(p.planejado) || 0)];
  });
  var realCoords = pontos
    .filter(function (p) { return p.realizado !== null && p.realizado !== undefined && p.realizado !== ''; })
    .map(function (p) { return [sx(parseFloat(p.dia) || 0), sy(parseFloat(p.realizado) || 0)]; });

  // Se planejado e realizado estiverem iguais (ou praticamente iguais), evita percepção de desvio.
  var sameTrend = pontos.length > 0 && pontos.every(function (p) {
    var pv = parseFloat(p.planejado);
    var rv = parseFloat(p.realizado);
    if (isNaN(pv) || isNaN(rv)) return false;
    return Math.abs(pv - rv) <= 0.01;
  });
  if (sameTrend && realCoords.length === plannedCoords.length) {
    plannedCoords = realCoords.slice();
  }

  var pD = smoothPath(plannedCoords);
  var rD = smoothPath(realCoords);
  var pA = areaPath(plannedCoords);
  var rA = areaPath(realCoords);

  var pcts  = [0, 25, 50, 75, 100];

  var cx = sx(currentDay);
  var cy = sy(currentPct);
  var cardW = 138;
  var cardH = 84;
  var cardGap = 14;
  var cardX = cx + cardGap;
  if (cardX + cardW > W - padR) cardX = cx - cardGap - cardW;
  cardX = Math.max(padL + 4, Math.min(cardX, W - padR - cardW));
  var cardY = cy - cardH - 18;
  if (cardY < padT + 6) cardY = cy + 16;
  cardY = Math.max(padT + 6, Math.min(cardY, padT + chartH - cardH - 6));
  var cardTextX = cardX + 12;
  var cardTitleY = cardY + 20;
  var planLineY = cardY + 40;
  var realLineY = cardY + 56;
  var deltaLineY = cardY + 72;
  var connectorY = cardY > cy ? cardY + cardH : cardY;
  var planColor = '#3b5f85';
  var realColor = '#dd6b20';
  var deltaColor = currentMetrics.deltaVariant === 'positive'
    ? '#2d9d5f'
    : (currentMetrics.deltaVariant === 'negative' ? '#dd6b20' : '#636b76');

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

    // Card executivo do ponto atual
    '<line x1="' + cx + '" y1="' + cy + '" x2="' + (cardX + (cardX > cx ? 0 : cardW)) + '" y2="' + connectorY + '" class="chart-current-connector"/>' +
    '<rect x="' + cardX + '" y="' + cardY + '" width="' + cardW + '" height="' + cardH + '" rx="10" class="chart-current-card"/>' +
    '<text x="' + cardTextX + '" y="' + cardTitleY + '" class="chart-current-card-title">Hoje</text>' +
    '<text x="' + cardTextX + '" y="' + planLineY + '" class="chart-current-card-line chart-current-card-plan" fill="' + planColor + '">Plano: ' + currentMetrics.planned + '%</text>' +
    '<text x="' + cardTextX + '" y="' + realLineY + '" class="chart-current-card-line chart-current-card-real" fill="' + realColor + '">Real: ' + currentMetrics.real + '%</text>' +
    '<text x="' + cardTextX + '" y="' + deltaLineY + '" class="chart-current-card-line chart-current-card-delta" fill="' + deltaColor + '">' + currentMetrics.deltaLabel + '</text>' +

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
  var r   = d.rodape || {};
  var cfg = d.config || {};

  var reportNameRaw = v(cfg.report_name, v(r.nome_relatorio, 'Status Executivo'));
  var relDateSource = v(cfg.report_date, v(r.data_relatorio, ''));
  // ── Melhoria 1: data do Relatório formatada ──────────────────────────────
  var relDateRaw = relDateSource || '';
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
      value: v(cfg.owner_name, v(r.owner_relatorio, '--')),
      rawVal: null,
      editAttr: 'data-edit-config="owner_name"',
      strong: false, light: true, primary: false,
      svg: '<svg class="icon lg" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 22c1.4-4 4.2-6 8-6s6.6 2 8 6"/></svg>',
    },
    {
      title: 'Relatório',
      value:
        '<span data-edit-config="report_name">' + esc(reportNameRaw) + '</span>' +
        '<span class="foot-inline-sep" aria-hidden="true">&middot;</span>' +
        '<span class="foot-inline-date" data-edit-config-date="report_date" data-raw-val="' + esc(relDateRaw) + '">' + esc(relDateFmt) + '</span>',
      rawVal: null,
      editAttr: '',
      strong: false, light: true, primary: false,
      svg: '<svg class="icon lg" viewBox="0 0 24 24"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v6h5"/><path d="M10 13h6M10 17h6"/></svg>',
    },
  ];

  var html = items.map(function (it) {
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
  var sharedHtml = html
    .replace(/\sdata-edit-rodape="[^"]*"/g, '')
    .replace(/\sdata-edit-config="[^"]*"/g, '')
    .replace(/\sdata-edit-config-date="[^"]*"/g, '')
    .replace(/\sdata-raw-val="[^"]*"/g, '');
  var mainFooter = document.getElementById('footerStrip');
  if (mainFooter) mainFooter.innerHTML = html;
  document.querySelectorAll('[data-shared-footer="true"]').forEach(function (el) {
    el.innerHTML = sharedHtml;
  });
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
  document.body.classList.add('is-exporting');
  try {
    var resp = await _fetchWithTimeout('/api/export/pdf', { method: 'POST' }, EXPORT_TIMEOUT_MS);
    if (!resp.ok) { var e = await resp.json(); showToast(e.error || 'Falha ao exportar PDF.', 'error'); return; }
    var blob = await resp.blob();
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href = url; a.download = 'status_report.pdf';
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('PDF gerado com sucesso.', 'success');
  } catch (err) {
    showToast(err && err.name === 'AbortError' ? 'Exportação PDF expirou. Tente novamente.' : 'Erro ao exportar PDF.', 'error');
  } finally {
    btn.textContent = 'Exportar PDF';
    btn.disabled = false;
    document.body.classList.remove('is-exporting');
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
  document.body.classList.add('is-exporting');
  try {
    var resp = await _fetchWithTimeout('/api/export/pptx', { method: 'POST' }, EXPORT_TIMEOUT_MS);
    if (!resp.ok) { var e = await resp.json(); showToast(e.error || 'Falha ao exportar PPTX.', 'error'); return; }
    var blob = await resp.blob();
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href = url; a.download = 'status_report.pptx';
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('PPTX gerado com sucesso.', 'success');
  } catch (err) {
    showToast(err && err.name === 'AbortError' ? 'Exportação PPTX expirou. Tente novamente.' : 'Erro ao exportar PPTX.', 'error');
  } finally {
    btn.textContent = 'Exportar PPTX';
    btn.disabled = false;
    document.body.classList.remove('is-exporting');
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
  document.body.classList.add('printing');
  try {
    if (!window.print) {
      showToast('Impressão não disponível neste ambiente.', 'error');
      return;
    }
    window.print();
  } catch (_) {
    showToast('Não foi possível iniciar a impressão.', 'error');
  } finally {
    setTimeout(function(){ document.body.classList.remove('printing'); }, 250);
  }
}

async function requestPresentationMode() {
  if (hasUnsavedChanges()) {
    var saveFirst = confirm('Há alterações não salvas. Clique OK para salvar antes de entrar no modo apresentação, ou Cancelar para abortar.');
    if (!saveFirst) return;
    await saveEdits();
    if (editMode || hasUnsavedChanges()) return;
  }
  if (editMode) _exitEditMode();
  try {
    var root = document.documentElement;
    if (!_isPresentationMode) {
      if (root.requestFullscreen) await root.requestFullscreen();
      else if (document.body.requestFullscreen) await document.body.requestFullscreen();
      document.body.classList.add('presentation-mode');
      _isPresentationMode = true;
      refreshDeckViewportLayout();
      showToast('Modo apresentação ativo. Use setas para navegar e ESC para sair.', 'success');
    } else {
      if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
      document.body.classList.remove('presentation-mode');
      _isPresentationMode = false;
      refreshDeckViewportLayout();
    }
  } catch (_) {
    showToast('Não foi possível ativar o modo apresentação neste navegador.', 'error');
  }
}

function openLatestRelease() {
  if (!_latestReleaseUrl) return;
  window.open(_latestReleaseUrl, '_blank', 'noopener');
}

function _setUpdateButtonsLoading(which, loading) {
  var map = {
    check: { id: 'btnCheckUpdateAction', idle: 'Verificar atualizações', busy: 'Verificando...' },
    download: { id: 'btnDownloadUpdate', idle: 'Baixar atualização', busy: 'Baixando...' },
    apply: { id: 'btnApplyUpdate', idle: 'Instalar e reiniciar', busy: 'Instalando...' },
  };
  var current = map[which];
  if (!current) return;
  var btn = document.getElementById(current.id);
  if (!btn) return;
  btn.disabled = !!loading;
  btn.textContent = loading ? current.busy : current.idle;
}

function _setUpdateUiState(payload) {
  payload = payload || {};
  _updatePayload = payload;
  _latestReleaseUrl = payload.release_url || '';
  var variant = payload.error ? 'danger' : (payload.ok && payload.has_update ? 'accent' : 'success');
  var downloaded = !!(payload.downloaded_file && payload.ok && payload.has_update);
  var phase = payload.error ? 'error' : downloaded ? 'preparing' : (payload.ok && payload.has_update ? 'idle' : 'success');
  var detail = payload.error
    ? payload.error
    : downloaded
      ? 'Pacote validado e pronto para instalação com reinício seguro.'
      : (payload.message || 'Não verificado');
  var bytes = downloaded
    ? 'Download concluído, SHA-256 validado e pacote aceito pelo updater.'
    : (payload.ok && payload.has_update ? 'Download sob demanda para manter a barra discreta.' : 'Nenhum pacote pendente.');
  _updateConfirmPending = false;
  _setUpdatePhase(phase, {
    progress: phase === 'success' ? 100 : (phase === 'preparing' ? 82 : 0),
    status: payload.error ? 'Erro na atualização' : (payload.message || 'Não verificado'),
    detail: detail,
    bytes: bytes,
    variant: variant,
    downloaded: downloaded,
    latestVersion: payload.latest_version || ''
  });
}

async function checkForUpdates(manual) {
  _setUpdatePhase('checking', {
    status: 'Verificando atualizações',
    detail: 'Consultando a release pública configurada para este app.',
    bytes: 'Etapa rápida sem transferência de pacote.',
    variant: 'neutral'
  });
  _setUpdateButtonsLoading('check', true);
  try {
    var resp = await fetch('/api/update/check');
    var payload = await resp.json();
    _setUpdateUiState(payload);
    if (manual) {
      if (payload && payload.ok && payload.has_update) {
        showToast('Nova versão disponível: ' + (payload.latest_version || '-'), 'info');
      } else if (payload && payload.ok) {
        showToast('Você já está na versão mais recente.', 'success');
      } else {
        showToast((payload && payload.error) || 'Não foi possível verificar atualizações.', 'error');
      }
    }
  } catch (_) {
    _setUpdateUiState({
      current_version: '-',
      error: 'Falha de conexão ao consultar atualizações.',
      ok: false,
      has_update: false,
    });
    if (manual) showToast('Falha de conexão ao consultar atualizações.', 'error');
  } finally {
    _setUpdateButtonsLoading('check', false);
  }
}

async function downloadUpdate() {
  if (!_updatePayload || !_updatePayload.has_update) {
    showToast('Nenhuma atualização pendente para download.', 'info');
    return;
  }
  if (_updatePayload.mode !== 'portable') {
    showToast('Atualização automática disponível apenas na versão portátil.', 'info');
    return;
  }
  openUpdateModal('details');
  _setUpdatePhase('downloading', {
    status: 'Baixando atualização',
    detail: 'Recebendo o pacote portable e preparando a validação.',
    bytes: 'Percentual estimado por etapa. O backend conclui o download antes de responder.',
    progress: 42,
    variant: 'accent'
  });
  _setUpdateButtonsLoading('download', true);
  try {
    var resp = await fetch('/api/update/download', { method: 'POST' });
    var payload = await resp.json();
    if (!resp.ok || !payload.ok) {
      _setUpdatePhase('error', {
        status: 'Falha no download',
        detail: (payload && payload.error) || 'Falha ao baixar atualização.',
        bytes: 'Nenhum pacote foi mantido para instalação.',
        variant: 'danger'
      });
      openUpdateModal('details');
      showToast((payload && payload.error) || 'Falha ao baixar atualização.', 'error');
      return;
    }
    _setUpdatePhase('validating', {
      status: 'Validando integridade',
      detail: 'SHA-256 conferido com sucesso e ZIP aceito pelo updater.',
      bytes: 'Pacote recebido com segurança.',
      progress: 76,
      variant: 'accent'
    });
    _setUpdateUiState(payload);
    openUpdateModal('details');
    showToast('Pacote de atualização baixado com sucesso.', 'success');
  } catch (_) {
    _setUpdatePhase('error', {
      status: 'Erro de conexão',
      detail: 'Erro de conexão ao baixar atualização.',
      bytes: 'A operação foi interrompida antes da validação.',
      variant: 'danger'
    });
    openUpdateModal('details');
    showToast('Erro de conexão ao baixar atualização.', 'error');
  } finally {
    _setUpdateButtonsLoading('download', false);
  }
}

async function applyUpdate() {
  if (!_updatePayload || !_updatePayload.has_update) {
    showToast('Nenhuma atualização pronta para instalar.', 'info');
    return;
  }
  if (_updatePayload.mode !== 'portable') {
    showToast('Atualização automática disponível apenas na versão portátil.', 'info');
    return;
  }
  if (!_updateUiState.downloaded || !_updateConfirmPending) {
    _updateConfirmPending = true;
    _setUpdatePhase('preparing', {
      status: 'Pronto para instalar',
      detail: 'A atualização foi validada. Confirme para fechar e reiniciar o aplicativo.',
      bytes: 'Backup, rollback e arquivos preservados continuam ativos durante o apply.',
      progress: 82,
      variant: 'accent'
    });
    openUpdateModal('confirm');
    return;
  }
  _updateConfirmPending = false;
  openUpdateModal('details');
  _setUpdatePhase('installing', {
    status: 'Preparando instalação',
    detail: 'Disparando o apply seguro do pacote validado.',
    bytes: 'O app será reiniciado automaticamente após o apply.',
    progress: 92,
    variant: 'accent'
  });
  _setUpdateButtonsLoading('apply', true);
  try {
    var resp = await fetch('/api/update/apply', { method: 'POST' });
    var payload = await resp.json();
    if (!resp.ok || !payload.ok) {
      _setUpdatePhase('error', {
        status: 'Falha ao iniciar instalação',
        detail: (payload && payload.error) || 'Falha ao iniciar instalação.',
        bytes: 'Consulte o log do updater para diagnóstico detalhado.',
        variant: 'danger'
      });
      showToast((payload && payload.error) || 'Falha ao iniciar instalação.', 'error');
      return;
    }
    _setUpdatePhase('restarting', {
      status: 'Reinício em andamento',
      detail: 'Instalação iniciada. O aplicativo será fechado e reaberto em seguida.',
      bytes: 'Se algo impedir o apply, o log registrará rollback ou falha.',
      progress: 100,
      variant: 'accent'
    });
    showToast('Instalação iniciada. O app será reiniciado.', 'success');
  } catch (_) {
    _setUpdatePhase('error', {
      status: 'Erro de conexão',
      detail: 'Erro de conexão ao iniciar instalação.',
      bytes: 'Nenhuma etapa adicional foi iniciada.',
      variant: 'danger'
    });
    showToast('Erro de conexão ao iniciar instalação.', 'error');
  } finally {
    _setUpdateButtonsLoading('apply', false);
  }
}

/* ===== Edit Mode ===== */

var editMode = false;
var _editSnapshotData = null;

function _cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function _buildRenderPayload(reportData) {
  var payload = _lastRenderData ? _cloneJson(_lastRenderData) : {};
  var snapshot = _cloneJson(reportData || {});
  payload.reportData = snapshot;
  payload.data = _cloneJson(snapshot);
  return payload;
}

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
  if (editMode) {
    cancelEditMode();
    return;
  }
  if (!_appReady || _isLoadingData) {
    showToast('Aguarde o carregamento dos dados para entrar em edição.', 'info');
    return;
  }
  if (_lastRenderData && (_lastRenderData.data || _lastRenderData.reportData)) {
    enterEditMode();
  }
}

function enterEditMode() {
  if (!_appReady || _isLoadingData) return;
  if (!_lastRenderData || (!_lastRenderData.data && !_lastRenderData.reportData)) return;
  _editSnapshotData = _cloneJson(_lastRenderData.reportData || _lastRenderData.data);
  editMode = true;
  clearDirty();
  renderAll(_buildRenderPayload(_editSnapshotData));
  document.body.classList.add('edit-mode');
  document.getElementById('editModeBar').style.display = 'flex';
  var btn = document.getElementById('btnEdit');
  if (btn) btn.classList.add('active');
  _attachAllEditHandlers();
  _syncAppStateUi();
  if (_isGanttSlideActive()) {
    requestAnimationFrame(function () {
      if (editMode && _isGanttSlideActive()) openGanttManageModal();
    });
  }
}

function cancelEditMode() {
  _closeBadgeMenus();
  closeConfigDrawer();
  if (editMode && _lastRenderData) renderAll(_lastRenderData);
  _exitEditMode();
}

function _exitEditMode() {
  editMode = false;
  _editSnapshotData = null;
  clearDirty();
  closeGanttManageModal();
  _closeFloatingEditors();
  // Limpa artefatos de UI criados dinamicamente no modo edição.
  document.querySelectorAll('.edit-add-wrap, .edit-rm-btn').forEach(function(el){ el.remove(); });
  document.querySelectorAll('.edit-add-host').forEach(function(el){ el.classList.remove('edit-add-host'); });
  document.body.classList.remove('edit-mode');
  document.getElementById('editModeBar').style.display = 'none';
  var btn = document.getElementById('btnEdit');
  if (btn) btn.classList.remove('active');
  // Remove any floating date pickers
  document.querySelectorAll('.date-overlay-input').forEach(function(el){ el.remove(); });
  _renderGanttInlineEditor();
  _syncDirtyUi();
  _syncAppStateUi();
}

/* ── contenteditable sem quebra de layout ── */
function _ce(el) {
  if (!el || el.contentEditable === 'true') return;
  el.setAttribute('contenteditable', 'true');
  el.setAttribute('spellcheck', 'false');
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
function _dateField(el, rawDateBR, onSave, formatDisplay) {
  if (!el || el.dataset.editDateAttached) return;
  el.dataset.editDateAttached = '1';
  el.dataset.rawDate = rawDateBR || '';
  el.classList.add('edit-date-field');

  el.addEventListener('click', function(e) {
    if (!editMode) return;
    e.preventDefault(); e.stopPropagation();
    _openDatePicker(el, el.dataset.rawDate, function(newRaw, formatted) {
      el.textContent = formatDisplay ? formatDisplay(newRaw, formatted) : formatted;
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
  _attachCoverHandlers();
  _attachClosingHandlers();
  _attachHeaderHandlers();
  _attachKpisHandlers();
  _attachResumoHandlers();
  _attachPendenciasHandlers();
  _attachAcoesHandlers();
  _attachMarcosHandlers();
  _attachGanttHandlers();
  _attachFooterHandlers();
  _attachRiskBoardHandlers();
}

/* ── Risk & Issue Board (Slide 3) ── */
var _RISK_STATUSES = ['Em atenção', 'Mitigate', 'Monitor', 'Aberto', 'Controlado', 'Concluído'];
var _RISK_TIPOS    = ['Risk', 'Issue', 'Action'];

function _riskPillPriorityClass(val) {
  return 'risk-priority-pill p' + _priorityNum(val);
}

function _riskPillStatusClass(val) {
  return 'risk-status-pill tone-' + _riskStatusTone(val);
}

function _riskTypeChipClass(val) {
  var t = String(val || 'Risk');
  var tone = t === 'Issue' ? 'critical' : (t === 'Action' ? 'steady' : 'watch');
  return 'risk-type-chip tone-' + tone;
}

/* Re-renderiza apenas a seção do Risk Board sem re-renderizar o deck todo */
function _rerenderRiskBoard() {
  if (!_editSnapshotData) return;
  var d = _editSnapshotData;
  var riskBoard = _buildRiskBoardModel(d);

  function _sh(id, html) { var e = document.getElementById(id); if (e) e.innerHTML = html; }
  function _st(id, txt)  { var e = document.getElementById(id); if (e) e.textContent = txt; }

  _st('riskSummaryExecutive', riskBoard.summaryExecutive);
  _st('riskSummaryTopRisk',   riskBoard.summaryTopRisk);
  _st('riskSummaryImpact',    riskBoard.summaryImpact);
  _st('riskSummaryDecision',  riskBoard.summaryDecision);

  _sh('riskBoardLegend', riskBoard.legend.map(function (item) {
    return '<span class="risk-legend-pill"><strong>' + esc(String(item.count)) + '</strong> ' + esc(item.label) + '</span>';
  }).join(''));

  _sh('riskBoardRows', riskBoard.boardRows.length
    ? riskBoard.boardRows.map(function (row) {
        return '<tr class="risk-board-row tone-' + esc(row.tone) + '" data-edit-idx="' + row.origIdx + '">' +
          '<td><span class="risk-type-chip tone-' + esc(row.tone) + '">' + esc(row.type) + '</span></td>' +
          '<td><span class="risk-priority-pill p' + esc(String(_priorityNum(row.priority))) + '">' + esc(row.priority) + '</span></td>' +
          '<td><div class="risk-board-theme">' + esc(row.theme) + '</div>' +
              '<div class="risk-board-meta risk-board-meta-edit" data-edit-field="contexto">' + esc(row.meta) + '</div></td>' +
          '<td><div class="risk-board-impact">' + esc(row.impact) + '</div>' +
              '<div class="risk-board-meta risk-board-score-edit" data-edit-field="score">' + esc(row.impactMeta) + '</div></td>' +
          '<td><div class="risk-board-mitigation">' + esc(row.mitigation) + '</div></td>' +
          '<td><div class="risk-board-owner">' + esc(row.owner) + '</div></td>' +
          '<td><div class="risk-board-due" data-raw-due="' + esc(row.rawDue) + '">' + esc(row.due) + '</div></td>' +
          '<td><span class="risk-status-pill tone-' + esc(row.statusTone) + '">' + esc(row.status) + '</span></td>' +
        '</tr>';
      }).join('')
    : '<tr><td colspan="8" class="risk-board-empty">Nenhum risco ou issue cadastrado.</td></tr>'
  );

  _sh('riskDecisionList', riskBoard.decisions.map(function (item, idx) {
    return '<li data-edit-idx="' + idx + '"><span class="risk-decision-index">' + esc(String(idx + 1)) + '.</span>' +
      '<div><strong>' + esc(item.title) + '</strong><p>' + esc(item.body) + '</p></div></li>';
  }).join(''));

  _sh('riskHeatmapGrid',
    '<div class="risk-heatmap-head-spacer"></div>' +
    riskBoard.heatCols.map(function (col) {
      return '<div class="risk-heatmap-colhead">' + esc(col) + '</div>';
    }).join('') +
    riskBoard.heatRows.map(function (hrow) {
      return '<div class="risk-heatmap-rowhead">' + esc(hrow) + '</div>' +
        riskBoard.heatCols.map(function (col) {
          var count = riskBoard.heatmap[hrow][col] || 0;
          var tone = count === 0 ? 'zero' : (col === 'Crítico' ? 'critical' : (col === 'Alto' ? 'high' : (col === 'Médio' ? 'medium' : 'low')));
          return '<div class="risk-heatmap-cell tone-' + esc(tone) + '">' + (count === 0 ? '—' : esc(String(count))) + '</div>';
        }).join('');
    }).join('')
  );
}

function addRiskItem() {
  if (!_editSnapshotData) return;
  if (!_editSnapshotData.pendencias_criticas) _editSnapshotData.pendencias_criticas = [];
  _editSnapshotData.pendencias_criticas.push({
    tipo: 'Risk', prioridade: 'P3', item: 'Novo risco/issue', responsaveis: '',
    status: 'Em atenção', nivel: 'warning',
    id_origem: null, categoria: null, score: null, probabilidade: null,
    impacto: null, estrategia: null, data_limite: null, comentarios: null
  });
  markDirty();
  _rerenderRiskBoard();
  _attachRiskBoardHandlers();
}

function _attachRiskBoardHandlers() {
  if (!_editSnapshotData) return;

  /* ── Linhas do board: tema, mitigação, owner, prazo, prioridade, status ── */
  var tbody = document.getElementById('riskBoardRows');
  if (tbody) {
    tbody.querySelectorAll('tr[data-edit-idx]').forEach(function (tr) {
      var idx = parseInt(tr.dataset.editIdx, 10);
      var pendArr = _editSnapshotData.pendencias_criticas || [];
      if (idx < 0 || idx >= pendArr.length) return;

      /* Tema (item) */
      var themeEl = tr.querySelector('.risk-board-theme');
      if (themeEl) {
        _ce(themeEl);
        if (!themeEl.dataset.syncBound) {
          themeEl.dataset.syncBound = '1';
          themeEl.addEventListener('input', function () {
            if (!(_editSnapshotData.pendencias_criticas || [])[idx]) return;
            _editSnapshotData.pendencias_criticas[idx].item = String(themeEl.textContent || '').trim();
            markDirty();
          });
        }
      }

      /* Mitigação (comentarios, com fallback para estrategia) */
      var mitEl = tr.querySelector('.risk-board-mitigation');
      if (mitEl) {
        _ce(mitEl);
        if (!mitEl.dataset.syncBound) {
          mitEl.dataset.syncBound = '1';
          mitEl.addEventListener('input', function () {
            if (!(_editSnapshotData.pendencias_criticas || [])[idx]) return;
            _editSnapshotData.pendencias_criticas[idx].comentarios = String(mitEl.textContent || '').trim() || null;
            markDirty();
          });
        }
      }

      /* Owner (responsaveis) */
      var ownerEl = tr.querySelector('.risk-board-owner');
      if (ownerEl) {
        _ce(ownerEl);
        if (!ownerEl.dataset.syncBound) {
          ownerEl.dataset.syncBound = '1';
          ownerEl.addEventListener('input', function () {
            if (!(_editSnapshotData.pendencias_criticas || [])[idx]) return;
            _editSnapshotData.pendencias_criticas[idx].responsaveis = String(ownerEl.textContent || '').trim() || null;
            markDirty();
          });
        }
      }

      /* Prazo (data_limite) — date picker */
      var dueEl = tr.querySelector('.risk-board-due');
      if (dueEl) {
        _dateField(dueEl, dueEl.dataset.rawDue || '', function (newRaw) {
          dueEl.dataset.rawDue = newRaw;
          if (!(_editSnapshotData.pendencias_criticas || [])[idx]) return;
          _editSnapshotData.pendencias_criticas[idx].data_limite = newRaw;
          markDirty();
        }, function (newRaw, formatted) {
          return formatted || fmtDateShort(newRaw) || newRaw;
        });
      }

      /* Tipo (badge dropdown: Risk / Issue / Action) */
      var typeEl = tr.querySelector('.risk-type-chip');
      if (typeEl && !typeEl.parentNode.classList.contains('badge-sel-wrap')) {
        _badgeDropdown(typeEl, _RISK_TIPOS, pendArr[idx].tipo || _riskTypeForBoard(pendArr[idx]), _riskTypeChipClass, function (val) {
          if ((_editSnapshotData.pendencias_criticas || [])[idx]) {
            _editSnapshotData.pendencias_criticas[idx].tipo = val;
            markDirty();
          }
        });
      }

      /* Prioridade (badge dropdown) */
      var prioEl = tr.querySelector('.risk-priority-pill');
      if (prioEl && !prioEl.parentNode.classList.contains('badge-sel-wrap')) {
        _badgeDropdown(prioEl, _PEND_PRIORIDADES, pendArr[idx].prioridade, _riskPillPriorityClass, function (val) {
          if ((_editSnapshotData.pendencias_criticas || [])[idx]) {
            _editSnapshotData.pendencias_criticas[idx].prioridade = val;
            markDirty();
          }
        });
      }

      /* Status (badge dropdown) */
      var statusEl = tr.querySelector('.risk-status-pill');
      if (statusEl && !statusEl.parentNode.classList.contains('badge-sel-wrap')) {
        _badgeDropdown(statusEl, _RISK_STATUSES, pendArr[idx].status, _riskPillStatusClass, function (val) {
          if ((_editSnapshotData.pendencias_criticas || [])[idx]) {
            _editSnapshotData.pendencias_criticas[idx].status = val;
            markDirty();
          }
        });
      }

      /* Impacto linha 1 (impacto_display — texto livre) */
      var impactEl = tr.querySelector('.risk-board-impact');
      if (impactEl) {
        _ce(impactEl);
        if (!impactEl.dataset.syncBound) {
          impactEl.dataset.syncBound = '1';
          impactEl.addEventListener('input', function () {
            if (!(_editSnapshotData.pendencias_criticas || [])[idx]) return;
            _editSnapshotData.pendencias_criticas[idx].impacto_display = String(impactEl.textContent || '').trim() || null;
            markDirty();
          });
        }
      }

      /* Meta/contexto (id_origem + categoria — texto livre) */
      var metaEl = tr.querySelector('.risk-board-meta-edit');
      if (metaEl) {
        _ce(metaEl);
        if (!metaEl.dataset.syncBound) {
          metaEl.dataset.syncBound = '1';
          metaEl.addEventListener('input', function () {
            if (!(_editSnapshotData.pendencias_criticas || [])[idx]) return;
            _editSnapshotData.pendencias_criticas[idx].id_origem = String(metaEl.textContent || '').trim() || null;
            markDirty();
          });
        }
      }

      /* Score (impacto meta — texto livre) */
      var scoreEl = tr.querySelector('.risk-board-score-edit');
      if (scoreEl) {
        _ce(scoreEl);
        if (!scoreEl.dataset.syncBound) {
          scoreEl.dataset.syncBound = '1';
          scoreEl.addEventListener('input', function () {
            if (!(_editSnapshotData.pendencias_criticas || [])[idx]) return;
            var raw = String(scoreEl.textContent || '').trim();
            var num = parseFloat(raw);
            _editSnapshotData.pendencias_criticas[idx].score = isFinite(num) ? num : (raw || null);
            markDirty();
          });
        }
      }

      /* Botão remover linha */
      if (!tr.querySelector('.edit-rm-btn')) {
        (function (capturedIdx) {
          var td = document.createElement('td');
          td.style.verticalAlign = 'middle';
          td.appendChild(_rmBtn(function () {
            if (!_editSnapshotData || !_editSnapshotData.pendencias_criticas) return;
            _editSnapshotData.pendencias_criticas.splice(capturedIdx, 1);
            markDirty();
            _rerenderRiskBoard();
            _attachRiskBoardHandlers();
          }));
          tr.appendChild(td);
        }(idx));
      }
    });

    /* Botão adicionar novo risco/issue */
    var mainPanel = tbody && tbody.closest('.risk-board-main');
    if (mainPanel) {
      mainPanel.classList.add('edit-add-host');
      var prevWrap = mainPanel.querySelector('.edit-add-wrap[data-for="riskBoardRows"]');
      if (prevWrap) prevWrap.remove();
      var addWrapEl = _addWrap('Adicionar risco/issue', addRiskItem);
      addWrapEl.dataset.for = 'riskBoardRows';
      mainPanel.appendChild(addWrapEl);
    }
  }

  /* ── Decisões necessárias: título da ação ── */
  var decList = document.getElementById('riskDecisionList');
  if (decList) {
    decList.querySelectorAll('li[data-edit-idx]').forEach(function (li) {
      var idx = parseInt(li.dataset.editIdx, 10);
      var acoesArr = _editSnapshotData.proximas_acoes || [];
      if (idx < 0 || idx >= acoesArr.length) return;

      /* Edição do título */
      var strongEl = li.querySelector('strong');
      if (strongEl) {
        _ce(strongEl);
        if (!strongEl.dataset.syncBound) {
          strongEl.dataset.syncBound = '1';
          strongEl.addEventListener('input', function () {
            if (!(_editSnapshotData.proximas_acoes || [])[idx]) return;
            _editSnapshotData.proximas_acoes[idx].texto = String(strongEl.textContent || '').trim();
            markDirty();
          });
        }
      }

      /* Botão remover */
      if (!li.querySelector('.edit-rm-btn')) {
        (function (capturedIdx) {
          li.appendChild(_rmBtn(function () {
            if (!_editSnapshotData || !_editSnapshotData.proximas_acoes) return;
            _editSnapshotData.proximas_acoes.splice(capturedIdx, 1);
            markDirty();
            _rerenderRiskBoard();
            _attachRiskBoardHandlers();
            renderAcoes({ proximas_acoes: _editSnapshotData.proximas_acoes });
            if (typeof _attachAcoesHandlers === 'function') _attachAcoesHandlers();
          }));
        }(idx));
      }
    });

    /* Botão adicionar nova decisão */
    var decPanel = decList.closest('.risk-board-panel') || decList.parentNode;
    if (decPanel) {
      decPanel.classList.add('edit-add-host');
      var prevDecWrap = decPanel.querySelector('.edit-add-wrap[data-for="riskDecisionList"]');
      if (prevDecWrap) prevDecWrap.remove();
      var decAddWrap = _addWrap('Adicionar decisão', function () {
        if (!_editSnapshotData) return;
        if (!_editSnapshotData.proximas_acoes) _editSnapshotData.proximas_acoes = [];
        if (_editSnapshotData.proximas_acoes.length >= 3) return;
        _editSnapshotData.proximas_acoes.push({ texto: 'Nova decisão', status: 'Em andamento' });
        markDirty();
        _rerenderRiskBoard();
        _attachRiskBoardHandlers();
        renderAcoes({ proximas_acoes: _editSnapshotData.proximas_acoes });
        if (typeof _attachAcoesHandlers === 'function') _attachAcoesHandlers();
      });
      decAddWrap.dataset.for = 'riskDecisionList';
      decPanel.appendChild(decAddWrap);
    }
  }
}

/* ── Encerramento / Slide 4 ── */
function _attachClosingHandlers() {
  if (!_editSnapshotData) return;
  if (!_editSnapshotData.config) _editSnapshotData.config = {};
  var cfg = _editSnapshotData.config;

  function bindText(id, path, normalize) {
    var el = document.getElementById(id);
    if (!el) return;
    _ce(el);
    if (!el.dataset.syncBound) {
      el.dataset.syncBound = '1';
      el.addEventListener('input', function () {
        var raw = el.textContent;
        cfg[path] = normalize ? normalize(raw) : String(raw || '').trim();
      });
    }
  }

  bindText('closingTitle', 'closing_eyebrow', function (raw) { return String(raw || '').trim(); });
  bindText('closingThanks', 'closing_thanks', function (raw) { return String(raw || '').trim(); });
  bindText('closingLead', 'closing_lead', function (raw) { return String(raw || '').trim(); });
  bindText('closingCardLabel', 'closing_next_step_label', function (raw) { return String(raw || '').trim(); });
  bindText('closingMilestone', 'closing_milestone_text', function (raw) { return String(raw || '').trim(); });
  bindText('closingDates', 'closing_dates_text', function (raw) { return String(raw || '').trim(); });
  bindText('closingFooterLabel', 'closing_footer_label', function (raw) { return String(raw || '').trim().toUpperCase(); });
  bindText('closingFooterMeta', 'closing_footer_meta', function (raw) { return String(raw || '').trim().toUpperCase(); });
}

/* ── Capa / Slide 1 ── */
function _attachCoverHandlers() {
  if (!_editSnapshotData) return;
  if (!_editSnapshotData.config) _editSnapshotData.config = {};
  var cfg = _editSnapshotData.config;

  function bindText(id, path, normalize, rerender) {
    var el = document.getElementById(id);
    if (!el) return;
    _ce(el);
    if (!el.dataset.syncBound) {
      el.dataset.syncBound = '1';
      el.addEventListener('input', function () {
        var raw = el.textContent;
        cfg[path] = normalize ? normalize(raw) : String(raw || '').trim();
      });
      if (rerender) el.addEventListener('blur', rerender);
    }
  }

  bindText('coverEyebrow', 'cover_eyebrow', function (raw) { return String(raw || '').trim(); });
  bindText('coverMainTitle', 'cover_main_title', _coverTitleToStorage, function () {
    document.getElementById('coverMainTitle').innerHTML = _renderCoverTitleHtml(cfg.cover_main_title, v(cfg.cover_highlight, ''));
  });
  bindText('coverSubtitle', 'cover_subtitle', function (raw) { return String(raw || '').trim(); });
  bindText('coverClientLabel', 'cover_client_label', function (raw) { return String(raw || '').trim().toUpperCase(); });
  bindText('coverOwnerLabel', 'cover_owner_label', function (raw) { return String(raw || '').trim().toUpperCase(); });
  bindText('coverDateLabel', 'cover_date_label', function (raw) { return String(raw || '').trim().toUpperCase(); });
  bindText('coverDurationLabel', 'cover_duration_label', function (raw) { return String(raw || '').trim().toUpperCase(); });
  bindText('coverClient', 'sponsor', function (raw) { return String(raw || '').trim(); });
  bindText('coverOwner', 'owner_name', function (raw) { return String(raw || '').trim(); });
  bindText('coverDuration', 'presentation_duration', function (raw) { return String(raw || '').trim(); });

  var coverDate = document.getElementById('coverDate');
  _dateField(coverDate, v(cfg.report_date, ''), function (newRaw) {
    cfg.report_date = newRaw;
  }, function (newRaw, formatted) {
    return formatted || newRaw;
  });
}

/* ── Header ── */
function _attachHeaderHandlers() {
  var titleEl = document.getElementById('projectTitle');
  var subtitleEl = document.getElementById('projectSubtitle');
  var alertEl = document.getElementById('alertText');
  _ce(titleEl);
  _ce(subtitleEl);
  _ce(alertEl);
  if (titleEl && !titleEl.dataset.syncBound) {
    titleEl.dataset.syncBound = '1';
    titleEl.addEventListener('input', function () {
      if (_editSnapshotData && _editSnapshotData.config) _editSnapshotData.config.project_name = titleEl.textContent.trim();
    });
  }
  if (subtitleEl && !subtitleEl.dataset.syncBound) {
    subtitleEl.dataset.syncBound = '1';
    subtitleEl.addEventListener('input', function () {
      if (_editSnapshotData && _editSnapshotData.config) _editSnapshotData.config.project_subtitle = subtitleEl.textContent.trim();
    });
  }
  if (alertEl && !alertEl.dataset.syncBound) {
    alertEl.dataset.syncBound = '1';
    alertEl.addEventListener('input', function () {
      if (_editSnapshotData && _editSnapshotData.config) _editSnapshotData.config.alert_label = alertEl.textContent.trim();
    });
  }
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
  var host = container.closest('.panel') || container.parentNode;
  if (host) host.classList.add('edit-add-host');
  // Remove antigo wrap se existir
  var prev = host.querySelector('.edit-add-wrap[data-for="' + listId + '"]');
  if (prev) prev.remove();
  var wrap = _addWrap(label, fn);
  wrap.dataset.for = listId;
  if (host) host.appendChild(wrap);
}

function addResumoItem() {
  if (!_editSnapshotData) return;
  if (!_editSnapshotData.resumo_executivo) _editSnapshotData.resumo_executivo = [];
  _editSnapshotData.resumo_executivo.push({ ordem: _editSnapshotData.resumo_executivo.length + 1, texto: 'Novo item', status: 'andamento' });
  markDirty();
  renderResumo({ resumo_executivo: _editSnapshotData.resumo_executivo });
  _attachResumoHandlers();
  var list = document.querySelector('#resumo li[data-edit-idx="' + (_editSnapshotData.resumo_executivo.length - 1) + '"] .resumo-text');
  if (list) list.focus();
}

/* ── Pendências Críticas ── */
var _PEND_PRIORIDADES = ['P1', 'P2', 'P3', 'P4'];

function _pendPriorityClass(val) {
  var prioKey = String(val || 'P1').toLowerCase().replace(/\s/g, '');
  return 'priority-pill prio-' + (prioKey || 'p1');
}

function _normalizePendenciaMetaValue(key, value) {
  var text = String(value || '').trim();
  if (!text) return null;
  if (key === 'score') {
    var num = Number(text);
    return isFinite(num) ? num : text;
  }
  return text;
}

function _attachPendenciasHandlers() {
  var tbody = document.getElementById('pendencias');
  if (!tbody) return;

  tbody.querySelectorAll('tr[data-edit-idx]').forEach(function(tr) {
    var idx = parseInt(tr.dataset.editIdx, 10);
    var pend = (_editSnapshotData.pendencias_criticas || [])[idx] || {};

    _ce(tr.querySelector('.risk-title'));

    var prio = tr.querySelector('.priority-pill');
    if (prio && !prio.parentNode.classList.contains('badge-sel-wrap')) {
      _badgeDropdown(prio, _PEND_PRIORIDADES, pend.prioridade, _pendPriorityClass, function(val) {
        if (_editSnapshotData.pendencias_criticas[idx]) {
          _editSnapshotData.pendencias_criticas[idx].prioridade = val;
          markDirty();
        }
      });
    }

    tr.querySelectorAll('.risk-meta-val[data-edit-pend-meta]').forEach(function(metaEl) {
      _ce(metaEl);
      var placeholderText = metaEl.dataset.placeholder || '';
      if (placeholderText && !metaEl.dataset.placeholderBound) {
        metaEl.dataset.placeholderBound = '1';
        metaEl.addEventListener('focus', function () {
          if (metaEl.classList.contains('is-placeholder')) {
            metaEl.textContent = '';
            metaEl.classList.remove('is-placeholder');
          }
        });
        metaEl.addEventListener('blur', function () {
          if (metaEl.textContent.trim()) return;
          metaEl.textContent = placeholderText;
          metaEl.classList.add('is-placeholder');
        });
      }
      if (placeholderText && !String(metaEl.textContent || '').trim()) {
        metaEl.textContent = placeholderText;
        metaEl.classList.add('is-placeholder');
      }
      if (!metaEl.dataset.syncBound) {
        metaEl.dataset.syncBound = '1';
        metaEl.addEventListener('input', function () {
          if (!_editSnapshotData || !_editSnapshotData.pendencias_criticas[idx]) return;
          if (placeholderText && metaEl.classList.contains('is-placeholder')) {
            _editSnapshotData.pendencias_criticas[idx][metaEl.dataset.editPendMeta] = null;
            return;
          }
          _editSnapshotData.pendencias_criticas[idx][metaEl.dataset.editPendMeta] =
            _normalizePendenciaMetaValue(metaEl.dataset.editPendMeta, metaEl.textContent);
        });
      }
    });

    tr.querySelectorAll('.risk-meta-date[data-edit-pend-date]').forEach(function(dateEl) {
      if (!dateEl.dataset.editDateAttached) {
        _dateField(dateEl, dateEl.dataset.rawVal || '', function(newRaw) {
          dateEl.dataset.rawVal = newRaw;
          if (!_editSnapshotData || !_editSnapshotData.pendencias_criticas[idx]) return;
          _editSnapshotData.pendencias_criticas[idx][dateEl.dataset.editPendDate] = newRaw;
          markDirty();
        }, function(newRaw) {
          return newRaw;
        });
      }
    });

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
  var row = document.querySelector('#pendencias tr[data-edit-idx="' + (_editSnapshotData.pendencias_criticas.length - 1) + '"] .risk-title');
  if (row) row.focus();
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
  var item = document.querySelector('#acoes li[data-edit-idx="' + (_editSnapshotData.proximas_acoes.length - 1) + '"] .acao-text');
  if (item) item.focus();
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

function _attachGanttHandlers() {
  if (!_editSnapshotData) return;
  if (!_editSnapshotData.gantt_config) _editSnapshotData.gantt_config = {};
  var gcfg = _editSnapshotData.gantt_config;

  function bindText(el, key, fallbackValue) {
    if (!el) return;
    _ce(el);
    if (el.textContent.trim() === '-' && fallbackValue) el.textContent = fallbackValue;
    if (!el.dataset.syncBound) {
      el.dataset.syncBound = '1';
      el.addEventListener('input', function () {
        gcfg[key] = String(el.textContent || '').trim();
        markDirty();
      });
    }
  }

  bindText(document.getElementById('ganttTitle'), 'titulo', _ganttTitleDefault());
  bindText(document.getElementById('ganttSubtitle'), 'subtitulo', _ganttSubtitleDefault(_editSnapshotData));
  _renderGanttInlineEditor();
  _bindGanttSvgTargets();
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
      if (!el.dataset.syncBound) {
        el.dataset.syncBound = '1';
        el.addEventListener('input', function () {
          if (!_editSnapshotData) return;
          if (el.dataset.editRodape) {
            if (!_editSnapshotData.rodape) _editSnapshotData.rodape = {};
            _editSnapshotData.rodape[el.dataset.editRodape] = el.textContent.trim();
          }
        });
      }
    }
  });
  document.querySelectorAll('[data-edit-config]').forEach(function(el) {
    _ce(el);
    if (!el.dataset.syncBound) {
      el.dataset.syncBound = '1';
      el.addEventListener('input', function () {
        if (_editSnapshotData && _editSnapshotData.config) {
          _editSnapshotData.config[el.dataset.editConfig] = el.textContent.trim();
        }
      });
    }
  });
  document.querySelectorAll('[data-edit-config-date]').forEach(function(el) {
    var key = el.dataset.editConfigDate;
    var rawVal = el.dataset.rawVal || '';
    if (!el.dataset.editDateAttached) {
      _dateField(el, rawVal, function(newRaw) {
        el.dataset.rawVal = newRaw;
        if (!_editSnapshotData) return;
        if (!_editSnapshotData.config) _editSnapshotData.config = {};
        _editSnapshotData.config[key] = newRaw;
      });
    }
  });
}

/* ── Coleta dados para salvar ── */
function collectEdits() {
  var data = JSON.parse(JSON.stringify(_editSnapshotData));
  if (!data.config) data.config = {};

  // Capa / Slide 1
  var coverEyebrow = document.getElementById('coverEyebrow');
  var coverTitle = document.getElementById('coverMainTitle');
  var coverSubtitle = document.getElementById('coverSubtitle');
  var coverClientLabel = document.getElementById('coverClientLabel');
  var coverOwnerLabel = document.getElementById('coverOwnerLabel');
  var coverDateLabel = document.getElementById('coverDateLabel');
  var coverDurationLabel = document.getElementById('coverDurationLabel');
  var coverClient = document.getElementById('coverClient');
  var coverOwner = document.getElementById('coverOwner');
  var coverDate = document.getElementById('coverDate');
  var coverDuration = document.getElementById('coverDuration');
  if (coverEyebrow && coverEyebrow.contentEditable === 'true') data.config.cover_eyebrow = coverEyebrow.textContent.trim();
  if (coverTitle && coverTitle.contentEditable === 'true') data.config.cover_main_title = _coverTitleToStorage(coverTitle.textContent);
  if (coverSubtitle && coverSubtitle.contentEditable === 'true') data.config.cover_subtitle = coverSubtitle.textContent.trim();
  if (coverClientLabel && coverClientLabel.contentEditable === 'true') data.config.cover_client_label = coverClientLabel.textContent.trim().toUpperCase();
  if (coverOwnerLabel && coverOwnerLabel.contentEditable === 'true') data.config.cover_owner_label = coverOwnerLabel.textContent.trim().toUpperCase();
  if (coverDateLabel && coverDateLabel.contentEditable === 'true') data.config.cover_date_label = coverDateLabel.textContent.trim().toUpperCase();
  if (coverDurationLabel && coverDurationLabel.contentEditable === 'true') data.config.cover_duration_label = coverDurationLabel.textContent.trim().toUpperCase();
  if (coverClient && coverClient.contentEditable === 'true') data.config.sponsor = coverClient.textContent.trim();
  if (coverOwner && coverOwner.contentEditable === 'true') data.config.owner_name = coverOwner.textContent.trim();
  if (coverDate && coverDate.dataset.rawDate) data.config.report_date = coverDate.dataset.rawDate;
  if (coverDuration && coverDuration.contentEditable === 'true') data.config.presentation_duration = coverDuration.textContent.trim();

  // Encerramento / Slide 4
  var closingTitle = document.getElementById('closingTitle');
  var closingThanks = document.getElementById('closingThanks');
  var closingLead = document.getElementById('closingLead');
  var closingCardLabel = document.getElementById('closingCardLabel');
  var closingMilestone = document.getElementById('closingMilestone');
  var closingDates = document.getElementById('closingDates');
  var closingFooterLabel = document.getElementById('closingFooterLabel');
  var closingFooterMeta = document.getElementById('closingFooterMeta');
  if (closingTitle && closingTitle.contentEditable === 'true') data.config.closing_eyebrow = closingTitle.textContent.trim();
  if (closingThanks && closingThanks.contentEditable === 'true') data.config.closing_thanks = closingThanks.textContent.trim();
  if (closingLead && closingLead.contentEditable === 'true') data.config.closing_lead = closingLead.textContent.trim();
  if (closingCardLabel && closingCardLabel.contentEditable === 'true') data.config.closing_next_step_label = closingCardLabel.textContent.trim();
  if (closingMilestone && closingMilestone.contentEditable === 'true') data.config.closing_milestone_text = closingMilestone.textContent.trim();
  if (closingDates && closingDates.contentEditable === 'true') data.config.closing_dates_text = closingDates.textContent.trim();
  if (closingFooterLabel && closingFooterLabel.contentEditable === 'true') data.config.closing_footer_label = closingFooterLabel.textContent.trim().toUpperCase();
  if (closingFooterMeta && closingFooterMeta.contentEditable === 'true') data.config.closing_footer_meta = closingFooterMeta.textContent.trim().toUpperCase();

  // Gantt / Slide 4
  var ganttTitle = document.getElementById('ganttTitle');
  var ganttSubtitle = document.getElementById('ganttSubtitle');
  if (!data.gantt_config) data.gantt_config = {};
  if (ganttTitle && ganttTitle.contentEditable === 'true') data.gantt_config.titulo = ganttTitle.textContent.trim();
  if (ganttSubtitle && ganttSubtitle.contentEditable === 'true') data.gantt_config.subtitulo = ganttSubtitle.textContent.trim();

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

  // Footer — datas via dataset
  document.querySelectorAll('[data-edit-rodape]').forEach(function(el) {
    if (!data.rodape) data.rodape = {};
    var key = el.dataset.editRodape;
    if (el.dataset.editDateAttached) {
      // Data: usa rawDate do dataset (atualizado pelo picker)
      if (el.dataset.rawVal) data.rodape[key] = el.dataset.rawVal;
    }
  });
  document.querySelectorAll('[data-edit-config-date]').forEach(function(el) {
    var key = el.dataset.editConfigDate;
    if (key && el.dataset.rawVal) data.config[key] = el.dataset.rawVal;
  });

  // Reordenar arrays
  if (data.resumo_executivo) data.resumo_executivo = data.resumo_executivo.map(function(r,i){ return Object.assign({},r,{ordem:i+1}); });
  if (data.proximas_acoes)   data.proximas_acoes   = data.proximas_acoes.map(function(a,i){ return Object.assign({},a,{ordem:i+1}); });
  if (data.marcos)           data.marcos           = data.marcos.map(function(m,i){ return Object.assign({},m,{ordem:i+1}); });
  if (data.fases)            data.fases            = data.fases.map(function(f,i){ return Object.assign({},f,{ordem:i+1}); });
  if (data.kpis)             data.kpis             = data.kpis.map(function(k,i){ return Object.assign({},k,{ordem:i+1}); });
  if (!data.rodape) data.rodape = {};
  if (data.config && data.config.owner_name) data.rodape.owner_relatorio = data.config.owner_name;

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
      body: JSON.stringify({ reportData: payload })
    });
    if (!resp.ok) {
      var err = await resp.json();
      showToast('Não foi possível salvar as alterações. Tente novamente.', 'error');
      return;
    }
    if (_lastRenderData) {
      _lastRenderData.reportData = JSON.parse(JSON.stringify(payload));
      _lastRenderData.data = JSON.parse(JSON.stringify(payload));
      renderAll(_lastRenderData);
    }
    clearDirty();
    _exitEditMode();
    showToast('✓ Alterações salvas com sucesso', 'success');
  } catch(err) {
    showToast('Não foi possível salvar as alterações. Tente novamente.', 'error');
  } finally {
    if (btn) { btn.disabled = false; }
    _syncDirtyUi();
  }
}

/* ===== Config Drawer ===== */

function openConfigDrawer() {
  if (!_editSnapshotData) return;
  _buildConfigDrawer();
  document.getElementById('configDrawer').classList.add('open');
  document.getElementById('configDrawer').setAttribute('aria-hidden', 'false');
  document.getElementById('configDrawerBackdrop').style.display = 'block';
  _attachGanttDrawerPreviewBridge();
}

function closeConfigDrawer() {
  var d = document.getElementById('configDrawer');
  if (d) { d.classList.remove('open'); d.setAttribute('aria-hidden', 'true'); }
  var b = document.getElementById('configDrawerBackdrop');
  if (b) b.style.display = 'none';
  _closeBadgeMenus();
  _closeFloatingEditors();
}

function _attachGanttDrawerPreviewBridge() {
  var drawer = document.getElementById('configDrawer');
  if (!drawer || drawer.dataset.ganttPreviewBound) return;
  drawer.dataset.ganttPreviewBound = '1';

  function maybeRefresh(target, rebuildInlineEditor) {
    if (!target || !target.closest || !target.closest('[data-live-preview="gantt"]')) return;
    setTimeout(function () {
      _syncGanttLivePreview({ rebuildInlineEditor: !!rebuildInlineEditor });
    }, 0);
  }

  drawer.addEventListener('input', function (evt) {
    maybeRefresh(evt.target, false);
  });
  drawer.addEventListener('change', function (evt) {
    maybeRefresh(evt.target, false);
  });
  drawer.addEventListener('click', function (evt) {
    maybeRefresh(evt.target, true);
  });
}

function _registry() {
  return (window.DECK_FIELD_REGISTRY && Array.isArray(window.DECK_FIELD_REGISTRY.fields))
    ? window.DECK_FIELD_REGISTRY
    : { sections: {}, fields: [] };
}

function _registrySectionLabel(key, fallback) {
  var sections = (_registry().sections || {});
  return sections[key] || fallback;
}

function _registryFieldsBy(sectionKey, editorMode) {
  return _registry().fields
    .filter(function (f) { return f.section === sectionKey && f.editorMode === editorMode; })
    .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
}

function _hasRegistryFields(sectionKey, editorMode) {
  return _registryFieldsBy(sectionKey, editorMode).length > 0;
}

function _pathGet(obj, path) {
  return String(path || "").split(".").reduce(function (acc, key) {
    return (acc && Object.prototype.hasOwnProperty.call(acc, key)) ? acc[key] : undefined;
  }, obj);
}

function _buildConfigDrawer() {
  var d  = _editSnapshotData;
  var body = document.getElementById('configDrawerBody');
  body.innerHTML = '';
  var cfg    = d.config  || {};
  var rodape = d.rodape  || {};
  if (!d.gantt_config) d.gantt_config = {};
  if (!d.gantt_tarefas) d.gantt_tarefas = [];
  if (!d.gantt_marcos) d.gantt_marcos = [];
  var gcfg = d.gantt_config;

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
  function txtArea(val, cb) {
    var i = document.createElement('textarea'); i.className = 'drawer-input drawer-textarea';
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

  /* ─ Capa (main) ─ */
  if (_hasRegistryFields('cover', 'main')) {
    var s0 = sec(_registrySectionLabel('cover', 'Capa'));
    addF(s0, 'Eyebrow', txt(cfg.cover_eyebrow, function(v){ d.config.cover_eyebrow = v; }));
    addF(s0, 'Título principal', txtArea(v(cfg.cover_main_title, v(cfg.project_name, '')), function(v){ d.config.cover_main_title = _coverTitleToStorage(v); }));
    addF(s0, 'Subtítulo', txtArea(v(cfg.cover_subtitle, v(cfg.project_subtitle, '')), function(v){ d.config.cover_subtitle = v; }));
    addF(s0, 'Label cliente', txt(v(cfg.cover_client_label, _coverMetaDefault('client')), function(v){ d.config.cover_client_label = v.toUpperCase(); }));
    addF(s0, 'Label apresentador', txt(v(cfg.cover_owner_label, _coverMetaDefault('owner')), function(v){ d.config.cover_owner_label = v.toUpperCase(); }));
    addF(s0, 'Label data', txt(v(cfg.cover_date_label, _coverMetaDefault('date')), function(v){ d.config.cover_date_label = v.toUpperCase(); }));
    addF(s0, 'Label duração', txt(v(cfg.cover_duration_label, _coverMetaDefault('duration')), function(v){ d.config.cover_duration_label = v.toUpperCase(); }));
    addF(s0, 'Duração', txt(cfg.presentation_duration, function(v){ d.config.presentation_duration = v; }));
    body.appendChild(s0);
  }

  /* ─ Header (main) ─ */
  if (_hasRegistryFields('header', 'main')) {
    var s1 = sec(_registrySectionLabel('header', 'Projeto'));
    addF(s1, 'Nome do Projeto',    txt(cfg.project_name,     function(v){d.config.project_name=v;}));
    addF(s1, 'Subtítulo',          txt(cfg.project_subtitle, function(v){d.config.project_subtitle=v;}));
    addF(s1, 'Sponsor / Cliente',  txt(cfg.sponsor,          function(v){d.config.sponsor=v;}));
    addF(s1, 'Parceiro',           txt(cfg.partner_name,     function(v){d.config.partner_name=v;}));
    addF(s1, 'Responsável (PM)',   txt(cfg.owner_name,       function(v){
      d.config.owner_name = v;
      if (!d.rodape) d.rodape = {};
      d.rodape.owner_relatorio = v;
    }));
    addF(s1, 'Data do Relatório',  txtDateFriendly(cfg.report_date, function(v){d.config.report_date=v;}));
    addF(s1, 'Nome do Relatório',  txt(cfg.report_name,      function(v){d.config.report_name=v;}));
    body.appendChild(s1);
  }

  /* ─ Timeline (main) ─ */
  if (_hasRegistryFields('timeline', 'main')) {
    var s2 = sec(_registrySectionLabel('timeline', 'Andamento'));
    addF(s2, 'Fase Atual',              txt(cfg.current_phase,    function(v){d.config.current_phase=v;}));
    addF(s2, 'Dia Atual',               num(cfg.current_day,      function(v){d.config.current_day=v;}));
    addF(s2, 'Total de Dias do Projeto',num(cfg.total_days,       function(v){d.config.total_days=v;}));
    addF(s2, '% Planejado (Curva S)',   num(cfg.progress_percent, function(v){d.config.progress_percent=v;}));
    body.appendChild(s2);
  }

  /* ─ Rodapé (main) ─ */
  if (_hasRegistryFields('rodape', 'main')) {
    var s4 = sec(_registrySectionLabel('rodape', 'Rodapé'));
    addF(s4, 'Milestone Alvo',          txt(rodape.milestone_alvo,    function(v){d.rodape.milestone_alvo=v;}));
    addF(s4, 'Data Alvo (dd/mm/aaaa)',  txtDateFriendly(rodape.data_alvo, function(v){d.rodape.data_alvo=v;}));
    addF(s4, 'Go-Live (dd/mm/aaaa)',    txtDateFriendly(rodape.go_live_previsto, function(v){d.rodape.go_live_previsto=v;}));
    body.appendChild(s4);
  }

  /* ─ Contextual: Timeline ─ */
  if (_hasRegistryFields('timeline', 'contextual')) {
    var s5 = sec('Fases do Projeto (Timeline)');
    s5.appendChild(_drawerFases(d));
    body.appendChild(s5);
  }

  /* ─ Contextual: KPI Cards ─ */
  if (_hasRegistryFields('kpi_cards', 'contextual')) {
    var s6 = sec('Indicadores — KPI Cards');
    s6.appendChild(_drawerKpis(d));
    body.appendChild(s6);
  }

  /* ─ Contextual: Curva S ─ */
  if (_hasRegistryFields('curva_s', 'contextual')) {
    var s7 = sec('Curva S — Dados do Gráfico');
    var note = document.createElement('p'); note.className = 'drawer-note';
    note.textContent = 'Informe Dia, % Planejado e % Realizado. Deixe Realizado em branco para pontos futuros.';
    s7.appendChild(note);
    s7.appendChild(_drawerCurvaS(d));
    body.appendChild(s7);
  }

  /* ─ Cronograma Gantt ─ */
  var s7b = sec('Cronograma Gantt');
  s7b.dataset.livePreview = 'gantt';
  addF(s7b, 'Título do Gantt', txt(v(gcfg.titulo, 'Cronograma & Marcos Críticos'), function(v){ d.gantt_config.titulo = v; }));
  addF(s7b, 'Subtítulo do Gantt', txt(v(gcfg.subtitulo, ''), function(v){ d.gantt_config.subtitulo = v; }));
  addF(s7b, 'Início da janela (dd/mm/aaaa)', txtDateFriendly(gcfg.data_inicio_janela, function(v){ d.gantt_config.data_inicio_janela = v; }));
  addF(s7b, 'Fim da janela (dd/mm/aaaa)', txtDateFriendly(gcfg.data_fim_janela, function(v){ d.gantt_config.data_fim_janela = v; }));
  addF(s7b, 'Escala do tempo', sel(v(gcfg.escala_tempo, 'semanas'), [{v:'semanas',l:'Semanas'},{v:'meses',l:'Meses'}], function(v){ d.gantt_config.escala_tempo = v; }));
  addF(s7b, 'Exibir baseline', sel(v(gcfg.exibir_baseline, 'TRUE'), [{v:'TRUE',l:'Sim'},{v:'FALSE',l:'Não'}], function(v){ d.gantt_config.exibir_baseline = v; }));
  addF(s7b, 'Exibir progresso', sel(v(gcfg.exibir_progresso, 'TRUE'), [{v:'TRUE',l:'Sim'},{v:'FALSE',l:'Não'}], function(v){ d.gantt_config.exibir_progresso = v; }));
  addF(s7b, 'Exibir hoje', sel(v(gcfg.exibir_hoje, 'TRUE'), [{v:'TRUE',l:'Sim'},{v:'FALSE',l:'Não'}], function(v){ d.gantt_config.exibir_hoje = v; }));
  addF(s7b, 'Exibir dependências', sel(v(gcfg.exibir_dependencias, 'FALSE'), [{v:'TRUE',l:'Sim'},{v:'FALSE',l:'Não'}], function(v){ d.gantt_config.exibir_dependencias = v; }));
  addF(s7b, 'Altura da linha', num(v(gcfg.altura_linha, 40), function(v){ d.gantt_config.altura_linha = v; }));
  addF(s7b, 'Largura do dia', num(v(gcfg.largura_dia, 18), function(v){ d.gantt_config.largura_dia = v; }));
  body.appendChild(s7b);

  var s7c = sec('Cronograma Gantt — Tarefas');
  s7c.dataset.livePreview = 'gantt';
  s7c.appendChild(_drawerGanttTasks(d));
  body.appendChild(s7c);

  var s7d = sec('Cronograma Gantt — Marcos');
  s7d.dataset.livePreview = 'gantt';
  s7d.appendChild(_drawerGanttMilestones(d));
  body.appendChild(s7d);

  /* ─ Readonly: derivados registrados ─ */
  var readonly = _registry().fields
    .filter(function (f) { return f.editorMode === 'readonly' && f.derived; })
    .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  if (readonly.length) {
    var s8 = sec('Campos automáticos (somente leitura)');
    readonly.forEach(function (f) {
      var val = _pathGet(d, f.path);
      var txtVal;
      if (typeof val === 'object' && val !== null) txtVal = JSON.stringify(val);
      else txtVal = (val === undefined || val === null) ? '' : String(val);
      var inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'drawer-input drawer-locked';
      inp.value = txtVal;
      inp.disabled = true;
      inp.title = 'Campo derivado (somente leitura)';
      addF(s8, f.label, inp);
    });
    body.appendChild(s8);
  }
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

function _drawerGanttTasks(d) {
  if (!d.gantt_tarefas) d.gantt_tarefas = [];
  var STATUS = ['Concluído', 'Em andamento', 'Planejado', 'Atrasado'];
  var wrap = document.createElement('div'); wrap.className = 'drawer-table-wrap';
  var tbl = document.createElement('table'); tbl.className = 'drawer-table';
  tbl.innerHTML = '<thead><tr><th></th><th>Nome</th><th>Início</th><th>Fim</th><th>Progresso</th><th>Status</th><th>Owner</th><th></th></tr></thead>';
  var tbody = document.createElement('tbody'); tbl.appendChild(tbody); wrap.appendChild(tbl);

  function mkRow(task, idx) {
    var tr = document.createElement('tr');
    function cell(el){ var td = document.createElement('td'); td.appendChild(el); return td; }
    function input(value, cb, type, placeholder) {
      var i = document.createElement('input');
      i.type = type || 'text';
      i.className = 'drawer-table-input';
      i.value = value != null ? String(value) : '';
      if (placeholder) i.placeholder = placeholder;
      i.oninput = function () { cb(i.type === 'number' && i.value !== '' ? Number(i.value) : i.value); markDirty(); };
      return i;
    }
    var order = document.createElement('div'); order.className = 'drawer-order-actions';
    var up = document.createElement('button'); up.type='button'; up.className='drawer-order-btn'; up.textContent='↑'; up.disabled = idx === 0;
    up.onclick = function(){ if (_moveArrayItem(d.gantt_tarefas, idx, -1)) { markDirty(); render(); _refreshGanttEditorSurfaces(); } };
    var down = document.createElement('button'); down.type='button'; down.className='drawer-order-btn'; down.textContent='↓'; down.disabled = idx === d.gantt_tarefas.length - 1;
    down.onclick = function(){ if (_moveArrayItem(d.gantt_tarefas, idx, 1)) { markDirty(); render(); _refreshGanttEditorSurfaces(); } };
    order.appendChild(up); order.appendChild(down);
    tr.appendChild(cell(order));
    tr.appendChild(cell(input(task.nome, function(v){ d.gantt_tarefas[idx].nome = v; })));
    tr.appendChild(cell(input(task.inicio, function(v){ d.gantt_tarefas[idx].inicio = v; }, 'text', 'dd/mm/aaaa')));
    tr.appendChild(cell(input(task.fim, function(v){ d.gantt_tarefas[idx].fim = v; }, 'text', 'dd/mm/aaaa')));
    tr.appendChild(cell(input(task.progresso, function(v){ d.gantt_tarefas[idx].progresso = v === '' ? 0 : v; }, 'number')));
    var ss = document.createElement('select'); ss.className = 'drawer-table-select';
    STATUS.forEach(function(o){ var op = document.createElement('option'); op.value = o; op.textContent = o; if ((task.status || '') === o) op.selected = true; ss.appendChild(op); });
    ss.onchange = function(){ d.gantt_tarefas[idx].status = ss.value; markDirty(); };
    tr.appendChild(cell(ss));
    tr.appendChild(cell(input(task.owner, function(v){ d.gantt_tarefas[idx].owner = v; })));
    var rb = document.createElement('button'); rb.type='button'; rb.className='drawer-rm-btn'; rb.innerHTML='×';
    rb.onclick = function(){ d.gantt_tarefas.splice(idx,1); markDirty(); render(); _refreshGanttEditorSurfaces(); };
    tr.appendChild(cell(rb));
    return tr;
  }
  function render() {
    tbody.innerHTML = '';
    d.gantt_tarefas.forEach(function (task, idx) { tbody.appendChild(mkRow(task, idx)); });
  }
  render();
  var add = document.createElement('button'); add.type='button'; add.className='drawer-add-btn'; add.textContent='+ Adicionar tarefa';
  add.onclick = function () {
    d.gantt_tarefas.push({ id: Date.now(), parent_id: null, nome: 'Nova tarefa', inicio: '', fim: '', progresso: 0, status: 'Planejado', owner: '', dependencias: '' });
    markDirty(); render(); _refreshGanttEditorSurfaces();
  };
  var cont = document.createElement('div'); cont.appendChild(wrap); cont.appendChild(add); return cont;
}

function _drawerGanttMilestones(d) {
  if (!d.gantt_marcos) d.gantt_marcos = [];
  var wrap = document.createElement('div'); wrap.className = 'drawer-table-wrap';
  var tbl = document.createElement('table'); tbl.className = 'drawer-table';
  tbl.innerHTML = '<thead><tr><th></th><th>Nome</th><th>Data</th><th>Status</th><th>Tipo</th><th></th></tr></thead>';
  var tbody = document.createElement('tbody'); tbl.appendChild(tbody); wrap.appendChild(tbl);

  function mkRow(marco, idx) {
    var tr = document.createElement('tr');
    function cell(el){ var td = document.createElement('td'); td.appendChild(el); return td; }
    function input(value, cb, placeholder) {
      var i = document.createElement('input');
      i.type = 'text'; i.className = 'drawer-table-input'; i.value = value != null ? String(value) : '';
      if (placeholder) i.placeholder = placeholder;
      i.oninput = function () { cb(i.value); markDirty(); };
      return i;
    }
    var order = document.createElement('div'); order.className = 'drawer-order-actions';
    var up = document.createElement('button'); up.type='button'; up.className='drawer-order-btn'; up.textContent='↑'; up.disabled = idx === 0;
    up.onclick = function(){ if (_moveArrayItem(d.gantt_marcos, idx, -1)) { markDirty(); render(); _refreshGanttEditorSurfaces(); } };
    var down = document.createElement('button'); down.type='button'; down.className='drawer-order-btn'; down.textContent='↓'; down.disabled = idx === d.gantt_marcos.length - 1;
    down.onclick = function(){ if (_moveArrayItem(d.gantt_marcos, idx, 1)) { markDirty(); render(); _refreshGanttEditorSurfaces(); } };
    order.appendChild(up); order.appendChild(down);
    tr.appendChild(cell(order));
    tr.appendChild(cell(input(marco.nome, function(v){ d.gantt_marcos[idx].nome = v; })));
    tr.appendChild(cell(input(marco.data, function(v){ d.gantt_marcos[idx].data = v; }, 'dd/mm/aaaa')));
    tr.appendChild(cell(input(marco.status, function(v){ d.gantt_marcos[idx].status = v; })));
    tr.appendChild(cell(input(marco.tipo, function(v){ d.gantt_marcos[idx].tipo = v; })));
    var rb = document.createElement('button'); rb.type='button'; rb.className='drawer-rm-btn'; rb.innerHTML='×';
    rb.onclick = function(){ d.gantt_marcos.splice(idx,1); markDirty(); render(); _refreshGanttEditorSurfaces(); };
    tr.appendChild(cell(rb));
    return tr;
  }
  function render() {
    tbody.innerHTML = '';
    d.gantt_marcos.forEach(function (marco, idx) { tbody.appendChild(mkRow(marco, idx)); });
  }
  render();
  var add = document.createElement('button'); add.type='button'; add.className='drawer-add-btn'; add.textContent='+ Adicionar marco';
  add.onclick = function () {
    d.gantt_marcos.push({ id: Date.now(), nome: 'Novo marco', data: '', status: 'Planejado', tipo: 'star' });
    markDirty(); render(); _refreshGanttEditorSurfaces();
  };
  var cont = document.createElement('div'); cont.appendChild(wrap); cont.appendChild(add); return cont;
}

/* ===== Init ===== */
document.addEventListener('DOMContentLoaded', function () {
  try {
    _exitEditMode();
    markAppBooting();
    loadData(true);
    connectWebSocket();
    window.addEventListener('beforeunload', function(e) {
      if (!hasUnsavedChanges()) return;
      e.preventDefault();
      e.returnValue = '';
    });
    window.addEventListener('resize', function () {
      refreshDeckViewportLayout();
    });
    /* Re-render Curva S ao entrar/sair do modo impressão para usar dimensões corretas */
    window.addEventListener('beforeprint', function () {
      if (_lastRenderData) renderCurvaS(_lastRenderData.data || {});
      if (_lastRenderData) renderGantt((_lastRenderData.reportData || _lastRenderData.data || {}));
    });
    window.addEventListener('afterprint', function () {
      if (_lastRenderData) renderCurvaS(_lastRenderData.data || {});
      if (_lastRenderData) renderGantt((_lastRenderData.reportData || _lastRenderData.data || {}));
    });
    checkForUpdates(false);
    document.addEventListener('fullscreenchange', function () {
      if (!document.fullscreenElement) {
        _isPresentationMode = false;
        document.body.classList.remove('presentation-mode');
      }
      refreshDeckViewportLayout();
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') {
        closeUpdateModal();
      }
      if (!_isPresentationMode) return;
      if (ev.key === 'ArrowRight' || ev.key === 'PageDown') {
        ev.preventDefault();
        nextSlide();
      } else if (ev.key === 'ArrowLeft' || ev.key === 'PageUp') {
        ev.preventDefault();
        prevSlide();
      } else if (ev.key === 'Home') {
        ev.preventDefault();
        setSlide(1);
      } else if (ev.key === 'End') {
        ev.preventDefault();
        setSlide(totalSlides);
      }
    });
  } catch (err) {
    markAppInitError('bootstrap', err);
  }
});

window.addEventListener('error', function (ev) {
  if (_appState === 'ready' && !_isLoadingData) return;
  markAppInitError('window.error', ev.error || new Error(ev.message || 'Erro JS não tratado'));
});

window.addEventListener('unhandledrejection', function (ev) {
  if (_appState === 'ready' && !_isLoadingData) return;
  var reason = ev.reason instanceof Error ? ev.reason : new Error(String(ev.reason || 'Promise rejeitada sem tratamento'));
  markAppInitError('unhandledrejection', reason);
});
