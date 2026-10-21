/* Specs and data are relative to this page, so previews use their own data. */
const chartFiles = [
  'chart1_insolvency_trend.vg.json', 'chart2_entry_exit_rates.vg.json',
  'chart3_industry_heatmap.vg.json', 'chart4_industry_bump.vg.json',
  'chart5_industry_waterfall.vg.json', 'chart6_industry_entry_exit_connected_dot.vg.json',
  'chart7_state_symbols.vg.json', 'chart8_state_ranking.vg.json',
  'chart9_monthly_distribution.vg.json', 'chart10_recent_change_treemap.vg.json',
  'chart11_state_change_map.vg.json', 'chart12_business_cartogram.vg.json'
];
const chartViews = new Map();
const generations = new Map();
// Keep screen-size adjustments separate from the workshop-style embedding code.
function fitChartToScreen(spec, number, el) {
// Reflow the plot, rather than shrinking labels along with a fixed-size canvas.
    const narrow = el.clientWidth < 520;
    if (narrow) {
      function adapt(value) {
        if (!value || typeof value !== 'object') return;
        if (value.axis && value.axis.labelLimit) value.axis.labelLimit = 115;
        Object.values(value).forEach(adapt);
      }
      adapt(spec);
      if (number === 7) spec.height = 300;
      if (number === 5) {
        spec.layer[1].encoding.x.scale.domain = [0, 20000];
        spec.layer[1].encoding.x.title = 'Companies';
      }
      if (number === 8) spec.layer.forEach(layer => layer.encoding.x.scale.domain = [0, 8000]);
      if (number === 4) {
        spec.padding = 8;
        spec.layer = spec.layer.filter(layer => layer.mark.type !== 'text');
        spec.height = 370;
        spec.layer.forEach(layer => { if (layer.encoding.x) layer.encoding.x.axis = {labelAngle:-45}; });
      }
      if (number === 3) {
        spec.layer[0].encoding.x.axis.labelAngle = -45;
        spec.layer[0].encoding.color.legend.gradientLength = Math.max(100, el.clientWidth - 145);
        if (el.clientWidth < 290) {
          spec.layer[1].mark.fontSize = 9;
          spec.layer[1].encoding.text.format = '.0f';
        }
      }
      if (number === 6) {
        spec.layer[2].mark.align = 'right';
        spec.layer[1].encoding.color.legend = {orient:'top',direction:'vertical',columns:1,title:null};
        spec.layer[1].encoding.shape.legend = {orient:'top',direction:'vertical',columns:1,title:null};
      }
    }
  return spec;
}

async function renderChart(number, file) {
  const el = document.getElementById(`chart${number}`);
  const generation = (generations.get(number) || 0) + 1;
  generations.set(number, generation);
  el.setAttribute('aria-busy', 'true');
  try {
    const response = await fetch(`charts/${file}`, {cache: 'no-cache'});
    if (!response.ok) throw new Error(`Chart ${number}: ${response.status}`);
    const spec = await response.json();
    if (generation !== generations.get(number)) return;
    fitChartToScreen(spec, number, el);
    // Vega layouts use explicit dimensions; keep labels at readable sizes on small screens.
    if (number === 10 || number === 12) {
      spec.width = Math.max(220, el.clientWidth - 32);
      spec.height = number === 12 ? Math.min(490, spec.width * 0.9) : (spec.width < 520 ? 440 : 360);
    }
    if (number === 9 && el.clientWidth < 520) spec.encoding.x.axis.labelAngle = -45;
    if (number === 11 && el.clientWidth < 520) {
      spec.height = 320;
      spec.layer[1].encoding.size.scale.range = [0, 850];
      spec.layer[2].mark.dy = -17;
    }
    chartViews.get(number)?.finalize();
    const result = await vegaEmbed(el, spec, {actions:false, renderer:'svg'});
    if (generation !== generations.get(number)) { result.view.finalize(); return; }
    chartViews.set(number, result.view);
    el.dataset.status = 'ready';
  } catch (error) {
    console.error(error);
    el.textContent = 'This chart could not load. Please reload the page.';
    el.dataset.status = 'error';
  } finally {
    if (generation === generations.get(number)) el.setAttribute('aria-busy', 'false');
  }
}
chartFiles.forEach((file, index) => renderChart(index + 1, file));
document.getElementById('trend-view').addEventListener('change', event => {
  const monthly = event.target.value === 'monthly';
  renderChart(1, monthly ? 'chart1_monthly.vg.json' : chartFiles[0]);
  document.getElementById('trend-context').textContent = monthly
    ? 'Monthly counts, July 2019–August 2026. July–August 2026 are provisional; September is excluded because the release covers only part of that month. Not seasonally adjusted.'
    : 'Five complete financial years. Select monthly detail to inspect shorter fluctuations.';
});
let resizeTimer;
let previousWidth = window.innerWidth;
window.addEventListener('resize', () => {
  if (window.innerWidth === previousWidth) return;
  previousWidth = window.innerWidth;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const preserved = {};
    for (const [id, name] of [[3,'industryCoverage'], [4,'focusIndustry']]) {
      try { preserved[id] = chartViews.get(id)?.signal(name); } catch (_) {}
    }
    chartFiles.forEach(async (file, index) => {
      const id = index + 1;
      await renderChart(id, id === 1 && document.getElementById('trend-view').value === 'monthly' ? 'chart1_monthly.vg.json' : file);
      const name = id === 3 ? 'industryCoverage' : id === 4 ? 'focusIndustry' : null;
      if (name && preserved[id] !== undefined) await chartViews.get(id)?.signal(name, preserved[id]).runAsync();
    });
  }, 180);
});
