/* Chart specifications and data paths are relative to the webpage. */
const chartFiles = [
  'chart1_insolvency_trend.vg.json', 'chart2_entry_exit_rates.vg.json',
  'chart3_industry_heatmap.vg.json', 'chart4_industry_bump.vg.json',
  'chart5_industry_waterfall.vg.json', 'chart6_industry_entry_exit_connected_dot.vg.json',
  'chart7_state_symbols.vg.json', 'chart8_state_ranking.vg.json'
];

// Store active Vega views and track rendering requests for each chart.
const chartViews = new Map();
const generations = new Map();


// Adjust chart specifications for smaller screens without changing the source JSON files.
function fitChartToScreen(spec, number, el) {

    const narrow = el.clientWidth < 520;

    if (narrow) {

      // Recursively reduce existing axis-label limits for narrow containers.
      function adapt(value) {
        if (!value || typeof value !== 'object') return;
        if (value.axis && value.axis.labelLimit) value.axis.labelLimit = 115;
        Object.values(value).forEach(adapt);
      }

      adapt(spec);

      // Reduce the geographic map's height on smaller screens.
      if (number === 7) spec.height = 300;

      // Keep the waterfall scale readable within a narrow container.
      if (number === 5) {
        spec.layer[1].encoding.x.scale.domain = [0, 20000];
        spec.layer[1].encoding.x.title = 'Companies';
      }

      if (number === 8) spec.layer.forEach(layer => layer.encoding.x.scale.domain = [0, 8000]);

      // Simplify the bump chart by removing text layers and rotating year labels.
      if (number === 4) {
        spec.padding = 8;
        spec.layer = spec.layer.filter(layer => layer.mark.type !== 'text');
        spec.height = 370;
        spec.layer.forEach(layer => { if (layer.encoding.x) layer.encoding.x.axis = {labelAngle:-45}; });
      }

      // Adjust the heatmap labels and colour legend to fit the available width.
      if (number === 3) {
        spec.layer[0].encoding.x.axis.labelAngle = -45;
        spec.layer[0].encoding.color.legend.gradientLength = Math.max(100, el.clientWidth - 145);

        if (el.clientWidth < 290) {
          spec.layer[1].mark.fontSize = 9;
          spec.layer[1].encoding.text.format = '.0f';
        }
      }

      // Reposition the connected-dot chart's labels and legends.
      if (number === 6) {
        spec.layer[2].mark.align = 'right';
        spec.layer[1].encoding.color.legend = {orient:'top',direction:'vertical',columns:1,title:null};
        spec.layer[1].encoding.shape.legend = {orient:'top',direction:'vertical',columns:1,title:null};
      }
    }

  return spec;
}


// Fetch, prepare and embed an individual Vega-Lite chart.
async function renderChart(number, file) {

  // Match the chart number to its corresponding HTML container.
  const el = document.getElementById(`chart${number}`);

  // Track requests so outdated loads can be identified when charts are refreshed.
  const generation = (generations.get(number) || 0) + 1;
  generations.set(number, generation);

  el.setAttribute('aria-busy', 'true');

  try {

    // Load the chart specification and parse the JSON response.
    const response = await fetch(`charts/${file}`, {cache: 'no-cache'});
    if (!response.ok) throw new Error(`Chart ${number}: ${response.status}`);

    const spec = await response.json();

    // Ignore a response if a newer rendering request has already started.
    if (generation !== generations.get(number)) return;

    fitChartToScreen(spec, number, el);

    // Release the previous Vega view before replacing the visualisation.
    chartViews.get(number)?.finalize();

    // Render using SVG and hide Vega Embed's default action menu.
    const result = await vegaEmbed(el, spec, {actions:false, renderer:'svg'});

    if (generation !== generations.get(number)) { result.view.finalize(); return; }

    // Retain the view for later interaction and signal updates.
    chartViews.set(number, result.view);
    el.dataset.status = 'ready';

  } catch (error) {

    // Show a fallback message if loading or rendering fails.
    console.error(error);
    el.textContent = 'This chart could not load. Please reload the page.';
    el.dataset.status = 'error';

  } finally {

    // Clear the loading state only for the latest request.
    if (generation === generations.get(number)) el.setAttribute('aria-busy', 'false');

  }
}


// Initialise all eight charts using their array positions.
chartFiles.forEach((file, index) => renderChart(index + 1, file));


// Switch Chart 1 between annual and monthly specifications.
document.getElementById('trend-view').addEventListener('change', event => {

  const monthly = event.target.value === 'monthly';

  renderChart(1, monthly ? 'chart1_monthly.vg.json' : chartFiles[0]);

  // Update the accompanying text to reflect the selected time resolution.
  document.getElementById('trend-context').textContent = monthly
    ? 'Monthly counts, July 2019–August 2026. July–August 2026 are provisional; September is excluded because the release covers only part of that month. Not seasonally adjusted.'
    : 'Five complete financial years. Select monthly detail to inspect shorter fluctuations.';

});


// Debounce window resizing to avoid repeatedly rendering charts while resizing.
let resizeTimer;
let previousWidth = window.innerWidth;

window.addEventListener('resize', () => {

  // Only re-render when the viewport width changes.
  if (window.innerWidth === previousWidth) return;
  previousWidth = window.innerWidth;

  clearTimeout(resizeTimer);

  resizeTimer = setTimeout(() => {

    // Preserve interactive selections before recreating the Vega views.
    const preserved = {};

    for (const [id, name] of [[3,'industryCoverage'], [4,'focusIndustry']]) {
      try { preserved[id] = chartViews.get(id)?.signal(name); } catch (_) {}
    }

    chartFiles.forEach(async (file, index) => {

      const id = index + 1;

      // Preserve Chart 1's annual/monthly selection during resizing.
      await renderChart(id, id === 1 && document.getElementById('trend-view').value === 'monthly' ? 'chart1_monthly.vg.json' : file);

      // Restore the heatmap dropdown and bump-chart industry selection.
      const name = id === 3 ? 'industryCoverage' : id === 4 ? 'focusIndustry' : null;

      if (name && preserved[id] !== undefined) await chartViews.get(id)?.signal(name, preserved[id]).runAsync();

    });

  }, 180);
});
