import animatedIcons from 'virtual:weather-icons';
import locale from './locale.js';
import {
  cardinalDirectionsIcon,
  weatherIcons,
  weatherIconsDay,
  weatherIconsNight,
  WeatherEntityFeature
} from './const.js';
import {LitElement, html} from 'lit';
import './weather-chart-card-editor.js';
import {Chart, registerables} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
Chart.register(...registerables, ChartDataLabels);

class WeatherChartCard extends LitElement {

static getConfigElement() {
  return document.createElement("weather-chart-card-editor");
}

static getStubConfig(hass, unusedEntities, allEntities) {
  let entity = (unusedEntities || []).find((eid) => eid.split(".")[0] === "weather");
  if (!entity) {
    entity = (allEntities || Object.keys(hass.states)).find((eid) => eid.split(".")[0] === "weather");
  }
  return {
    entity,
    show_main: true,
    show_temperature: true,
    show_current_condition: true,
    show_attributes: true,
    show_time: false,
    show_time_seconds: false,
    show_day: false,
    show_date: false,
    show_humidity: true,
    show_pressure: true,
    show_wind_direction: true,
    show_wind_speed: true,
    show_sun: true,
    show_feels_like: false,
    show_dew_point: false,
    show_wind_gust_speed: false,
    show_visibility: false,
    show_last_changed: false,
    use_12hour_format: false,
    icons_size: 25,
    animated_icons: false,
    icon_style: 'style1',
    autoscroll: false,
    forecast: {
      precipitation_type: 'rainfall',
      show_probability: false,
      labels_font_size: '11',
      precip_bar_size: '100',
      style: 'style1',
      show_wind_forecast: true,
      condition_icons: true,
      round_temp: false,
      type: 'daily',
      number_of_forecasts: '0',
      disable_animation: false,
    },
  };
}

  static get properties() {
    return {
      _hass: {},
      config: {},
      language: {},
      sun: {type: Object},
      weather: {type: Object},
      temperature: {type: Object},
      humidity: {type: Object},
      pressure: {type: Object},
      windSpeed: {type: Object},
      windDirection: {type: Number},
      forecastItems: {type: Number},
      forecasts: { type: Array },
      forecastError: { type: String }
    };
  }

setConfig(config) {
  if (!config || typeof config.entity !== 'string' || !config.entity.startsWith('weather.')) {
    throw new Error('Please, define a weather entity in the card config');
  }
  if (config.forecast?.type && !['daily', 'hourly'].includes(config.forecast.type)) {
    throw new Error('Forecast type must be daily or hourly');
  }
  const cardConfig = {
    icons_size: 25,
    animated_icons: false,
    icon_style: 'style1',
    current_temp_size: 28,
    time_size: 26,
    day_date_size: 15,
    show_feels_like: false,
    show_dew_point: false,
    show_wind_gust_speed: false,
    show_visibility: false,
    show_last_changed: false,
    show_description: false,
    ...config,
    forecast: {
      precipitation_type: 'rainfall',
      show_probability: false,
      labels_font_size: 11,
      chart_height: 180,
      precip_bar_size: 100,
      style: 'style1',
      temperature1_color: 'rgba(255, 152, 0, 1.0)',
      temperature2_color: 'rgba(68, 115, 158, 1.0)',
      precipitation_color: 'rgba(132, 209, 253, 1.0)',
      condition_icons: true,
      show_wind_forecast: true,
      round_temp: false,
      type: 'daily',
      number_of_forecasts: '0',
      '12hourformat': false,
      ...config.forecast,
    },
    units: {
      pressure: 'hPa',
      ...config.units,
    }
  };

  cardConfig.units.speed = config.speed ? config.speed : cardConfig.units.speed;

  this.config = cardConfig;
  if (this._hass) this.hass = this._hass;
}

set hass(hass) {
  this._hass = hass;
  if (!this.config) return;
  this.language = this.config.locale || hass.locale?.language || hass.selectedLanguage || hass.language || 'en';
  this.sun = hass.states['sun.sun'] || null;
  this.weather = hass.states[this.config.entity] || null;
  const attributes = this.weather?.attributes || {};
  this.unitSpeed = this.config.units.speed || attributes.wind_speed_unit;
  this.unitPressure = this.config.units.pressure || attributes.pressure_unit;
  this.unitVisibility = this.config.units.visibility || attributes.visibility_unit;
  const value = (option, attribute, numeric = true) => {
    const sensor = this.config[option] ? hass.states[this.config[option]] : null;
    const raw = this.config[option] ? sensor?.state : attributes[attribute];
    if (raw == null || raw === '' || raw === 'unknown' || raw === 'unavailable') return undefined;
    return numeric ? (Number.isFinite(Number(raw)) ? Number(raw) : undefined) : raw;
  };
  this.temperature = value('temp', 'temperature');
  this.humidity = value('humid', 'humidity');
  this.pressure = value('press', 'pressure');
  this.uv_index = value('uv', 'uv_index');
  this.windSpeed = value('windspeed', 'wind_speed');
  const windDirection = value('winddir', 'wind_bearing', false);
  this.windDirection = windDirection == null || Number.isNaN(Number(windDirection))
    ? windDirection : Number(windDirection);
  this.feels_like = value('feels_like', 'apparent_temperature');
  this.dew_point = value('dew_point', 'dew_point');
  this.wind_gust_speed = value('wind_gust_speed', 'wind_gust_speed');
  this.visibility = value('visibility', 'visibility');
  this.description = value('description', 'description', false);
  this.subscribeForecastEvents();
}

get weatherAvailable() {
  return this.weather?.attributes && !['unavailable', 'unknown'].includes(this.weather.state);
}

subscribeForecastEvents() {
  const connection = this._hass?.connection;
  if (!this.isConnected || !connection || !this.config || !this.weatherAvailable) {
    this.unsubscribeForecastEvents();
    return;
  }
  const entity = this.config.entity;
  const type = this.config.forecast.type;
  const previous = this._forecastRequest;
  const feature = type === 'hourly' ? WeatherEntityFeature.FORECAST_HOURLY : WeatherEntityFeature.FORECAST_DAILY;
  if (!this.supportsFeature(feature)) {
    this.unsubscribeForecastEvents();
    this.forecastError = `This weather entity does not support ${type} forecasts.`;
    return;
  }
  if (previous?.connection === connection && previous.entity === entity && previous.type === type) return;
  this.unsubscribeForecastEvents();
  this.forecastError = '';
  const request = { connection, entity, type, unsubscribe: null };
  this._forecastRequest = request;
  // subscribeMessage can resolve after the card has disconnected or changed config.
  Promise.resolve().then(() => {
    if (this._forecastRequest !== request) return;
    return connection.subscribeMessage(event => {
      if (this._forecastRequest !== request || !this.isConnected) return;
      this.forecasts = Array.isArray(event?.forecast) ? event.forecast.filter(item =>
        item && Number.isFinite(Date.parse(item.datetime))) : [];
      this.forecastError = '';
    }, { type: 'weather/subscribe_forecast', forecast_type: type, entity_id: entity });
  }).then(unsubscribe => {
    if (this._forecastRequest === request) request.unsubscribe = unsubscribe;
    else if (typeof unsubscribe === 'function') unsubscribe();
  }).catch(() => {
    if (this._forecastRequest !== request) return;
    this._forecastRequest = null;
    this.forecastError = 'Forecast unavailable. Waiting for the next update to retry.';
    this.forecasts = [];
  });
}

unsubscribeForecastEvents() {
  const request = this._forecastRequest;
  this._forecastRequest = null;
  if (request?.unsubscribe) request.unsubscribe();
  if (this.forecasts?.length) this.forecasts = [];
}

supportsFeature(feature) {
  return ((this.weather?.attributes?.supported_features || 0) & feature) !== 0;
}

constructor() {
  super();
  this.forecasts = [];
  this.forecastError = '';
  this.forecastItems = 1;
}

connectedCallback() {
  super.connectedCallback();
  this.updateComplete.then(() => {
    if (!this.isConnected) return;
    this.attachResizeObserver();
    this.measureCard();
    this.subscribeForecastEvents();
    this.syncClock();
    if (this.config?.autoscroll) this.autoscroll();
    this.drawChart();
  });
}

disconnectedCallback() {
  super.disconnectedCallback();
  this.detachResizeObserver();
  this.unsubscribeForecastEvents();
  this.cancelAutoscroll();
  clearInterval(this._clockTimer);
  this._clockTimer = null;
  this.destroyChart();
}

attachResizeObserver() {
  const card = this.shadowRoot?.querySelector('ha-card');
  if (!card || card === this._observedCard) return;
  this.detachResizeObserver();
  this._observedCard = card;
  this.resizeObserver = new ResizeObserver(() => this.measureCard());
  this.resizeObserver.observe(card);
}

detachResizeObserver() {
  this.resizeObserver?.disconnect();
  this.resizeObserver = null;
  this._observedCard = null;
}

syncClock() {
  clearInterval(this._clockTimer);
  this._clockTimer = null;
  if (this.isConnected && this.config?.show_time && this.config.show_main !== false) {
    this._clockTimer = setInterval(() => this.updateClock(), 1000);
    this.updateClock();
  }
}

updateClock() {
  const now = new Date();
  const time = this.shadowRoot?.querySelector('#digital-clock');
  if (time) time.textContent = now.toLocaleTimeString(this.language, {
    hour12: this.config.use_12hour_format, hour: 'numeric', minute: 'numeric',
    ...(this.config.show_time_seconds ? { second: 'numeric' } : {})
  });
  const day = this.shadowRoot?.querySelector('.date-text.day');
  if (day) day.textContent = now.toLocaleDateString(this.language, { weekday: 'long' }).toUpperCase();
  const date = this.shadowRoot?.querySelector('.date-text.date');
  if (date) date.textContent = now.toLocaleDateString(this.language, { month: 'long', day: 'numeric' });
}

updated(changed) {
  if (!this.isConnected) return;
  this.attachResizeObserver();
  this.measureCard();
  this.updateClock();
  if (changed.has('config')) {
    this.syncClock();
    this.cancelAutoscroll();
    if (this.config?.autoscroll) this.autoscroll();
    this.subscribeForecastEvents();
  }
  const themeChanged = changed.has('_hass') && changed.get('_hass')?.themes !== this._hass?.themes;
  if (themeChanged || ['config', 'weather', 'forecasts', 'forecastItems', 'language'].some(key => changed.has(key))) {
    this.drawChart();
  }
}

destroyChart() {
  this.forecastChart?.destroy();
  this.forecastChart = null;
}


measureCard() {
  const card = this.shadowRoot.querySelector('ha-card');
  if (!this.config) return;
  const fontSize = Math.max(1, Number(this.config.forecast.labels_font_size) || 11);
  const numberOfForecasts = Number(this.config.forecast.number_of_forecasts) || 0;

  if (!card) {
    return;
  }

  this.forecastItems = Math.max(1, numberOfForecasts > 0 ? Math.floor(numberOfForecasts) : Math.round(card.offsetWidth / (fontSize * 6)));
}

ll(str) {
  const selectedLocale = this.config.locale || this.language || 'en';

  if (locale[selectedLocale] === undefined) {
    return locale.en[str] ?? str;
  }

  return locale[selectedLocale][str] ?? locale.en[str] ?? str;
}

  getCardSize() {
    return 4;
  }

  getUnit(unit) {
    return this._hass?.config?.unit_system?.[unit] || '';
  }

  getWeatherIcon(condition, sun) {
    if (this.config.animated_icons === true) {
      const iconName = sun === 'below_horizon' ? weatherIconsNight[condition] : weatherIconsDay[condition];
      return animatedIcons[this.config.icon_style === 'style2' ? 'style2' : 'style1'][iconName || 'exceptional'];
    } else if (this.config.icons) {
      const iconName = sun === 'below_horizon' ? weatherIconsNight[condition] : weatherIconsDay[condition];
      return `${this.config.icons.replace(/\/?$/, '/')}${iconName || 'exceptional'}.svg`;
    }
    return weatherIcons[condition] || weatherIcons.exceptional;
  }

getWindDirIcon(deg) {
  if (typeof deg === 'number') {
    return cardinalDirectionsIcon[Math.floor((((deg % 360) + 360) % 360 + 22.5) / 45) % 8];
  } else {
    var i;
    switch (deg) {
      case "N":
        i = 0;
        break;
      case "NNE":
      case "NE":
        i = 1;
        break;
      case "ENE":
      case "E":
        i = 2;
        break;
      case "ESE":
      case "SE":
        i = 3;
        break;
      case "SSE":
      case "S":
        i = 4;
        break;
      case "SSW":
      case "SW":
        i = 5;
        break;
      case "WSW":
      case "W":
        i = 6;
        break;
      case "NW":
      case "NNW":
        i = 7;
        break;
      case "WNW":
        i = 8;
        break;
      default:
        i = 9;
        break;
    }
    return cardinalDirectionsIcon[i];
  }
}

getWindDir(deg) {
  if (typeof deg === 'number') {
    return this.ll('cardinalDirections')[Math.floor((((deg % 360) + 360) % 360 + 11.25) / 22.5) % 16];
  } else {
    return deg;
  }
}

calculateBeaufortScale(windSpeed) {
  const unitConversion = {
    'km/h': 1,
    'm/s': 3.6,
    'mph': 1.60934,
  };

  if (!this.weather || !this.weather.attributes.wind_speed_unit) {
    return undefined;
  }

  const wind_speed_unit = this.weather.attributes.wind_speed_unit;
  const conversionFactor = unitConversion[wind_speed_unit];

  if (typeof conversionFactor !== 'number') {
    return undefined;
  }

  const windSpeedInKmPerHour = windSpeed * conversionFactor;

  if (windSpeedInKmPerHour < 1) return 0;
  else if (windSpeedInKmPerHour < 6) return 1;
  else if (windSpeedInKmPerHour < 12) return 2;
  else if (windSpeedInKmPerHour < 20) return 3;
  else if (windSpeedInKmPerHour < 29) return 4;
  else if (windSpeedInKmPerHour < 39) return 5;
  else if (windSpeedInKmPerHour < 50) return 6;
  else if (windSpeedInKmPerHour < 62) return 7;
  else if (windSpeedInKmPerHour < 75) return 8;
  else if (windSpeedInKmPerHour < 89) return 9;
  else if (windSpeedInKmPerHour < 103) return 10;
  else if (windSpeedInKmPerHour < 118) return 11;
  else return 12;
}


autoscroll() {
  if (!this.isConnected || !this.config.autoscroll || this.autoscrollTimeout) {
    return;
  }

  const updateChartOncePerHour = () => {
    const now = new Date();
    const nextHour = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        now.getHours()+1,
    );
    this.autoscrollTimeout = setTimeout(() => {
      this.autoscrollTimeout = null;
      this.drawChart();
      this.requestUpdate();
      this.autoscroll();
    }, nextHour - now);
  };

  updateChartOncePerHour();
}

cancelAutoscroll() {
  if (this.autoscrollTimeout) {
    clearTimeout(this.autoscrollTimeout);
  }
  this.autoscrollTimeout = null;
}

drawChart({ config, language, weather } = this) {
  if (!this.isConnected || !this.weatherAvailable || !this.visibleForecasts.length) {
    this.destroyChart();
    return;
  }

  const chartCanvas = this.renderRoot && this.renderRoot.querySelector('#forecastChart');
  if (!chartCanvas) {
    console.error('Canvas element not found:', this.renderRoot);
    return;
  }

  this.destroyChart();
  var tempUnit = weather.attributes.temperature_unit || this.getUnit('temperature');
  const precipUnitFromEntity = weather.attributes.precipitation_unit;
  var lengthUnit = precipUnitFromEntity ? (precipUnitFromEntity === 'mm' ? 'km' : 'mi') : this.getUnit('length');
  const precipUnit = config.forecast.precipitation_type === 'probability'
    ? '%' : precipUnitFromEntity || (lengthUnit === 'km' ? this.ll('units')['mm'] : this.ll('units')['in']);
  const data = this.computeForecastData();
  const temperatureFormatter = new Intl.NumberFormat(language, {
    maximumFractionDigits: config.forecast.round_temp ? 0 : 1,
  });
  const formatTemperature = value => value == null ? '' : `${temperatureFormatter.format(value)}°`;

  var style = getComputedStyle(document.body);
  var backgroundColor = style.getPropertyValue('--card-background-color');
  var textColor = style.getPropertyValue('--primary-text-color');
  var dividerColor = style.getPropertyValue('--divider-color');
  const canvas = this.renderRoot.querySelector('#forecastChart');
  if (!canvas) {
    requestAnimationFrame(() => this.drawChart());
    return;
  }

  const ctx = canvas.getContext('2d');

  let precipMax;

  if (config.forecast.precipitation_type === 'probability') {
    precipMax = 100;
  } else {
    if (config.forecast.type === 'hourly') {
      precipMax = lengthUnit === 'km' ? 4 : 1;
    } else {
      precipMax = lengthUnit === 'km' ? 20 : 1;
    }
  }

  Chart.defaults.color = textColor;
  Chart.defaults.scale.grid.color = dividerColor;
  Chart.defaults.elements.line.fill = false;
  Chart.defaults.elements.line.tension = 0.3;
  Chart.defaults.elements.line.borderWidth = 1.5;
  Chart.defaults.elements.point.radius = 2;
  Chart.defaults.elements.point.hitRadius = 10;

  var datasets = [
    {
      label: this.ll('tempHi'),
      type: 'line',
      data: data.tempHigh,
      yAxisID: 'TempAxis',
      borderColor: config.forecast.temperature1_color,
      backgroundColor: config.forecast.temperature1_color,
    },
    {
      label: this.ll('tempLo'),
      type: 'line',
      data: data.tempLow,
      yAxisID: 'TempAxis',
      borderColor: config.forecast.temperature2_color,
      backgroundColor: config.forecast.temperature2_color,
    },
    {
      label: this.ll('precip'),
      type: 'bar',
      data: data.precip,
      yAxisID: 'PrecipAxis',
      borderColor: config.forecast.precipitation_color,
      backgroundColor: config.forecast.precipitation_color,
      barPercentage: config.forecast.precip_bar_size / 100,
      categoryPercentage: 1.0,
      datalabels: {
        display: function (context) {
          return context.dataset.data[context.dataIndex] > 0 ? 'true' : false;
        },
      formatter: function (value, context) {
        const precipitationType = config.forecast.precipitation_type;

        const rainfall = context.dataset.data[context.dataIndex];
        const probability = data.forecast[context.dataIndex].precipitation_probability;

        let formattedValue;
        if (precipitationType === 'rainfall') {
          if (probability !== undefined && probability !== null && config.forecast.show_probability) {
	    formattedValue = `${rainfall > 9 ? Math.round(rainfall) : rainfall.toFixed(1)} ${precipUnit}\n${Math.round(probability)}%`;
          } else {
            formattedValue = `${rainfall > 9 ? Math.round(rainfall) : rainfall.toFixed(1)} ${precipUnit}`;
          }
        } else {
          formattedValue = `${rainfall > 9 ? Math.round(rainfall) : rainfall.toFixed(1)} ${precipUnit}`;
        }

        formattedValue = formattedValue.replace('\n', '\n\n');

        return formattedValue;
      },
        textAlign: 'center',
        textBaseline: 'middle',
        align: 'top',
        anchor: 'start',
        offset: -10,
      },
    },
  ];

  const chart_text_color = (config.forecast.chart_text_color === 'auto') ? textColor : config.forecast.chart_text_color;

  if (config.forecast.style === 'style2') {
    datasets[0].datalabels = {
      display: function (context) {
        return 'true';
      },
      formatter: function (value, context) {
        return formatTemperature(context.dataset.data[context.dataIndex]);
      },
      align: 'top',
      anchor: 'center',
      backgroundColor: 'transparent',
      borderColor: 'transparent',
      color: chart_text_color || config.forecast.temperature1_color,
      font: {
        size: parseInt(config.forecast.labels_font_size) + 1,
        lineHeight: 0.7,
      },
    };

    datasets[1].datalabels = {
      display: function (context) {
        return 'true';
      },
      formatter: function (value, context) {
        return formatTemperature(context.dataset.data[context.dataIndex]);
      },
      align: 'bottom',
      anchor: 'center',
      backgroundColor: 'transparent',
      borderColor: 'transparent',
      color: chart_text_color || config.forecast.temperature2_color,
      font: {
        size: parseInt(config.forecast.labels_font_size) + 1,
        lineHeight: 0.7,
      },
    };
  }

  this.forecastChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.dateTime,
      datasets: datasets,
    },
    options: {
      maintainAspectRatio: false,
      animation: config.forecast.disable_animation === true ? { duration: 0 } : {},
      layout: {
        padding: {
          bottom: 10,
        },
      },
      scales: {
        x: {
          position: 'top',
          border: {
            width: 0,
          },
          grid: {
            drawTicks: false,
            color: dividerColor,
          },
          ticks: {
              maxRotation: 0,
              color: config.forecast.chart_datetime_color || textColor,
              padding: config.forecast.precipitation_type === 'rainfall' && config.forecast.show_probability && config.forecast.type !== 'hourly' ? 4 : 10,
              callback: function (value, index, values) {
                  var datetime = this.getLabelForValue(value);
                  var dateObj = new Date(datetime);

                  var timeFormatOptions = {
                      hour12: config.use_12hour_format,
                      hour: 'numeric',
                      ...(config.use_12hour_format ? {} : { minute: 'numeric' }),
                  };

                  var time = dateObj.toLocaleTimeString(language, timeFormatOptions);

                  if (dateObj.getHours() === 0 && dateObj.getMinutes() === 0 && config.forecast.type === 'hourly') {
                      var dateFormatOptions = {
                          day: 'numeric',
                          month: 'short',
                      };
                      var date = dateObj.toLocaleDateString(language, dateFormatOptions);
                      time = time.replace('a.m.', 'AM').replace('p.m.', 'PM');
                      return [date, time];
                  }

                  if (config.forecast.type !== 'hourly') {
                      var weekday = dateObj.toLocaleString(language, { weekday: 'short' }).toUpperCase();
                      return weekday;
                  }

                  time = time.replace('a.m.', 'AM').replace('p.m.', 'PM');
                  return time;
              },
          },
          reverse: document.dir === 'rtl' ? true : false,
        },
        TempAxis: {
          position: 'left',
          beginAtZero: false,
          suggestedMin: data.temperatureBounds.min,
          suggestedMax: data.temperatureBounds.max,
          grid: {
            display: false,
            drawTicks: false,
          },
          ticks: {
            display: false,
          },
        },
        PrecipAxis: {
          position: 'right',
          suggestedMax: precipMax,
          grid: {
            display: false,
            drawTicks: false,
          },
          ticks: {
            display: false,
          },
        },
      },
      plugins: {
        legend: {
          display: false,
        },
        datalabels: {
          backgroundColor: backgroundColor,
          borderColor: context => context.dataset.backgroundColor,
          borderRadius: 0,
          borderWidth: 1.5,
          padding: config.forecast.precipitation_type === 'rainfall' && config.forecast.show_probability && config.forecast.type !== 'hourly' ? 3 : 4,
          color: chart_text_color || textColor,
          font: {
            size: config.forecast.labels_font_size,
            lineHeight: 0.7,
          },
          formatter: function (value, context) {
            return formatTemperature(context.dataset.data[context.dataIndex]);
          },
        },
        tooltip: {
          caretSize: 0,
          caretPadding: 15,
          callbacks: {
            title: function (TooltipItem) {
              var datetime = TooltipItem[0].label;
              return new Date(datetime).toLocaleDateString(language, {
                month: 'short',
                day: 'numeric',
                weekday: 'short',
                hour: 'numeric',
                minute: 'numeric',
                hour12: config.use_12hour_format,
              });
            },
    label: function (context) {
      var label = context.dataset.label;
      var value = context.formattedValue;
      var probability = data.forecast[context.dataIndex].precipitation_probability;
      var unit = context.datasetIndex === 2 ? precipUnit : tempUnit;

      if (config.forecast.precipitation_type === 'rainfall' && context.datasetIndex === 2 && config.forecast.show_probability && probability !== undefined && probability !== null) {
        return label + ': ' + value + ' ' + precipUnit + ' / ' + Math.round(probability) + '%';
      } else {
        return label + ': ' + value + ' ' + unit;
      }
            },
          },
        },
      },
    },
  });
}

get visibleForecasts() {
  const cutoff = (this.config.forecast.type === 'hourly' ? 1 : 24) * 3600000;
  const now = Date.now();
  return (this.forecasts || []).filter(item => !this.config.autoscroll ||
    now - Date.parse(item.datetime) <= cutoff).slice(0, this.forecastItems);
}

computeForecastData({ config } = this) {
  const forecast = this.visibleForecasts;
  const number = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
  const temperature = value => {
    const n = number(value);
    return n == null ? null : config.forecast.round_temp ? Math.round(n) : n;
  };
  const tempHigh = forecast.map(item => temperature(item.temperature));
  const tempLow = forecast.map(item => temperature(item.templow));
  const temperatures = [...tempHigh, ...tempLow].filter(value => value != null);
  return {
    forecast,
    dateTime: forecast.map(item => item.datetime),
    tempHigh,
    tempLow,
    precip: forecast.map(item => number(config.forecast.precipitation_type === 'probability'
      ? item.precipitation_probability : item.precipitation)),
    temperatureBounds: {
      min: temperatures.length ? Math.min(...temperatures) - 5 : undefined,
      max: temperatures.length ? Math.max(...temperatures) + 3 : undefined
    }
  };
}

  render({config, _hass, weather} = this) {
    if (!config || !_hass) {
      return html``;
    }
    if (!this.weatherAvailable) {
      return html`
        <style>
          .card {
            padding-top: ${config.title? '0px' : '16px'};
            padding-right: 16px;
            padding-bottom: 16px;
            padding-left: 16px;
          }
        </style>
        <ha-card header="${config.title}">
          <div class="card">
            Weather entity ${config.entity} is unavailable.
          </div>
        </ha-card>
      `;
    }
    return html`
      <style>
        ha-icon {
          color: var(--paper-item-icon-color);
        }
        img {
          width: ${config.icons_size}px;
          height: ${config.icons_size}px;
        }
        .card {
          padding-top: ${config.title ? '0px' : '16px'};
          padding-right: 16px;
          padding-bottom: ${config.show_last_changed === true ? '2px' : '16px'};
          padding-left: 16px;
        }
        .main {
          display: flex;
          align-items: center;
          font-size: ${config.current_temp_size}px;
          margin-bottom: 10px;
        }
        .main ha-icon {
          --mdc-icon-size: 50px;
          margin-right: 14px;
          margin-inline-start: initial;
          margin-inline-end: 14px;
        }
        .main img {
          width: ${config.icons_size * 2}px;
          height: ${config.icons_size * 2}px;
          margin-right: 14px;
          margin-inline-start: initial;
          margin-inline-end: 14px;
        }
        .main div {
          line-height: 0.9;
        }
        .main span {
          font-size: 18px;
          color: var(--secondary-text-color);
        }
        .attributes {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 6px;
      	  font-weight: 300;
          direction: ltr;
        }
        .chart-container {
          position: relative;
          height: ${config.forecast.chart_height}px;
          width: 100%;
          direction: ltr;
        }
        .forecast-status {
          color: var(--secondary-text-color);
          padding: 8px 0;
        }
        .conditions {
          display: flex;
          justify-content: space-around;
          align-items: center;
          margin: 0px 5px 0px 5px;
      	  cursor: pointer;
        }
        .forecast-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          margin: 1px;
        }
        .wind-details {
          display: flex;
          justify-content: space-around;
          align-items: center;
          font-weight: 300;
        }
        .wind-detail {
          display: flex;
          align-items: center;
          margin: 1px;
        }
        .wind-detail ha-icon {
          --mdc-icon-size: 15px;
          margin-right: 1px;
          margin-inline-start: initial;
          margin-inline-end: 1px;
        }
        .wind-icon {
          margin-right: 1px;
          margin-inline-start: initial;
          margin-inline-end: 1px;
          position: relative;
	        bottom: 1px;
        }
        .wind-speed {
          font-size: 11px;
          margin-right: 1px;
          margin-inline-start: initial;
          margin-inline-end: 1px;
        }
        .wind-unit {
          font-size: 9px;
          margin-left: 1px;
          margin-inline-start: 1px;
          margin-inline-end: initial;
        }
        .current-time {
          position: absolute;
          top: 20px;
          right: 16px;
          inset-inline-start: initial;
          inset-inline-end: 16px;
          font-size: ${config.time_size}px;
        }
        .date-text {
          font-size: ${config.day_date_size}px;
          color: var(--secondary-text-color);
        }
        .main .feels-like {
          font-size: 13px;
          margin-top: 5px;
          font-weight: 400;
        }
        .main .description {
	  font-style: italic;
          font-size: 13px;
          margin-top: 5px;
          font-weight: 400;
        }
        .updated {
          font-size: 13px;
          align-items: right;
          font-weight: 300;
          margin-bottom: 1px;
        }
      </style>

      <ha-card header="${config.title}">
        <div class="card">
          ${this.renderMain()}
          ${this.renderAttributes()}
          ${this.forecastError || !this.visibleForecasts.length ? html`
            <div class="forecast-status" role="status">${this.forecastError || 'No forecast data available.'}</div>
          ` : ''}
          <div class="chart-container" ?hidden=${!this.visibleForecasts.length}>
            <canvas id="forecastChart"></canvas>
          </div>
          ${this.renderForecastConditionIcons()}
          ${this.renderWind()}
          ${this.renderLastUpdated()}
        </div>
      </ha-card>
    `;
  }

renderMain({ config, sun, weather, temperature, feels_like, description } = this) {
  if (config.show_main === false)
    return html``;

  const showTime = config.show_time;
  const showDay = config.show_day;
  const showDate = config.show_date;
  const showFeelsLike = config.show_feels_like;
  const showDescription = config.show_description;
  const showCurrentCondition = config.show_current_condition !== false;
  const showTemperature = config.show_temperature !== false;

  let roundedTemperature = parseFloat(temperature);
  if (!isNaN(roundedTemperature) && roundedTemperature % 1 !== 0) {
    roundedTemperature = Math.round(roundedTemperature * 10) / 10;
  }

  let roundedFeelsLike = parseFloat(feels_like);
  if (!isNaN(roundedFeelsLike) && roundedFeelsLike % 1 !== 0) {
    roundedFeelsLike = Math.round(roundedFeelsLike * 10) / 10;
  }

  const iconHtml = config.animated_icons || config.icons
    ? html`<img src="${this.getWeatherIcon(weather.state, sun?.state)}" alt="">`
    : html`<ha-icon icon="${this.getWeatherIcon(weather.state, sun?.state)}"></ha-icon>`;


  return html`
    <div class="main">
      ${iconHtml}
      <div>
        <div>
          ${showTemperature ? html`${Number.isFinite(roundedTemperature) ? roundedTemperature : '—'}<span>${this.weather.attributes.temperature_unit || this.getUnit('temperature')}</span>` : ''}
          ${showFeelsLike && Number.isFinite(roundedFeelsLike) ? html`
            <div class="feels-like">
              ${this.ll('feelsLike')}
              ${roundedFeelsLike}${this.weather.attributes.temperature_unit || this.getUnit('temperature')}
            </div>
          ` : ''}
          ${showCurrentCondition ? html`
            <div class="current-condition">
              <span>${this.ll(weather.state)}</span>
            </div>
          ` : ''}
          ${showDescription ? html`
            <div class="description">
              ${description}
            </div>
          ` : ''}
        </div>
        ${showTime ? html`
          <div class="current-time">
            <div id="digital-clock"></div>
            ${showDay ? html`<div class="date-text day"></div>` : ''}
            ${showDay && showDate ? html` ` : ''}
            ${showDate ? html`<div class="date-text date"></div>` : ''}
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

renderAttributes({ config, humidity, pressure, windSpeed, windDirection, sun, language, uv_index, dew_point, wind_gust_speed, visibility } = this) {
  let dWindSpeed = windSpeed;
  let dPressure = pressure;

  if (this.unitSpeed !== this.weather.attributes.wind_speed_unit) {
    if (this.unitSpeed === 'm/s') {
      if (this.weather.attributes.wind_speed_unit === 'km/h') {
        dWindSpeed = Math.round(windSpeed * 1000 / 3600);
      } else if (this.weather.attributes.wind_speed_unit === 'mph') {
        dWindSpeed = Math.round(windSpeed * 0.44704);
      }
    } else if (this.unitSpeed === 'km/h') {
      if (this.weather.attributes.wind_speed_unit === 'm/s') {
        dWindSpeed = Math.round(windSpeed * 3.6);
      } else if (this.weather.attributes.wind_speed_unit === 'mph') {
        dWindSpeed = Math.round(windSpeed * 1.60934);
      }
    } else if (this.unitSpeed === 'mph') {
      if (this.weather.attributes.wind_speed_unit === 'm/s') {
        dWindSpeed = Math.round(windSpeed / 0.44704);
      } else if (this.weather.attributes.wind_speed_unit === 'km/h') {
        dWindSpeed = Math.round(windSpeed / 1.60934);
      }
    } else if (this.unitSpeed === 'Bft') {
      dWindSpeed = this.calculateBeaufortScale(windSpeed);
    }
  } else {
    dWindSpeed = Math.round(dWindSpeed);
  }

  if (this.unitPressure !== this.weather.attributes.pressure_unit) {
    if (this.unitPressure === 'mmHg') {
      if (this.weather.attributes.pressure_unit === 'hPa') {
        dPressure = Math.round(pressure * 0.75006);
      } else if (this.weather.attributes.pressure_unit === 'inHg') {
        dPressure = Math.round(pressure * 25.4);
      }
    } else if (this.unitPressure === 'hPa') {
      if (this.weather.attributes.pressure_unit === 'mmHg') {
        dPressure = Math.round(pressure / 0.75006);
      } else if (this.weather.attributes.pressure_unit === 'inHg') {
        dPressure = Math.round(pressure * 33.8639);
      }
    } else if (this.unitPressure === 'inHg') {
      if (this.weather.attributes.pressure_unit === 'mmHg') {
        dPressure = pressure / 25.4;
      } else if (this.weather.attributes.pressure_unit === 'hPa') {
        dPressure = pressure / 33.8639;
      }
      dPressure = Number.isFinite(dPressure) ? dPressure.toFixed(2) : undefined;
    }
  } else {
    if (this.unitPressure === 'hPa' || this.unitPressure === 'mmHg') {
      dPressure = Math.round(dPressure);
    }
  }

  if (!Number.isFinite(pressure)) dPressure = undefined;
  if (!Number.isFinite(windSpeed)) dWindSpeed = undefined;

  if (config.show_attributes == false)
    return html``;

  const showHumidity = config.show_humidity !== false;
  const showPressure = config.show_pressure !== false;
  const showWindDirection = config.show_wind_direction !== false;
  const showWindSpeed = config.show_wind_speed !== false;
  const showSun = config.show_sun !== false;
  const showDewpoint = config.show_dew_point == true;
  const showWindgustspeed = config.show_wind_gust_speed == true;
  const showVisibility = config.show_visibility == true;

return html`
    <div class="attributes">
      ${((showHumidity && humidity !== undefined) || (showPressure && dPressure !== undefined) || (showDewpoint && dew_point !== undefined) || (showVisibility && visibility !== undefined)) ? html`
        <div>
          ${showHumidity && humidity !== undefined ? html`
            <ha-icon icon="hass:water-percent"></ha-icon> ${humidity} %<br>
          ` : ''}
          ${showPressure && dPressure !== undefined ? html`
            <ha-icon icon="hass:gauge"></ha-icon> ${dPressure} ${this.ll('units')[this.unitPressure]} <br>
          ` : ''}
          ${showDewpoint && dew_point !== undefined ? html`
            <ha-icon icon="hass:thermometer-water"></ha-icon> ${dew_point} ${this.weather.attributes.temperature_unit || this.getUnit('temperature')} <br>
          ` : ''}
          ${showVisibility && visibility !== undefined ? html`
            <ha-icon icon="hass:eye"></ha-icon> ${visibility} ${this.weather.attributes.visibility_unit}
          ` : ''}
        </div>
      ` : ''}
      ${((showSun && sun !== undefined) || (typeof uv_index !== 'undefined' && uv_index !== undefined)) ? html`
        <div>
          ${typeof uv_index !== 'undefined' && uv_index !== undefined ? html`
            <div>
              <ha-icon icon="hass:white-balance-sunny"></ha-icon> UV: ${Math.round(uv_index * 10) / 10}
            </div>
          ` : ''}
          ${showSun && sun !== undefined ? html`
            <div>
              ${this.renderSun({ sun, language })}
            </div>
          ` : ''}
        </div>
      ` : ''}
      ${((showWindDirection && windDirection !== undefined) || (showWindSpeed && dWindSpeed !== undefined)) ? html`
        <div>
          ${showWindDirection && windDirection !== undefined ? html`
            <ha-icon icon="hass:${this.getWindDirIcon(windDirection)}"></ha-icon> ${this.getWindDir(windDirection) ?? '—'} <br>
          ` : ''}
          ${showWindSpeed && dWindSpeed !== undefined ? html`
            <ha-icon icon="hass:weather-windy"></ha-icon>
            ${Number.isFinite(dWindSpeed) ? dWindSpeed : '—'} ${this.ll('units')[this.unitSpeed] || this.unitSpeed || ''} <br>
          ` : ''}
          ${showWindgustspeed && wind_gust_speed !== undefined ? html`
            <ha-icon icon="hass:weather-windy-variant"></ha-icon>
            ${wind_gust_speed} ${this.ll('units')[this.unitSpeed]}
          ` : ''}
        </div>
      ` : ''}
    </div>
`;
}

renderSun({ sun, language, config } = this) {
  if (!sun?.attributes?.next_rising || !sun.attributes.next_setting) {
    return html``;
  }

const use12HourFormat = this.config.use_12hour_format;
const timeOptions = {
    hour12: use12HourFormat,
    hour: 'numeric',
    minute: 'numeric'
};

  return html`
    <ha-icon icon="mdi:weather-sunset-up"></ha-icon>
      ${new Date(sun.attributes.next_rising).toLocaleTimeString(language, timeOptions)}<br>
    <ha-icon icon="mdi:weather-sunset-down"></ha-icon>
      ${new Date(sun.attributes.next_setting).toLocaleTimeString(language, timeOptions)}
  `;
}

renderForecastConditionIcons({ config, sun } = this) {
  const forecast = this.visibleForecasts;

  if (config.forecast.condition_icons === false) {
    return html``;
  }

  return html`
    <div class="conditions" @click="${(e) => this.showMoreInfo(config.entity)}">
      ${forecast.map((item) => {
        const forecastTime = new Date(item.datetime);
        const sunriseTime = new Date(sun?.attributes?.next_rising);
        const sunsetTime = new Date(sun?.attributes?.next_setting);

        // Adjust sunrise and sunset times to match the date of forecastTime
        const adjustedSunriseTime = new Date(forecastTime);
        adjustedSunriseTime.setHours(sunriseTime.getHours());
        adjustedSunriseTime.setMinutes(sunriseTime.getMinutes());
        adjustedSunriseTime.setSeconds(sunriseTime.getSeconds());

        const adjustedSunsetTime = new Date(forecastTime);
        adjustedSunsetTime.setHours(sunsetTime.getHours());
        adjustedSunsetTime.setMinutes(sunsetTime.getMinutes());
        adjustedSunsetTime.setSeconds(sunsetTime.getSeconds());

        let isDayTime;

        if (config.forecast.type === 'daily') {
          // For daily forecast, assume it's day time
          isDayTime = true;
        } else {
          // For other forecast types, determine based on sunrise and sunset times
          isDayTime = !sun || !Number.isFinite(sunriseTime.getTime()) || !Number.isFinite(sunsetTime.getTime())
            ? item.is_daytime !== false : forecastTime >= adjustedSunriseTime && forecastTime <= adjustedSunsetTime;
        }

        const condition = item.condition;

        let iconHtml;

        if (config.animated_icons || config.icons) {
          const iconSrc = this.getWeatherIcon(condition, isDayTime ? 'above_horizon' : 'below_horizon');
          iconHtml = html`<img class="icon" src="${iconSrc}" alt="">`;
        } else {
          iconHtml = html`<ha-icon icon="${this.getWeatherIcon(condition, isDayTime ? 'above_horizon' : 'below_horizon')}"></ha-icon>`;
        }

        return html`
          <div class="forecast-item">
            ${iconHtml}
          </div>
        `;
      })}
    </div>
  `;
}

renderWind({ config } = this) {
  const showWindForecast = config.forecast.show_wind_forecast !== false;

  if (!showWindForecast) {
    return html``;
  }

  const forecast = this.visibleForecasts;

  return html`
    <div class="wind-details">
      ${showWindForecast ? html`
        ${forecast.map((item) => {
          let dWindSpeed = item.wind_speed;

          if (this.unitSpeed !== this.weather.attributes.wind_speed_unit) {
            if (this.unitSpeed === 'm/s') {
              if (this.weather.attributes.wind_speed_unit === 'km/h') {
                dWindSpeed = Math.round(item.wind_speed * 1000 / 3600);
              } else if (this.weather.attributes.wind_speed_unit === 'mph') {
                dWindSpeed = Math.round(item.wind_speed * 0.44704);
              }
            } else if (this.unitSpeed === 'km/h') {
              if (this.weather.attributes.wind_speed_unit === 'm/s') {
                dWindSpeed = Math.round(item.wind_speed * 3.6);
              } else if (this.weather.attributes.wind_speed_unit === 'mph') {
                dWindSpeed = Math.round(item.wind_speed * 1.60934);
              }
            } else if (this.unitSpeed === 'mph') {
              if (this.weather.attributes.wind_speed_unit === 'm/s') {
                dWindSpeed = Math.round(item.wind_speed / 0.44704);
              } else if (this.weather.attributes.wind_speed_unit === 'km/h') {
                dWindSpeed = Math.round(item.wind_speed / 1.60934);
              }
            } else if (this.unitSpeed === 'Bft') {
              dWindSpeed = this.calculateBeaufortScale(item.wind_speed);
            }
          } else {
            dWindSpeed = Math.round(dWindSpeed);
          }

          return html`
            <div class="wind-detail">
              <ha-icon class="wind-icon" icon="hass:${this.getWindDirIcon(item.wind_bearing) || 'help'}"></ha-icon>
              <span class="wind-speed">${Number.isFinite(dWindSpeed) ? dWindSpeed : '—'}</span>
              <span class="wind-unit">${this.ll('units')[this.unitSpeed] || this.unitSpeed || ''}</span>
            </div>
          `;
        })}
      ` : ''}
    </div>
  `;
}

renderLastUpdated() {
  if (!this.config.show_last_changed || !Number.isFinite(Date.parse(this.weather.last_changed))) return html``;
  const lastUpdatedString = this.weather.last_changed;
  const lastUpdatedTimestamp = new Date(lastUpdatedString).getTime();
  const currentTimestamp = Date.now();
  const timeDifference = currentTimestamp - lastUpdatedTimestamp;

  const minutesAgo = Math.floor(timeDifference / (1000 * 60));
  const hoursAgo = Math.floor(minutesAgo / 60);

  const locale = this.language;

  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  let formattedLastUpdated;

  if (hoursAgo > 0) {
    formattedLastUpdated = formatter.format(-hoursAgo, 'hour');
  } else {
    formattedLastUpdated = formatter.format(-minutesAgo, 'minute');
  }

  return html`
    <div class="updated">
      <div>
        ${formattedLastUpdated}
      </div>
    </div>
  `;
}

  _fire(type, detail, options) {
    const node = this.shadowRoot;
    options = options || {};
    detail = (detail === null || detail === undefined) ? {} : detail;
    const event = new Event(type, {
      bubbles: options.bubbles === undefined ? true : options.bubbles,
      cancelable: Boolean(options.cancelable),
      composed: options.composed === undefined ? true : options.composed
    });
    event.detail = detail;
    node.dispatchEvent(event);
    return event;
  }

  showMoreInfo(entity) {
    this._fire('hass-more-info', { entityId: entity });
  }
}

customElements.define('weather-chart-card', WeatherChartCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "weather-chart-card",
  name: "Weather Chart Card",
  description: "A custom weather card with chart.",
  preview: true,
  documentationURL: "https://github.com/VAdamec/weather-chart-card",
});
