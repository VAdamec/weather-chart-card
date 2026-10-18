import { LitElement, html, css } from 'lit';
import locale from './locale.js';

const MAIN_SWITCHES = [
  ['show_main', 'Show main section', true],
  ['show_temperature', 'Show temperature', true],
  ['show_current_condition', 'Show current condition', true],
  ['show_attributes', 'Show attributes', true],
  ['show_humidity', 'Show humidity', true],
  ['show_pressure', 'Show pressure', true],
  ['show_sun', 'Show sun', true],
  ['show_wind_direction', 'Show wind direction', true],
  ['show_wind_speed', 'Show wind speed', true],
  ['show_feels_like', 'Show feels like temperature', false],
  ['show_description', 'Show description', false],
  ['show_dew_point', 'Show dew point', false],
  ['show_wind_gust_speed', 'Show wind gust speed', false],
  ['show_visibility', 'Show visibility', false],
  ['show_last_changed', 'Show when last data changed', false],
  ['use_12hour_format', 'Use 12-hour format', false],
  ['autoscroll', 'Autoscroll', false],
  ['show_time', 'Show current time', false],
];
const ALTERNATE_SENSORS = [
  ['temp', 'Temperature'], ['feels_like', 'Feels like temperature'],
  ['description', 'Description'], ['press', 'Pressure'], ['humid', 'Humidity'],
  ['uv', 'UV index'], ['winddir', 'Wind bearing'], ['windspeed', 'Wind speed'],
  ['dew_point', 'Dew point'], ['wind_gust_speed', 'Wind gust speed'], ['visibility', 'Visibility'],
];

class WeatherChartCardEditor extends LitElement {
  static properties = {
    hass: { attribute: false },
    _config: { state: true },
    currentPage: { state: true },
  };

  static styles = css`
    :host { display: block; color: var(--primary-text-color); font-family: inherit; }
    .fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
    label.field { display: flex; flex-direction: column; gap: 6px; margin: 8px 0; font-size: 14px; }
    input:not([type=checkbox]), select {
      box-sizing: border-box; width: 100%; min-height: 42px; padding: 8px;
      font: inherit; color: var(--primary-text-color, #222);
      background: var(--ha-color-form-background, var(--card-background-color, #fff));
      border: 1px solid var(--divider-color, #888); border-radius: 6px;
    }
    input[type=checkbox] { width: 20px; height: 20px; accent-color: var(--primary-color); }
    .toggle { display: flex; gap: 12px; align-items: center; min-height: 42px; }
    nav { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0; }
    button {
      font: inherit; padding: 10px 12px; border: 1px solid var(--divider-color, #888);
      border-radius: 6px; background: var(--card-background-color, #fff);
      color: var(--primary-text-color, #222); cursor: pointer;
    }
    button[aria-pressed=true] { color: var(--text-primary-color, #fff); background: var(--primary-color, #03a9f4); }
    :focus-visible { outline: 2px solid var(--primary-color, #03a9f4); outline-offset: 2px; }
    p { color: var(--secondary-text-color); }
  `;

  constructor() {
    super();
    this.currentPage = 'card';
  }

  setConfig(config) {
    if (!config || typeof config !== 'object') throw new Error('Invalid configuration');
    this._config = config;
  }

  value(key, fallback = '') {
    const value = key.split('.').reduce((object, part) => object?.[part], this._config);
    return value ?? fallback;
  }

  change(event, key) {
    const input = event.currentTarget;
    if (!input.checkValidity()) { input.reportValidity(); return; }
    let value = input.type === 'checkbox' ? input.checked : input.value;
    if (input.type === 'number' && value !== '') value = Number(value);
    const config = { ...this._config };
    const [parent, child] = key.split('.');
    const target = child ? (config[parent] = { ...config[parent] }) : config;
    if (value === '') delete target[child || parent];
    else target[child || parent] = value;
    this._config = config;
    this.dispatchEvent(new CustomEvent('config-changed', {
      detail: { config }, bubbles: true, composed: true,
    }));
  }

  field(key, label, fallback = '', type = 'text', min = 0, max = undefined) {
    return html`<label class="field">${label}
      <input name=${key} aria-label=${label} type=${type} .value=${String(this.value(key, fallback))}
        min=${min} max=${max ?? ''} step=${type === 'number' ? '1' : 'any'}
        @change=${event => this.change(event, key)}>
    </label>`;
  }

  select(key, label, options, fallback = '') {
    const selected = String(this.value(key, fallback));
    return html`<label class="field">${label}
      <select name=${key} aria-label=${label} @change=${event => this.change(event, key)}>
        ${options.map(option => {
          const [value, text] = Array.isArray(option) ? option : [option, option];
          return html`<option value=${value} .selected=${String(value) === selected}>${text}</option>`;
        })}
      </select>
    </label>`;
  }

  toggle(key, label, fallback = false) {
    return html`<label class="toggle">
      <input name=${key} aria-label=${label} type="checkbox" .checked=${Boolean(this.value(key, fallback))}
        @change=${event => this.change(event, key)}>${label}
    </label>`;
  }

  renderMain() {
    return html`
      ${MAIN_SWITCHES.map(([key, label, fallback]) => this.toggle(key, label, fallback))}
      ${this.value('show_time', false) ? html`
        ${this.toggle('show_time_seconds', 'Show seconds')}
        ${this.toggle('show_day', 'Show day')}
        ${this.toggle('show_date', 'Show date')}
        <div class="fields">
          ${this.field('time_size', 'Time text size', 26, 'number', 1)}
          ${this.field('day_date_size', 'Day and date text size', 15, 'number', 1)}
        </div>` : ''}
      ${this.toggle('animated_icons', 'Use animated icons')}
      ${this.value('animated_icons', false) ? this.select('icon_style', 'Icon style',
        [['style1', 'Style 1'], ['style2', 'Style 2']], 'style1') : ''}
      <div class="fields">
        ${this.field('icons_size', 'Icon size', 25, 'number', 1)}
        ${this.field('current_temp_size', 'Current temperature font size', 28, 'number', 1)}
        ${this.field('icons', 'Custom icon path')}
        ${this.select('locale', 'Language', [['', 'HA default'], ...Object.keys(locale).map(code => [code, code])])}
      </div>`;
  }

  renderForecast() {
    return html`
      ${this.toggle('forecast.condition_icons', 'Show condition icons', true)}
      ${this.toggle('forecast.show_wind_forecast', 'Show wind forecast', true)}
      ${this.toggle('forecast.round_temp', 'Round temperatures')}
      ${this.toggle('forecast.disable_animation', 'Disable chart animation')}
      ${this.select('forecast.precipitation_type', 'Precipitation type',
        [['rainfall', 'Rainfall'], ['probability', 'Probability']], 'rainfall')}
      ${this.value('forecast.precipitation_type', 'rainfall') === 'rainfall'
        ? this.toggle('forecast.show_probability', 'Show precipitation probability') : ''}
      <div class="fields">
        ${this.field('forecast.precip_bar_size', 'Precipitation bar size (%)', 100, 'number', 0, 100)}
        ${this.field('forecast.labels_font_size', 'Labels font size', 11, 'number', 1)}
        ${this.field('forecast.chart_height', 'Chart height', 180, 'number', 1)}
        ${this.field('forecast.number_of_forecasts', 'Number of forecasts (0 = automatic)', 0, 'number')}
      </div>`;
  }

  renderAlternate() {
    const sensors = Object.keys(this.hass?.states || {}).filter(id => id.startsWith('sensor.')).sort();
    return html`
      <p>Leave a field empty to use the weather entity. Enter a sensor entity ID or select a suggestion.</p>
      <datalist id="sensors">${sensors.map(id => html`<option value=${id}></option>`)}</datalist>
      <div class="fields">${ALTERNATE_SENSORS.map(([key, label]) => html`
        <label class="field">${label}
          <input name=${key} aria-label=${label} list="sensors" .value=${this.value(key)}
            @change=${event => this.change(event, key)}>
        </label>`)}</div>`;
  }

  render() {
    if (!this._config) return html``;
    const entities = Object.keys(this.hass?.states || {}).filter(id => id.startsWith('weather.')).sort();
    const selected = this.value('entity');
    if (selected && !entities.includes(selected)) entities.unshift(selected);
    const pages = [['card', 'Main'], ['forecast', 'Forecast'], ['units', 'Units'], ['alternate', 'Alternate entities']];
    return html`
      <div class="fields">
        ${this.select('entity', 'Weather entity', [['', 'Select a weather entity'], ...entities])}
        ${this.field('title', 'Title')}
        ${this.select('forecast.type', 'Forecast type', [['daily', 'Daily'], ['hourly', 'Hourly']], 'daily')}
        ${this.select('forecast.style', 'Chart style', [['style1', 'Style 1'], ['style2', 'Style 2']], 'style1')}
      </div>
      <nav aria-label="Settings pages">${pages.map(([page, label]) => html`
        <button type="button" aria-pressed=${this.currentPage === page}
          @click=${() => { this.currentPage = page; }}>${label}</button>`)}</nav>
      ${this.currentPage === 'card' ? this.renderMain() : ''}
      ${this.currentPage === 'forecast' ? this.renderForecast() : ''}
      ${this.currentPage === 'units' ? html`<div class="fields">
        ${this.select('units.pressure', 'Pressure unit', ['hPa', 'mmHg', 'inHg'], 'hPa')}
        ${this.select('units.speed', 'Wind speed unit', [['', 'Weather entity default'], 'km/h', 'm/s', 'Bft', 'mph'])}
      </div>` : ''}
      ${this.currentPage === 'alternate' ? this.renderAlternate() : ''}
    `;
  }
}

customElements.define('weather-chart-card-editor', WeatherChartCardEditor);
