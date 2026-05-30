function v(x, fb) {
  return (x !== null && x !== undefined && x !== '') ? x : (fb !== undefined ? fb : '');
}

function esc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function hexToRgb(hex) {
  var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || '').trim());
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
}

function applyBranding(branding) {
  var root = document.documentElement;
  var primary = v(branding.cor_primaria, '#2a7249');
  var secondary = v(branding.cor_secundaria, '#1a4f35');
  root.style.setProperty('--green-800', primary);
  root.style.setProperty('--green-900', secondary);
  var rgb = hexToRgb(secondary);
  if (rgb) {
    root.style.setProperty('--green-950', 'rgb(' +
      Math.max(0, Math.round(rgb[0] * 0.72)) + ',' +
      Math.max(0, Math.round(rgb[1] * 0.72)) + ',' +
      Math.max(0, Math.round(rgb[2] * 0.72)) + ')');
  }
}

function listHtml(items, mapFn, emptyText) {
  if (!items || !items.length) return '<li>' + esc(emptyText) + '</li>';
  return items.map(mapFn).join('');
}

function renderPreview(json) {
  var d = (json && json.data) || {};
  var cfg = d.config || {};
  var branding = d.branding || {};
  var root = document.getElementById('slidesRoot');

  applyBranding(branding);

  var faseItems = d.fases || [];
  var marcoItems = d.marcos || [];
  var pendencias = d.pendencias_criticas || [];
  var acoes = d.proximas_acoes || [];
  var rodape = d.rodape || {};

  root.innerHTML =
    '<section class="slide cover">' +
      '<h2>' + esc(v(cfg.report_title, 'STATUS REPORT')) + '</h2>' +
      '<h3>' + esc(v(cfg.project_name, 'Projeto')) + '</h3>' +
      '<p>' + esc(v(cfg.project_subtitle, '')) + '</p>' +
      '<div class="cover-band">' +
        'Cliente: ' + esc(v(cfg.sponsor, '-')) +
        ' | Apresentador: ' + esc(v(cfg.owner_name, '-')) +
        ' | Data: ' + esc(v(cfg.report_date, '-')) +
      '</div>' +
    '</section>' +

    '<section class="slide">' +
      '<h3>Slide 2 · Onepage</h3>' +
      '<iframe class="onepage-frame" src="/" title="Onepage preview"></iframe>' +
    '</section>' +

    '<section class="slide">' +
      '<h2>Cronograma e Marcos</h2>' +
      '<p>Fase atual: ' + esc(v(cfg.current_phase, '-')) + ' | Dia ' + esc(v(cfg.current_day, '-')) + ' de ' + esc(v(cfg.total_days, '-')) + '</p>' +
      '<div class="grid-2" style="margin-top:16px">' +
        '<article class="box"><h3>Fases</h3><ul>' +
          listHtml(faseItems.slice(0, 10), function (f, i) {
            return '<li>' + esc(String(i + 1) + '. ' + v(f.nome, '-') + ' | ' + v(f.status, '-') + ' | ' + v(f.data_alvo, '-')) + '</li>';
          }, 'Nenhuma fase cadastrada') +
        '</ul></article>' +
        '<article class="box"><h3>Marcos</h3><ul>' +
          listHtml(marcoItems.slice(0, 10), function (m, i) {
            return '<li>' + esc(String(i + 1) + '. ' + v(m.nome, '-') + ' | ' + v(m.status, '-') + ' | ' + v(m.data_alvo, '-')) + '</li>';
          }, 'Nenhum marco cadastrado') +
        '</ul></article>' +
      '</div>' +
    '</section>' +

    '<section class="slide">' +
      '<h2>Detalhamento</h2>' +
      '<div class="grid-2" style="margin-top:8px">' +
        '<article class="box"><h3>Pendências Críticas</h3><ul>' +
          listHtml(pendencias.slice(0, 8), function (p) {
            return '<li>' + esc(v(p.prioridade, 'P?') + ' | ' + v(p.item, '-') + ' | ' + v(p.status, '-')) + '</li>';
          }, 'Nenhuma pendência crítica') +
        '</ul></article>' +
        '<article class="box"><h3>Próximas Ações</h3><ul>' +
          listHtml(acoes.slice(0, 10), function (a, i) {
            return '<li>' + esc(String(i + 1) + '. ' + v(a.texto, '-')) + '</li>';
          }, 'Nenhuma ação cadastrada') +
        '</ul></article>' +
      '</div>' +
    '</section>' +

    '<section class="slide closing">' +
      '<h2>' + esc(v(cfg.report_title, 'STATUS REPORT')) + '</h2>' +
      '<h3 style="color:#ffffff">Obrigado.</h3>' +
      '<p>Próximo marco: ' + esc(v(rodape.milestone_alvo, v(cfg.current_phase, '-'))) + '</p>' +
      '<p>Data alvo: ' + esc(v(rodape.data_alvo, '-')) + ' | Go-Live: ' + esc(v(rodape.go_live_previsto, '-')) + '</p>' +
    '</section>';
}

async function loadPreview() {
  try {
    var r = await fetch('/api/status');
    var j = await r.json();
    renderPreview(j);
  } catch (e) {
    document.getElementById('slidesRoot').innerHTML =
      '<section class="slide"><h2>Erro ao carregar preview</h2><p>' + esc(e.message) + '</p></section>';
  }
}

document.addEventListener('DOMContentLoaded', loadPreview);
