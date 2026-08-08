(function(){
  "use strict";

  // ---------- Map setup ----------
  const map = L.map('map', {zoomControl:false, attributionControl:true}).setView([37.7749,-122.4194], 13);
  L.control.zoom({position:'bottomleft'}).addTo(map);

  const BASEMAPS = {
    dark: {
      label: 'Dark',
      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      subdomains: 'abcd', maxZoom: 20
    },
    light: {
      label: 'Light',
      url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      subdomains: 'abcd', maxZoom: 20
    },
    streets: {
      label: 'Streets',
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '&copy; OpenStreetMap contributors',
      subdomains: 'abc', maxZoom: 19
    },
    satellite: {
      label: 'Satellite',
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics',
      maxZoom: 19
    },
    topo: {
      label: 'Topo',
      url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      attribution: 'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap (CC-BY-SA)',
      subdomains: 'abc', maxZoom: 17
    }
  };

  let currentBasemapLayer = null;
  function setBasemap(key){
    const cfg = BASEMAPS[key] ? BASEMAPS[key] : BASEMAPS.dark;
    const tileOptions = { attribution: cfg.attribution, maxZoom: cfg.maxZoom };
    if(cfg.subdomains) tileOptions.subdomains = cfg.subdomains; // omit entirely if unset, rather than passing undefined

    const oldLayer = currentBasemapLayer;
    const newLayer = L.tileLayer(cfg.url, tileOptions);
    currentBasemapLayer = newLayer;

    newLayer.addTo(map);
    newLayer.bringToBack();

    // Don't remove the previous layer until the new one has actually
    // finished loading its tiles (falling back to a timeout if 'load'
    // never fires, e.g. a tile request errors out). Removing the old
    // layer synchronously can yank a tile out from under an in-flight
    // async decode, which is what was throwing the "Cannot read
    // properties of undefined (reading 'length')" error — much more
    // likely with satellite imagery since those tiles are far larger and
    // slower to load than the other basemaps.
    if(oldLayer){
      let cleaned = false;
      const cleanupOld = ()=>{
        if(cleaned) return;
        cleaned = true;
        if(map.hasLayer(oldLayer)) map.removeLayer(oldLayer);
      };
      newLayer.once('load', cleanupOld);
      setTimeout(cleanupOld, 2500);
    }

    const select = document.getElementById('basemap-select');
    if(select && select.value !== key) select.value = key;
  }

  async function initBasemap(){
    let key = 'light';
    try{
      const saved = await window.storage.get('basemap-preference');
      if(saved && BASEMAPS[saved.value]) key = saved.value;
    }catch(e){ /* no saved preference yet, or storage unavailable — use default */ }
    setBasemap(key);
  }

  document.getElementById('basemap-select').addEventListener('change', async (e)=>{
    const key = e.target.value;
    setBasemap(key);
    try{ await window.storage.set('basemap-preference', key); }catch(e){ /* non-fatal — just won't persist */ }
  });

  initBasemap();

  let routeLayerGroup = L.layerGroup().addTo(map);
  let routeSegments = []; // flat array of {a:[lat,lon], b:[lat,lon]} for distance calc
  let routeBounds = null;
  let busLayerGroup = L.layerGroup().addTo(map);
  let stopLayerGroup = L.layerGroup().addTo(map);
  // Material Symbols "directions_bus" glyph, used for live vehicle markers.
  const BUS_ICON_SVG = '<svg viewBox="0 0 24 24"><path d="M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM18 11H6V6h12v5z"/></svg>';
  let nearestStopLayerGroup = L.layerGroup().addTo(map);
  let poiLayerGroup = L.layerGroup().addTo(map);

  // ---------- Fallback route list (used only if the live route list fails to load) ----------
  const FALLBACK_ROUTES = ["1","1X","2","3","5","5R","6","7","7X","8","8AX","8BX","9","9R","10","12","14","14R","14X","15","18","19","21","22","23","24","25","27","28","28R","29","30","31","33","35","36","37","38","38R","39","43","44","45","48","49","52","54","55","56","57","58","66","67","714","J","KBUS","L","M","MBUS","N","NBUS","T","TBUS"];

  // ---------- Route names ----------
  // Maps a route's base code (after stripping the trailing "BUS" used for
  // rail-replacement shapes) to its public display name, e.g. "1" -> "California".
  // Variant suffixes (X/R/AX/BX) share the base line's name.
  const ROUTE_NAMES = {
    "1":"California", "1X":"California Express",
    "2":"Clement",
    "3":"Jackson",
    "5":"Fulton", "5R":"Fulton Rapid",
    "6":"Hayes/Parnassus",
    "7":"Haight/Noriega", "7X":"Noriega Express",
    "8":"Bayshore", "8AX":"Bayshore A Express", "8BX":"Bayshore B Express",
    "9":"San Bruno", "9R":"San Bruno Rapid",
    "10":"Townsend",
    "12":"Folsom/Pacific",
    "14":"Mission", "14R":"Mission Rapid", "14X":"Mission Express",
    "15":"Bayview Hunters Point Express",
    "18":"46th Avenue",
    "19":"Polk",
    "21":"Hayes",
    "22":"Fillmore",
    "23":"Monterey",
    "24":"Divisadero",
    "25":"Treasure Island",
    "27":"Bryant",
    "28":"19th Avenue", "28R":"19th Avenue Rapid",
    "29":"Sunset",
    "30":"Stockton",
    "31":"Balboa",
    "33":"Ashbury/18th St",
    "35":"Eureka",
    "36":"Teresita",
    "37":"Corbett",
    "38":"Geary", "38R":"Geary Rapid",
    "39":"Coit",
    "43":"Masonic",
    "44":"O'Shaughnessy",
    "45":"Union/Stockton",
    "48":"Quintara/24th Street",
    "49":"Van Ness/Mission",
    "52":"Excelsior",
    "54":"Felton",
    "55":"16th Street",
    "56":"Rutland",
    "57":"Parkmerced",
    "58":"Lake Merced",
    "66":"Quintara",
    "67":"Bernal Heights",
    "714":"BART Early Bird",
    "J":"Church",
    "K":"Ingleside",
    "L":"Taraval",
    "M":"Ocean View",
    "N":"Judah",
    "T":"Third Street"
  };

  const DATA_BASE = "https://data.sfgov.org/resource/9exe-acju.json";

  // Cloudflare Worker proxy that holds the 511.org API key server-side.
  // See the muni-511-proxy project for the Worker source.
  const PROXY_BASE = "https://muni-walk.caroline-orsi.workers.dev/";

  // Cloudflare Worker proxy that holds the Anthropic API key server-side,
  // used only to (1) turn a free-text "find ___" request into OpenStreetMap
  // tag filters and (2) write short descriptions of the results it's given.
  // It never returns coordinates itself — those always come straight from
  // OpenStreetMap's Overpass API below. Source: worker/ai-search-worker.js;
  // update this URL after deploying it (see worker/README.md).
  const AI_PROXY_BASE = "https://muni-walk-ai-search.caroline-orsi.workers.dev/";

  // overpass-api.de is the main public instance and it's often overloaded,
  // returning a 504 (as an HTML error page, not JSON) under load. Kumi
  // Systems mirrors the same public database, so on a transient failure we
  // retry a couple times and then fall back to it before giving up.
  const OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter"
  ];
  const OVERPASS_RETRY_STATUSES = new Set([429, 502, 503, 504]);

  // Wikipedia's geosearch, queried directly like Overpass above (no key,
  // CORS enabled via origin=*). OpenStreetMap's `historic=*` tagging in SF
  // is sparse and skews toward plaques/monuments, so for historical
  // searches this supplements it with real Wikipedia articles near the
  // route — places that were never tagged in OSM at all, with a proper
  // summary already written instead of one guessed from a web search.
  const WIKIPEDIA_GEOSEARCH_ENDPOINT = "https://en.wikipedia.org/w/api.php";

  // ---------- Embedded route shapes ----------
  // EMBEDDED_ROUTES comes from routes-data.js, loaded before this script.
  const EMBEDDED_ROUTE_NAMES = Object.keys(EMBEDDED_ROUTES);

  function friendlyName(code){
    // strip trailing BUS used for rail-replacement bus shapes, keep raw letter for rail lines
    return code.replace(/BUS$/,'');
  }

  function routeDisplayLabel(code){
    const shortName = friendlyName(code);
    const name = ROUTE_NAMES[shortName];
    return name ? shortName + ' - ' + name : shortName;
  }

  // ---------- Populate route dropdown ----------
  const select = document.getElementById('route-select');
  const badge = document.getElementById('badge');

  function sortRoutes(list){
    return list.slice().sort((a,b)=>{
      const an = parseInt(a,10), bn = parseInt(b,10);
      const aNum = !isNaN(an) && /^\d/.test(a);
      const bNum = !isNaN(bn) && /^\d/.test(b);
      if(aNum && bNum){ if(an!==bn) return an-bn; return a.localeCompare(b); }
      if(aNum && !bNum) return -1;
      if(!aNum && bNum) return 1;
      return a.localeCompare(b);
    });
  }

  function fillSelect(routes){
    select.innerHTML = '<option value="">Select a route…</option>';
    sortRoutes(routes).forEach(r=>{
      const opt = document.createElement('option');
      opt.value = r;
      opt.textContent = routeDisplayLabel(r);
      select.appendChild(opt);
    });
  }

  function loadRouteList(){
    // Show the full curated route list immediately and leave it alone from
    // here on. (Earlier versions re-populated this list in the background
    // after a live fetch resolved, which could rebuild the <select> options
    // out from under an in-progress tap/click and select the wrong line —
    // e.g. tapping "44" but landing on "43" because the list shifted. The
    // curated list below already covers every current Muni line, so there's
    // no need to mutate the dropdown again after this.)
    const baseList = Array.from(new Set([...EMBEDDED_ROUTE_NAMES, ...FALLBACK_ROUTES]));
    fillSelect(baseList);
  }

  // ---------- WKT / GeoJSON shape parsing ----------
  function parseWKTMultiLineString(wkt){
    // e.g. MULTILINESTRING ((-122.4 37.7, -122.5 37.8), (...))
    const lines = [];
    // Find every parenthesized coordinate group and parse it independently —
    // robust to any number of sub-lines in the MULTILINESTRING.
    const groupMatches = wkt.match(/\(([^()]+)\)/g);
    if(groupMatches){
      groupMatches.forEach(g=>{
        const coordStr = g.replace(/[()]/g,'');
        const pts = coordStr.split(',').map(pair=>{
          const [lon,lat] = pair.trim().split(/\s+/).map(Number);
          return [lat, lon];
        }).filter(p=>!isNaN(p[0]) && !isNaN(p[1]));
        if(pts.length>1) lines.push(pts);
      });
    }
    return lines;
  }

  function extractLinesFromShape(shape){
    if(!shape) return [];
    if(typeof shape === 'string'){
      return parseWKTMultiLineString(shape);
    }
    if(shape.type === 'MultiLineString' && Array.isArray(shape.coordinates)){
      return shape.coordinates.map(line=> line.map(([lon,lat])=>[lat,lon]) );
    }
    if(shape.type === 'LineString' && Array.isArray(shape.coordinates)){
      return [ shape.coordinates.map(([lon,lat])=>[lat,lon]) ];
    }
    return [];
  }

  // ---------- Direction / progress state ----------
  let currentRouteDirs = {};   // { I: {lines:[[lat,lon],...], layers:[L.polyline]}, O: {...} }
  let activeDirection = null;  // 'I' or 'O'
  let progressModel = null;    // { points:[[lat,lon],...], cumDist:[meters...], total:meters }
  let currentRouteName = null;

  // ---------- Load + draw route ----------
  async function loadRoute(routeName){
    routeLayerGroup.clearLayers();
    busLayerGroup.clearLayers();
    stopLayerGroup.clearLayers();
    nearestStopLayerGroup.clearLayers();
    stopMarkersDrawnForRoute = null;
    stopMarkersInfo = [];
    nearestStopInfo = null;
    clearPoiResults();
    poiSearchToken++; // invalidate any in-flight search from the previous route
    document.getElementById('poi-search-input').value = '';
    routeSegments = [];
    routeBounds = null;
    currentRouteDirs = {};
    activeDirection = null;
    progressModel = null;
    currentRouteName = routeName || null;
    document.getElementById('info-card').classList.remove('visible');
    document.getElementById('search-fab-btn').classList.remove('visible');
    document.getElementById('live-fab-btn').classList.remove('visible');
    closeSidePanel(document.getElementById('search-card'), document.getElementById('search-fab-btn'));
    closeSidePanel(document.getElementById('live-card'), document.getElementById('live-fab-btn'));
    document.getElementById('empty-hint').classList.add('hidden');
    document.getElementById('progress-block').classList.remove('visible');
    document.getElementById('direction-toggle').innerHTML = '';
    renderLiveList([]); // clear any stale live-bus list from the previous route

    if(!routeName){
      badge.textContent = 'SF'; badge.classList.add('empty');
      document.getElementById('empty-hint').classList.remove('hidden');
      return;
    }

    badge.textContent = friendlyName(routeName);
    badge.classList.remove('empty');

    // Prefer the embedded, always-available shapes for this route.
    if(EMBEDDED_ROUTES[routeName]){
      drawRouteFromShapes(routeName, EMBEDDED_ROUTES[routeName]);
      refreshLiveBuses();
      return;
    }

    // Otherwise, try the live SFMTA feed.
    try{
      const url = DATA_BASE + "?route_name=" + encodeURIComponent(routeName) + "&pattern_type=F&$limit=50";
      const res = await fetch(url);
      if(!res.ok) throw new Error('bad status '+res.status);
      const rows = await res.json();
      if(!rows.length) throw new Error('no shapes returned for this route');

      const seenDir = {};
      const shapes = {};
      rows.forEach(row=>{
        const dir = row.direction; // 'I' or 'O'
        if(seenDir[dir]) return; // keep first full pattern per direction to avoid overlapping dupes
        seenDir[dir] = true;
        shapes[dir] = row.shape;
      });

      drawRouteFromShapes(routeName, shapes);
      refreshLiveBuses();
    }catch(e){
      console.error(e);
      showError("Route " + friendlyName(routeName) + " isn't in the offline set and the live SFMTA feed couldn't be reached from here. Lines 1–14 always work offline; other lines need that live connection to succeed.");
    }
  }

  function drawRouteFromShapes(routeName, shapes){
    const bounds = [];

    Object.keys(shapes).forEach(dir=>{
      const lines = extractLinesFromShape(shapes[dir]);
      if(!lines.length) return;

      const layers = [];
      const color = dir === 'I' ? getComputedColor('--inbound') : getComputedColor('--outbound');

      lines.forEach(latlngs=>{
        if(latlngs.length < 2) return;
        const pl = L.polyline(latlngs, {
          color, weight:5, opacity:0.55, lineCap:'round', lineJoin:'round'
        }).addTo(routeLayerGroup);
        layers.push(pl);
        latlngs.forEach(p=>bounds.push(p));

        for(let i=0;i<latlngs.length-1;i++){
          routeSegments.push({a:latlngs[i], b:latlngs[i+1]});
        }

        const startPt = latlngs[0];
        const label = dir === 'I' ? 'Inbound start' : 'Outbound start';
        L.marker(startPt, {
          icon: L.divIcon({className:'', html:`<div class="end-marker">${label}</div>`, iconSize:null})
        }).addTo(routeLayerGroup);
      });

      currentRouteDirs[dir] = { lines, layers, arrowMarkers: [] };
    });

    if(bounds.length){
      routeBounds = L.latLngBounds(bounds);
      map.fitBounds(routeBounds, {padding:[60,60]});
    }

    document.getElementById('info-title').textContent = routeDisplayLabel(routeName);
    document.getElementById('info-card').classList.add('visible');
    document.getElementById('search-fab-btn').classList.add('visible');
    document.getElementById('live-fab-btn').classList.add('visible');

    rebuildArrowMarkers();
    setupDirectionToggle();
    updateDistanceReadout();
  }

  // Compass bearing in degrees (0 = north, clockwise) from point a to b.
  function computeBearingDeg(a, b){
    const lat1 = a[0]*Math.PI/180, lat2 = b[0]*Math.PI/180;
    const dLon = (b[1]-a[1])*Math.PI/180;
    const y = Math.sin(dLon)*Math.cos(lat2);
    const x = Math.cos(lat1)*Math.sin(lat2) - Math.sin(lat1)*Math.cos(lat2)*Math.cos(dLon);
    return (Math.atan2(y,x)*180/Math.PI + 360) % 360;
  }

  function interpolateLatLng(a, b, t){
    return [a[0] + (b[0]-a[0])*t, a[1] + (b[1]-a[1])*t];
  }

  // Places small rotated chevron markers along a polyline, pointing in the
  // direction of travel, spaced by real-world distance rather than by
  // vertex count (so they land evenly whether the source geometry is
  // sparse or dense).
  // Returns a darker shade of a #rrggbb (or rgb(...)) color, for the arrow
  // markers so they read as a distinct layer on top of the route line
  // rather than blending into it.
  function darkenColor(color, factor){
    let r, g, b;
    const hexMatch = /^#?([0-9a-f]{6})$/i.exec(color);
    if(hexMatch){
      const hex = hexMatch[1];
      r = parseInt(hex.slice(0,2),16);
      g = parseInt(hex.slice(2,4),16);
      b = parseInt(hex.slice(4,6),16);
    }else{
      const rgbMatch = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(color);
      if(!rgbMatch) return color;
      r = +rgbMatch[1]; g = +rgbMatch[2]; b = +rgbMatch[3];
    }
    const clamp = v => Math.max(0, Math.min(255, Math.round(v)));
    r = clamp(r*factor); g = clamp(g*factor); b = clamp(b*factor);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  // Spacing and pixel size for direction arrows at a given map zoom level —
  // fewer and smaller when zoomed out, denser and bigger when zoomed in.
  // Values in between the table entries are linearly interpolated so the
  // transition across zoom steps isn't abrupt.
  const ARROW_ZOOM_TABLE = [
    { zoom: 10, spacing: 3000, size: 10 },
    { zoom: 12, spacing: 1800, size: 12 },
    { zoom: 14, spacing: 950,  size: 16 },
    { zoom: 16, spacing: 550,  size: 20 },
    { zoom: 17, spacing: 400,  size: 22 },
    { zoom: 18, spacing: 300,  size: 25 },
    { zoom: 20, spacing: 180,  size: 30 }
  ];

  function arrowParamsForZoom(zoom){
    const table = ARROW_ZOOM_TABLE;
    if(zoom <= table[0].zoom) return { spacing: table[0].spacing, size: table[0].size };
    if(zoom >= table[table.length-1].zoom) return { spacing: table[table.length-1].spacing, size: table[table.length-1].size };
    for(let i=0;i<table.length-1;i++){
      const a = table[i], b = table[i+1];
      if(zoom >= a.zoom && zoom <= b.zoom){
        const t = (zoom - a.zoom) / (b.zoom - a.zoom);
        return {
          spacing: a.spacing + (b.spacing - a.spacing) * t,
          size: a.size + (b.size - a.size) * t
        };
      }
    }
    return { spacing: 650, size: 22 };
  }

  function addDirectionArrows(latlngs, color, spacingMeters, sizePx){
    const markers = [];
    if(latlngs.length < 2) return markers;

    const cum = [0];
    for(let i=1;i<latlngs.length;i++){
      cum.push(cum[i-1] + haversine(latlngs[i-1][0],latlngs[i-1][1], latlngs[i][0],latlngs[i][1]));
    }
    const total = cum[cum.length-1];
    if(total <= 0) return markers;

    const startOffset = spacingMeters * 0.3;
    const arrowColor = darkenColor(color, 0.6);
    // Triangle proportions match the original 22px design (9px side borders,
    // 19px bottom border) scaled to whatever pixel size this zoom calls for.
    const sideBorder = Math.max(2, Math.round(sizePx * 0.41));
    const bottomBorder = Math.max(4, Math.round(sizePx * 0.86));

    for(let d = startOffset; d < total; d += spacingMeters){
      let idx = 0;
      while(idx < cum.length-2 && cum[idx+1] < d) idx++;
      const segStart = cum[idx], segEnd = cum[idx+1];
      const segLen = segEnd - segStart;
      const t = segLen > 0 ? (d - segStart) / segLen : 0;
      const a = latlngs[idx], b = latlngs[idx+1];
      const pos = interpolateLatLng(a, b, t);
      const bearing = computeBearingDeg(a, b);

      const icon = L.divIcon({
        className: '',
        html: '<div style="width:' + sizePx + 'px;height:' + sizePx + 'px;display:flex;align-items:center;justify-content:center;transform:rotate(' + bearing + 'deg);">' +
              '<div class="route-arrow" style="border-left-width:' + sideBorder + 'px;border-right-width:' + sideBorder + 'px;border-bottom-width:' + bottomBorder + 'px;border-bottom-color:' + arrowColor + ';"></div>' +
              '</div>',
        iconSize: [sizePx, sizePx],
        iconAnchor: [sizePx/2, sizePx/2]
      });
      const marker = L.marker(pos, { icon, interactive:false, keyboard:false, zIndexOffset:200 }).addTo(routeLayerGroup);
      markers.push(marker);
    }
    return markers;
  }

  // Clears and redraws direction arrows for every direction at the current
  // map zoom's spacing/size, then re-applies the active/inactive opacity so
  // the toggle state (and stop-marker dimming) stays correct after a rezoom.
  function rebuildArrowMarkers(){
    const dirs = Object.keys(currentRouteDirs);
    if(!dirs.length) return;

    const { spacing, size } = arrowParamsForZoom(map.getZoom());

    dirs.forEach(dir=>{
      const info = currentRouteDirs[dir];
      (info.arrowMarkers || []).forEach(m => routeLayerGroup.removeLayer(m));
      const color = dir === 'I' ? getComputedColor('--inbound') : getComputedColor('--outbound');
      const newMarkers = [];
      info.lines.forEach(latlngs=>{
        newMarkers.push(...addDirectionArrows(latlngs, color, spacing, size));
      });
      info.arrowMarkers = newMarkers;
    });

    if(activeDirection) applyActiveDirectionStyling();
  }

  map.on('zoomend', rebuildArrowMarkers);

  // ---------- Direction toggle ----------
  function setupDirectionToggle(){
    const wrap = document.getElementById('direction-toggle');
    wrap.innerHTML = '';
    const dirs = Object.keys(currentRouteDirs);

    if(!dirs.length){
      activeDirection = null;
      progressModel = null;
      document.getElementById('progress-block').classList.remove('visible');
      return;
    }

    activeDirection = currentRouteDirs['I'] ? 'I' : dirs[0];

    ['I','O'].forEach(d=>{
      const available = !!currentRouteDirs[d];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dir-btn ' + (d === 'I' ? 'inbound' : 'outbound');
      btn.innerHTML = '<span class="dot-swatch"></span>' + (d === 'I' ? 'Inbound' : 'Outbound');
      btn.disabled = !available;
      if(d === activeDirection) btn.classList.add('active');
      btn.addEventListener('click', ()=> setActiveDirection(d));
      wrap.appendChild(btn);
    });

    applyActiveDirectionStyling();
    buildProgressModel();
    document.getElementById('progress-block').classList.add('visible');
  }

  function setActiveDirection(d){
    if(!currentRouteDirs[d]) return;
    if(d === activeDirection) return;
    activeDirection = d;
    document.querySelectorAll('#direction-toggle .dir-btn').forEach(btn=>{
      const btnDir = btn.classList.contains('inbound') ? 'I' : 'O';
      btn.classList.toggle('active', btnDir === activeDirection);
    });
    applyActiveDirectionStyling();
    buildProgressModel();
    updateDistanceReadout();
    lastArrivalFetch = { stopCode: null, time: 0 }; // force a fresh arrival lookup for the new direction
    refreshLiveBuses();
  }

  function applyActiveDirectionStyling(){
    Object.keys(currentRouteDirs).forEach(d=>{
      const emphasize = d === activeDirection;
      currentRouteDirs[d].layers.forEach(pl=>{
        pl.setStyle({ opacity: emphasize ? 0.95 : 0.3, weight: emphasize ? 6 : 4 });
        if(emphasize) pl.bringToFront();
      });
      (currentRouteDirs[d].arrowMarkers || []).forEach(m=>{
        const el = m.getElement();
        if(el) el.style.opacity = emphasize ? '1' : '0';
      });
    });
    applyStopDirectionStyling();
  }

  // ---------- Along-route progress model ----------
  function buildProgressModel(){
    progressModel = null;
    if(!activeDirection || !currentRouteDirs[activeDirection]) return;

    // Route geometry for a direction often comes as several *disconnected*
    // line pieces (breaks at intersections, via-segments, etc). Each piece
    // is kept separate here — with a running distance offset so "percent
    // along route" still makes sense end-to-end — rather than flattened
    // into one array, which would create a phantom segment bridging the
    // gap between the end of one piece and the start of the next.
    const rawLines = currentRouteDirs[activeDirection].lines.filter(l => l && l.length > 1);
    if(!rawLines.length) return;

    const groups = [];
    let offset = 0;
    rawLines.forEach(points=>{
      const cumDist = [0];
      for(let i=1;i<points.length;i++){
        cumDist.push(cumDist[i-1] + haversine(points[i-1][0],points[i-1][1], points[i][0],points[i][1]));
      }
      groups.push({ points, cumDist, offset });
      offset += cumDist[cumDist.length-1];
    });

    progressModel = { groups, total: offset };
  }

  // Finds the point on the active-direction route nearest to `pos`, and how
  // far along that route (from its start) that point is. Iterates each
  // sub-line's real segments independently — never a phantom segment
  // bridging two disconnected pieces.
  function computeProgress(pos){
    if(!progressModel || !progressModel.groups.length) return null;
    const { groups, total } = progressModel;

    let bestPerp = Infinity, bestAlong = 0;
    const lat0 = pos[0]*Math.PI/180;
    const kx = Math.cos(lat0);

    groups.forEach(g=>{
      const { points, cumDist, offset } = g;
      for(let i=0;i<points.length-1;i++){
        const a = points[i], b = points[i+1];
        const Ax = (a[1]-pos[1])*kx, Ay = (a[0]-pos[0]);
        const Bx = (b[1]-pos[1])*kx, By = (b[0]-pos[0]);
        const ABx = Bx-Ax, ABy = By-Ay;
        const len2 = ABx*ABx + ABy*ABy;
        let t = len2 === 0 ? 0 : ((-Ax*ABx + -Ay*ABy) / len2);
        t = Math.max(0, Math.min(1, t));
        const nx = Ax + ABx*t, ny = Ay + ABy*t;
        const nLon = pos[1] + nx/kx, nLat = pos[0] + ny;
        const perp = haversine(pos[0], pos[1], nLat, nLon);
        if(perp < bestPerp){
          bestPerp = perp;
          const segLen = cumDist[i+1] - cumDist[i];
          bestAlong = offset + cumDist[i] + t*segLen;
        }
      }
    });

    return {
      perpMeters: bestPerp,
      alongMeters: bestAlong,
      totalMeters: total,
      pct: total > 0 ? (bestAlong/total)*100 : 0
    };
  }

  // =====================================================================
  // Live buses — powered by the muni-511-proxy Cloudflare Worker, which
  // holds the 511.org API key server-side. See PROXY_BASE above.
  // =====================================================================
  let liveEnabled = false;
  let liveTimer = null;
  let routeStopsCache = {};              // routeName -> [{name, code, lat, lon}]
  let nearestStopInfo = null;            // {name, code, lat, lon, distMeters}
  let lastArrivalFetch = { stopCode: null, time: 0 };

  // Per 511.org's own spec (see the SIRI examples in their Transit API
  // doc), LineRef for Muni is just the plain route code — "580", "17",
  // "66", etc — with no agency prefix in practice. Some other operators'
  // examples in the same doc *do* use a prefixed form like "SF:66" or
  // "MTA NYCT_B63", so we also check the last colon/underscore/slash
  // -separated segment. Crucially, this is always an *exact* comparison —
  // never a substring/suffix check — because "66".endsWith("6") is true,
  // which previously caused route 6's vehicles to match a route 66
  // selection.
  function matchesRoute(lineRef, routeName){
    if(lineRef == null || !routeName) return false;
    const raw = String(lineRef).trim();
    if(!raw) return false;
    const target = String(routeName).trim().toUpperCase();

    const candidates = new Set([raw.toUpperCase()]);
    const segments = raw.split(/[:_/\s]+/).filter(Boolean);
    if(segments.length) candidates.add(segments[segments.length - 1].toUpperCase());

    return candidates.has(target);
  }

  function directionMatches(directionRef, direction){
    if(!directionRef || !direction) return false;
    const d = String(directionRef).toUpperCase();
    // Covers every DirectionRef form 511.org's own spec examples use for
    // bus routes: "IB"/"OB", "Inbound"/"Outbound", "In"/"Out".
    if(direction === 'I') return d.startsWith('I');
    if(direction === 'O') return d.startsWith('O');
    return false;
  }

  function numOrNull(v){
    if(v == null) return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  }

  function firstNum(obj, keys){
    for(const k of keys){
      const v = obj[k];
      if(v != null && typeof v !== 'object'){
        const n = Number(v);
        if(!isNaN(n)) return n;
      }
    }
    return null;
  }

  function firstStr(obj, keys){
    for(const k of keys){
      const v = obj[k];
      if(typeof v === 'string' && v.trim()) return v.trim();
    }
    return null;
  }

  // 511.org's JSON shapes vary by endpoint/version, so rather than assume
  // one exact path, walk the whole response looking for objects that look
  // like a stop (has lat/lon + a name or code).
  function extractStops(data){
    const found = [];
    const seen = new Set();
    function visit(node){
      if(!node || typeof node !== 'object') return;
      if(Array.isArray(node)){ node.forEach(visit); return; }
      const loc = (node.Location && typeof node.Location === 'object') ? node.Location : node;
      const lat = firstNum(loc, ['Latitude','latitude','Lat','lat']);
      const lon = firstNum(loc, ['Longitude','longitude','Lon','lon','Long']);
      const name = firstStr(node, ['Name','StopName','name','stop_name']);
      const code = firstStr(node, ['Code','StopCode','code','stopcode','Id','id','StopId','stop_id']);
      if(lat != null && lon != null && (name || code)){
        const key = (code||'') + '|' + lat.toFixed(5) + ',' + lon.toFixed(5);
        if(!seen.has(key)){
          seen.add(key);
          found.push({ name: name || code || 'Stop', code: code || name, lat, lon });
        }
      }
      Object.values(node).forEach(visit);
    }
    visit(data);
    return found;
  }

  // Same idea for MonitoredVehicleJourney entries — used by both
  // StopMonitoring (arrival predictions) and VehicleMonitoring (positions).
  // 511.org's SIRI-derived JSON sometimes represents a ref as a plain
  // string ("IB") and sometimes as an object with a .ref property
  // ({"ref": "IB"}, mirroring the XML <DirectionRef ref="IB"/> form seen
  // elsewhere in their spec). Normalize both to a plain string so
  // matching logic never silently fails against an unexpected shape.
  function refValue(x){
    if(x == null) return null;
    if(typeof x === 'string') return x;
    if(typeof x === 'number') return String(x);
    if(typeof x === 'object' && typeof x.ref === 'string') return x.ref;
    return null;
  }

  function extractJourneys(data){
    const out = [];
    function visit(node){
      if(!node || typeof node !== 'object') return;
      if(Array.isArray(node)){ node.forEach(visit); return; }
      const mvj = node.MonitoredVehicleJourney || ((node.LineRef && (node.MonitoredCall || node.VehicleLocation)) ? node : null);
      if(mvj && mvj.LineRef){
        const call = mvj.MonitoredCall || {};
        const loc = mvj.VehicleLocation || {};
        out.push({
          lineRef: refValue(mvj.LineRef),
          directionRef: refValue(mvj.DirectionRef),
          destination: mvj.DestinationName || mvj.PublishedLineName || '',
          expected: call.ExpectedArrivalTime || null,
          aimed: call.AimedArrivalTime || null,
          stopName: call.StopPointName || null,
          lat: numOrNull(loc.Latitude),
          lon: numOrNull(loc.Longitude)
        });
      } else {
        Object.values(node).forEach(visit);
      }
    }
    visit(data);
    return out;
  }

  async function fetchProxyJSON(path, params){
    const url = new URL(PROXY_BASE);
    url.searchParams.set('path', path);
    Object.keys(params || {}).forEach(k => url.searchParams.set(k, params[k]));
    const res = await fetch(url.toString());
    if(!res.ok){
      const detail = await res.text().catch(()=> '');
      throw new Error('proxy ' + path + ' failed (' + res.status + ')' + (detail ? ': ' + detail.slice(0,200) : ''));
    }
    return res.json();
  }

  async function ensureStopsForRoute(routeName){
    if(routeStopsCache[routeName]) return routeStopsCache[routeName];
    const data = await fetchProxyJSON('stops', { operator_id: 'SF', line_id: routeName });
    const stops = extractStops(data);
    routeStopsCache[routeName] = stops;
    return stops;
  }

  // Picks the stop nearest the user, biased toward stops that actually sit
  // close to the currently-drawn (active-direction) route line — since
  // inbound/outbound often run on different streets a block apart, this
  // keeps us from picking a same-name stop on the wrong side of the route.
  // ---------- Direction-specific stop list, straight from 511's Patterns API ----------
  // Rather than inferring direction from our own drawn route line, this asks
  // 511 directly which stops belong to which direction of a route — the
  // Patterns API returns each direction's ordered stop sequence. See
  // https://511.org (SF Bay Open Data Specification - Transit) section on
  // the Patterns API for the response shape this parses.
  let routeDirectionStopIdsCache = {}; // "routeName|I" or "routeName|O" -> Set of stop ids, or null if unknown

  // {DirectionId: "Inbound"/"Outbound"/etc} from the top-level "directions" list.
  function extractPatternDirectionNames(data){
    const map = {};
    function visit(node){
      if(!node || typeof node !== 'object') return;
      if(Array.isArray(node)){ node.forEach(visit); return; }
      if(node.DirectionId != null && typeof node.Name === 'string'){
        map[String(refValue(node.DirectionId) ?? node.DirectionId)] = node.Name;
      }
      Object.values(node).forEach(visit);
    }
    visit(data);
    return map;
  }

  // Each journey pattern: { directionRef, lineRef, stopIds: [...] }
  function extractJourneyPatterns(data){
    const out = [];
    function toStopIds(points){
      return points
        .map(p => refValue(p.ScheduledStopPointRef) ?? (p.ScheduledStopPointRef != null ? String(p.ScheduledStopPointRef) : null))
        .filter(Boolean)
        .map(String);
    }
    function visit(node){
      if(!node || typeof node !== 'object') return;
      if(Array.isArray(node)){ node.forEach(visit); return; }
      const seq = node.PointsInSequence;
      if(node.DirectionRef != null && seq && typeof seq === 'object'){
        const timingPts = Array.isArray(seq.TimingPointInJourneyPattern) ? seq.TimingPointInJourneyPattern : [];
        const stopPts = Array.isArray(seq.StopPointInJourneyPattern) ? seq.StopPointInJourneyPattern : [];
        // Both arrays can carry real, sometimes non-overlapping, stops for
        // the pattern — union them rather than only using whichever one
        // happens to be non-empty.
        const stopIds = Array.from(new Set([...toStopIds(timingPts), ...toStopIds(stopPts)]));
        out.push({
          directionRef: String(refValue(node.DirectionRef) ?? node.DirectionRef),
          lineRef: refValue(node.LineRef),
          stopIds
        });
      } else {
        Object.values(node).forEach(visit);
      }
    }
    visit(data);
    return out;
  }

  // Returns a Set of stop ids belonging to `direction` ('I'/'O') for this
  // route, per 511's Patterns API — or null if that couldn't be determined
  // (caller should fall back to the full stop list in that case).
  let routePatternsCache = {}; // routeName -> { dirNames, patterns } | null

  async function ensureRoutePatterns(routeName){
    if(routeName in routePatternsCache) return routePatternsCache[routeName];

    let result = null;
    try{
      const data = await fetchProxyJSON('patterns', { operator_id: 'SF', line_id: routeName });
      const dirNames = extractPatternDirectionNames(data); // {DirectionId: Name}
      const patterns = extractJourneyPatterns(data)
        .filter(p => !p.lineRef || matchesRoute(p.lineRef, routeName));
      console.log('[muni-walker] patterns for route ' + routeName + ':', patterns.length, 'directions:', dirNames);
      result = { dirNames, patterns };
    }catch(e){
      console.warn('[muni-walker] Patterns API lookup failed:', e);
      result = null;
    }

    routePatternsCache[routeName] = result;
    return result;
  }

  async function ensureDirectionStopIds(routeName, direction){
    const cacheKey = routeName + '|' + direction;
    if(cacheKey in routeDirectionStopIdsCache) return routeDirectionStopIdsCache[cacheKey];

    const routeInfo = await ensureRoutePatterns(routeName);
    let result = null;

    if(routeInfo){
      const { dirNames, patterns } = routeInfo;
      // Prefer matching by the human-readable direction name ("Inbound"/
      // "Outbound") from the top-level directions list; fall back to
      // matching the DirectionRef text itself for feeds that skip names.
      let targetIds = Object.keys(dirNames).filter(id=>{
        const name = dirNames[id].toUpperCase();
        return direction === 'I' ? name.startsWith('IN') : name.startsWith('OUT');
      });
      let relevant = targetIds.length
        ? patterns.filter(p => targetIds.includes(p.directionRef))
        : patterns.filter(p => directionMatches(p.directionRef, direction));

      const idSet = new Set();
      relevant.forEach(p => p.stopIds.forEach(id => idSet.add(id)));
      console.log('[muni-walker] direction ' + direction + ' stop count for route ' + routeName + ':', idSet.size);
      result = idSet.size ? idSet : null;
    }

    routeDirectionStopIdsCache[cacheKey] = result;
    return result;
  }

  // Plain nearest-by-distance — no route-line geometry involved. Direction
  // filtering already happened via ensureDirectionStopIds, so this just
  // picks whichever of the (already direction-filtered) candidate stops is
  // physically closest to the user.
  function pickNearestStop(stops, userPos){
    if(!stops || !stops.length || !userPos) return null;
    let best = null, bestDist = Infinity;
    stops.forEach(s=>{
      const d = haversine(userPos[0], userPos[1], s.lat, s.lon);
      if(d < bestDist){ bestDist = d; best = s; }
    });
    if(!best) return null;
    console.log('[muni-walker] nearest stop for ' + activeDirection + ':', best.name, best.code, { toUser_m: Math.round(bestDist) });
    return { ...best, distMeters: bestDist };
  }

  async function fetchNextArrivals(stopCode, routeName, direction){
    console.log('[muni-walker] fetching StopMonitoring for stopcode=' + stopCode + ' direction=' + direction);
    const data = await fetchProxyJSON('StopMonitoring', { agency: 'SF', stopcode: stopCode });
    const now = Date.now();
    const journeys = extractJourneys(data)
      .filter(j => matchesRoute(j.lineRef, routeName))
      .map(j => {
        const arrivalIso = j.expected || j.aimed;
        const mins = arrivalIso ? Math.round((new Date(arrivalIso).getTime() - now) / 60000) : null;
        return { ...j, mins };
      })
      .filter(j => j.mins !== null)
      .sort((a,b) => a.mins - b.mins);

    const dirMatches = journeys.filter(j => directionMatches(j.directionRef, direction));
    return { arrivals: dirMatches.length ? dirMatches : journeys, directionKnown: dirMatches.length > 0 };
  }

  async function refreshVehiclePositions(routeName){
    try{
      const data = await fetchProxyJSON('VehicleMonitoring', { agency: 'SF' });
      const vehicles = extractJourneys(data).filter(v => matchesRoute(v.lineRef, routeName) && v.lat != null && v.lon != null);
      busLayerGroup.clearLayers();
      vehicles.forEach(v=>{
        const dirClass = directionMatches(v.directionRef, 'O') ? 'O' : 'I';
        const icon = L.divIcon({
          className: '',
          html: '<div class="bus-marker ' + dirClass + '" title="' + friendlyName(routeName) + '">' + BUS_ICON_SVG + '</div>',
          iconSize: [24,24]
        });
        L.marker([v.lat, v.lon], { icon, zIndexOffset: 900 }).addTo(busLayerGroup);
      });
    }catch(e){
      console.warn('Live vehicle positions unavailable:', e);
    }
  }

  let stopMarkersDrawnForRoute = null;

  // Draws every stop for the route, color-coded to match the route lines:
  // blue for inbound, red for outbound (using the same direction-specific
  // stop-id sets, from 511's Patterns API, that now drive nearest-stop
  // selection). A stop belonging to both directions' patterns — which does
  // happen at some shared/terminal stops — gets a small half-and-half
  // marker rather than being arbitrarily assigned to one color.
  let stopMarkersInfo = []; // [{ marker, isIn, isOut }] — used to dim/emphasize stops on direction toggle
  let nearestStopHighlightMarker = null; // slowly-pulsing ring drawn over the nearest stop while live buses are on

  // Draws (or removes) the pulsing ring over nearestStopInfo. Lives in its
  // own layer group so refreshStopMarkers()'s stopLayerGroup.clearLayers()
  // (run every time the stop list is rebuilt) doesn't wipe it out.
  function updateNearestStopHighlight(){
    if(nearestStopHighlightMarker){
      nearestStopLayerGroup.removeLayer(nearestStopHighlightMarker);
      nearestStopHighlightMarker = null;
    }
    if(!liveEnabled || !nearestStopInfo) return;
    const dirClass = activeDirection === 'I' ? ' I' : '';
    const icon = L.divIcon({
      className: '',
      html: '<div class="stop-highlight-ring' + dirClass + '"></div>',
      iconSize: [22,22],
      iconAnchor: [11,11]
    });
    nearestStopHighlightMarker = L.marker([nearestStopInfo.lat, nearestStopInfo.lon], {
      icon, interactive: false, keyboard: false, zIndexOffset: 90
    }).addTo(nearestStopLayerGroup);
  }

  async function refreshStopMarkers(routeName){
    try{
      const stops = await ensureStopsForRoute(routeName);
      if(!stops.length) return;

      const [inboundIds, outboundIds] = await Promise.all([
        ensureDirectionStopIds(routeName, 'I'),
        ensureDirectionStopIds(routeName, 'O')
      ]);

      stopLayerGroup.clearLayers();
      stopMarkersInfo = [];

      stops.forEach(s=>{
        const code = String(s.code);
        const isIn = inboundIds && inboundIds.has(code);
        const isOut = outboundIds && outboundIds.has(code);

        let html, size;
        if(isIn && isOut){
          html = '<div style="width:12px;height:12px;border-radius:50%;overflow:hidden;display:flex;border:2px solid #0b0d10;box-shadow:0 1px 4px rgba(0,0,0,.5);">' +
                 '<div style="width:50%;background:var(--inbound);"></div>' +
                 '<div style="width:50%;background:var(--outbound);"></div>' +
                 '</div>';
          size = [12,12];
        }else{
          const cls = isIn ? 'I' : (isOut ? 'O' : 'unknown');
          html = '<div class="stop-dot ' + cls + '"></div>';
          size = [10,10];
        }

        const icon = L.divIcon({ className: '', html, iconSize: size, iconAnchor: [size[0]/2, size[1]/2] });
        const marker = L.marker([s.lat, s.lon], { icon, interactive: false, keyboard: false, zIndexOffset: 100 })
          .bindTooltip(s.name, { direction: 'top', offset: [0,-6] })
          .addTo(stopLayerGroup);

        stopMarkersInfo.push({ marker, isIn, isOut });
      });

      applyStopDirectionStyling();
    }catch(e){
      console.warn('[muni-walker] Could not draw stop markers:', e);
    }
  }

  // Dims stops that don't belong to the active direction, matching the
  // opacity treatment already used for the route line itself (0.95 active /
  // 0.3 inactive). Stops serving both directions, and stops we couldn't
  // classify at all, are left at full opacity rather than guessed at.
  function applyStopDirectionStyling(){
    stopMarkersInfo.forEach(({ marker, isIn, isOut })=>{
      const el = marker.getElement();
      if(!el) return;
      const belongsToOther = (activeDirection === 'I' && isOut && !isIn) || (activeDirection === 'O' && isIn && !isOut);
      el.style.opacity = belongsToOther ? '0.3' : '0.95';
    });
  }

  function renderLiveStatus(text){
    const el = document.getElementById('live-status');
    el.textContent = text || '';
    el.classList.toggle('visible', !!text);
  }

  function renderLiveArrival(stop, arrivals, directionKnown){
    const card = document.getElementById('live-arrival');
    const minsEl = document.getElementById('live-arrival-mins');
    const unitEl = document.getElementById('live-arrival-unit');
    const stopEl = document.getElementById('live-arrival-stop');
    const label = document.getElementById('live-arrival-label');

    if(!stop || !arrivals || !arrivals.length){
      card.classList.remove('visible');
      renderLiveList([]);
      updateInfoSummary();
      return;
    }

    card.classList.add('visible');
    label.textContent = 'Next ' + (activeDirection === 'I' ? 'Inbound' : 'Outbound') + ' arrival';

    const soonest = arrivals[0];
    if(soonest.mins <= 0){
      minsEl.textContent = 'due';
      unitEl.textContent = '';
    }else{
      minsEl.textContent = soonest.mins;
      unitEl.textContent = soonest.mins === 1 ? 'min' : 'min';
    }
    const distMi = (stop.distMeters / 1609.344).toFixed(1);
    stopEl.textContent = stop.name + ' · ' + distMi + ' mi walk';

    renderLiveList(arrivals.slice(1, 4));
    updateInfoSummary();
  }

  function renderLiveList(arrivals){
    const list = document.getElementById('live-list');
    if(!arrivals || !arrivals.length){
      list.classList.remove('visible');
      list.textContent = '';
      return;
    }
    list.classList.add('visible');
    const text = arrivals.map(a => a.mins <= 0 ? 'due' : (a.mins + ' min')).join(', ');
    list.textContent = 'Then: ' + text;
  }

  async function refreshLiveBuses(){
    if(!liveEnabled || !currentRouteName || !activeDirection){
      renderLiveStatus('');
      renderLiveArrival(null, null, false);
      busLayerGroup.clearLayers();
      stopLayerGroup.clearLayers();
      stopMarkersDrawnForRoute = null;
      stopMarkersInfo = [];
      nearestStopInfo = null;
      updateNearestStopHighlight();
      return;
    }

    if(!lastPos){
      renderLiveStatus('Turn on GPS to find your nearest stop.');
      renderLiveArrival(null, null, false);
    }

    refreshVehiclePositions(currentRouteName);

    if(stopMarkersDrawnForRoute !== currentRouteName){
      stopMarkersDrawnForRoute = currentRouteName;
      refreshStopMarkers(currentRouteName);
    }

    if(!lastPos) return;

    try{
      renderLiveStatus('Finding your nearest stop…');
      const stops = await ensureStopsForRoute(currentRouteName);
      if(!stops.length){
        renderLiveStatus("Couldn't find stops for this route from 511.org.");
        nearestStopInfo = null;
        updateNearestStopHighlight();
        return;
      }

      const dirStopIds = await ensureDirectionStopIds(currentRouteName, activeDirection);
      let candidateStops = stops;
      if(dirStopIds){
        const filtered = stops.filter(s => dirStopIds.has(String(s.code)));
        if(filtered.length){
          candidateStops = filtered;
        }else{
          console.warn('[muni-walker] direction-specific stop ids matched none of the fetched stops; using the full stop list instead');
        }
      }

      const stop = pickNearestStop(candidateStops, lastPos);
      if(!stop){
        renderLiveStatus("Couldn't determine your nearest stop.");
        nearestStopInfo = null;
        updateNearestStopHighlight();
        return;
      }
      nearestStopInfo = stop;
      updateNearestStopHighlight();

      const now = Date.now();
      const stale = stop.code !== lastArrivalFetch.stopCode || (now - lastArrivalFetch.time) > 30000;
      if(stale){
        renderLiveStatus('Checking arrivals at ' + stop.name + '…');
        const { arrivals, directionKnown } = await fetchNextArrivals(stop.code, currentRouteName, activeDirection);
        lastArrivalFetch = { stopCode: stop.code, time: now };
        renderLiveStatus('');
        renderLiveArrival(stop, arrivals, directionKnown);
      }
    }catch(e){
      console.warn('Live buses error:', e);
      renderLiveStatus("Couldn't reach the live bus proxy. Check the Worker is deployed and reachable.");
      renderLiveArrival(null, null, false);
    }
  }

  function setLiveEnabled(on){
    liveEnabled = on;
    document.getElementById('live-toggle').classList.toggle('on', on);
    if(liveTimer){ clearInterval(liveTimer); liveTimer = null; }

    if(on){
      refreshLiveBuses();
      liveTimer = setInterval(refreshLiveBuses, 45000);
    }else{
      renderLiveStatus('');
      renderLiveArrival(null, null, false);
      busLayerGroup.clearLayers();
      stopLayerGroup.clearLayers();
      stopMarkersDrawnForRoute = null;
      stopMarkersInfo = [];
      nearestStopInfo = null;
      updateNearestStopHighlight();
    }
  }

  document.getElementById('live-toggle').addEventListener('click', ()=> setLiveEnabled(!liveEnabled));

  function setPirateMode(on){
    pirateMode = on;
    document.getElementById('pirate-toggle').classList.toggle('on', on);
  }

  document.getElementById('pirate-toggle').addEventListener('click', ()=> setPirateMode(!pirateMode));

  // =====================================================================
  // "Find ___ along the route" — AI-assisted point-of-interest search.
  //
  // Pipeline: free text -> AI proxy turns it into OpenStreetMap tag filters
  // -> Overpass API (real, keyless OSM data) returns candidate places in a
  // box around the route. For historical-type searches, three more keyless
  // sources are queried over the same area and merged in, each deduped
  // against what's already found (see isHistoricalPlan/isDuplicateOfCandidate
  // below): Wikipedia's own geosearch (fetchWikipediaArticlesInBBox), San
  // Francisco's official Article 10 Designated Landmarks registry
  // (fetchSfDesignatedLandmarks), and the National Register of Historic
  // Places (fetchNrhpListingsInBBox) — since OSM's historic tagging alone
  // skews toward monuments/plaques. Candidates are then filtered down to
  // those actually within 1/4 mile of the drawn route line -> ranked
  // (visitor rating first when OSM has one, then closeness as the "best
  // match" tiebreaker — distance from the user's current location when
  // they're along the route, otherwise distance from the route line
  // itself) -> the top 20 are plotted, with a "Show more" button to
  // reveal the next 20 from the ranked list without re-querying -> AI proxy
  // writes a richer description for each OSM/SF-landmark/NRHP result,
  // looking places up when useful (Wikipedia-sourced results already
  // carry their own summary, so they skip this step). The AI never
  // invents a location: coordinates and addresses always come straight
  // from OpenStreetMap, Wikipedia, DataSF, or the National Park Service.
  // =====================================================================
  const POI_RADIUS_METERS = 0.25 * 1609.344; // quarter mile
  const POI_MAX_RESULTS = 20;                // cap on markers plotted
  const PROGRESS_VISIBILITY_RADIUS_METERS = 0.5 * 1609.344; // half a mile — also used to decide the user is "on" the route for ahead-of-you filtering

  let poiSearchToken = 0; // bumped to invalidate stale in-flight searches

  // AI descriptions are written on demand (via a "Tell me more" button in
  // each popup) rather than for every plotted point up front — most pins a
  // user taps into never get opened, so describing all of them eagerly
  // burned tokens on descriptions nobody reads. These track enough state to
  // fetch one on click: which query produced the currently-shown results,
  // and each candidate's name/tags (describe needs both, and by the time
  // someone clicks, `candidates` from runPoiSearch is long out of scope).
  let poiDescribeQuery = '';
  let poiCandidatesById = {};

  // When on, AI-written descriptions (and the local fallback used when the
  // AI proxy is unreachable) are requested/rendered in a pirate's voice.
  let pirateMode = false;

  // Full ranked result list for the current search (can be much longer than
  // what's plotted) plus how many of it are currently shown as markers, so
  // the "Show more" button can reveal the next batch without re-querying.
  let poiRankedPool = [];
  let poiShownCount = 0;

  function poiDescElementId(id){
    return 'poi-desc-' + String(id).replace(/[^a-zA-Z0-9_-]/g, '-');
  }

  async function fetchAIProxyJSON(action, payload){
    let res;
    try{
      res = await fetch(AI_PROXY_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload })
      });
    }catch(e){
      // fetch() itself threw — a real network/DNS failure, distinct from an
      // HTTP error response the worker sent back on purpose.
      throw new Error("Couldn't reach the AI search Worker. Is it deployed, and does AI_PROXY_BASE in js/app.js point at it?");
    }
    if(!res.ok){
      // The worker sends a plain-English {error} for expected conditions
      // (rate limited, origin rejected, etc) — surface that directly rather
      // than a generic "is it deployed?" message when we have it.
      let message = 'AI search proxy ' + action + ' failed (' + res.status + ')';
      try{
        const data = await res.json();
        if(data && data.error) message = data.error;
      }catch(e){ /* non-JSON error body — keep the generic message */ }
      throw new Error(message);
    }
    return res.json();
  }

  function sleep(ms){ return new Promise(resolve => setTimeout(resolve, ms)); }

  // Overpass's public instances shed load with a 504 (and occasionally
  // 429/502/503) that comes back as an HTML error page rather than JSON.
  // Retry those transiently on the same endpoint with backoff, and if an
  // endpoint keeps failing move on to the next mirror in OVERPASS_ENDPOINTS
  // before finally surfacing a plain-English error instead of the raw HTML.
  async function fetchOverpass(query){
    const attemptsPerEndpoint = 2;
    let lastStatus = null;
    for(let e = 0; e < OVERPASS_ENDPOINTS.length; e++){
      const endpoint = OVERPASS_ENDPOINTS[e];
      for(let attempt = 0; attempt < attemptsPerEndpoint; attempt++){
        let res;
        try{
          res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'data=' + encodeURIComponent(query)
          });
        }catch(err){
          lastStatus = null;
          break; // network failure — no point retrying the same endpoint, try the next mirror
        }
        if(res.ok){
          const data = await res.json();
          return Array.isArray(data.elements) ? data.elements : [];
        }
        lastStatus = res.status;
        if(!OVERPASS_RETRY_STATUSES.has(res.status)) break; // not a transient failure — no point retrying
        const isLastAttempt = e === OVERPASS_ENDPOINTS.length - 1 && attempt === attemptsPerEndpoint - 1;
        if(!isLastAttempt) await sleep(1000 * Math.pow(2, attempt));
      }
    }
    throw new Error(
      lastStatus
        ? "OpenStreetMap's search service is busy right now (" + lastStatus + "). Please try again in a moment."
        : "Couldn't reach OpenStreetMap's search service. Check your connection and try again."
    );
  }

  function escapeOverpassString(s){
    return String(s).replace(/["\\]/g, '\\$&');
  }

  // groups: OR of AND-groups of {key,value} tag filters, from the AI proxy's
  // 'interpret' response. bbox: {south,west,north,east}.
  function buildOverpassQuery(groups, bbox){
    const bboxStr = bbox.south + ',' + bbox.west + ',' + bbox.north + ',' + bbox.east;
    const clauses = groups.map(group=>{
      const tagClauses = group.map(f=>{
        if(!f || !f.key) return '';
        if(!f.value || f.value === '*') return '["' + escapeOverpassString(f.key) + '"]';
        return '["' + escapeOverpassString(f.key) + '"="' + escapeOverpassString(f.value) + '"]';
      }).join('');
      return '  nwr' + tagClauses + '(' + bboxStr + ');';
    }).join('\n');
    return '[out:json][timeout:25];\n(\n' + clauses + '\n);\nout center 100;';
  }

  // True when the AI proxy's interpret plan is historical in nature (see
  // the "favor historic=*" guidance in worker/ai-search-worker.js) — the
  // signal to also check Wikipedia rather than relying on OSM tags alone.
  function isHistoricalPlan(plan){
    return (plan.queries || []).some(group =>
      (group || []).some(f => f && (f.key === 'historic' || f.key === 'heritage'))
    );
  }

  const WIKIPEDIA_MAX_RESULTS = 40;

  // bbox: {south,west,north,east}, same shape as routeBBoxPadded()'s output.
  // Returns [{id, name, lat, lon, extract}] — extract is Wikipedia's own
  // intro summary (already written, no AI call needed to use it).
  async function fetchWikipediaArticlesInBBox(bbox){
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      origin: '*',
      generator: 'geosearch',
      ggsbbox: [bbox.north, bbox.west, bbox.south, bbox.east].join('|'),
      ggslimit: String(WIKIPEDIA_MAX_RESULTS),
      prop: 'coordinates|extracts',
      exintro: '1',
      explaintext: '1',
      exchars: '400', // matches the AI proxy's own <=400-char target for describe, for a consistent popup length
      exlimit: 'max'
    });
    const res = await fetch(WIKIPEDIA_GEOSEARCH_ENDPOINT + '?' + params.toString());
    if(!res.ok){
      const detail = await res.text().catch(()=> '');
      throw new Error('Wikipedia geosearch failed (' + res.status + ')' + (detail ? ': ' + detail.slice(0,200) : ''));
    }
    const data = await res.json();
    const pages = (data.query && data.query.pages) || {};
    return Object.values(pages)
      .map(p=>{
        const coord = Array.isArray(p.coordinates) ? p.coordinates[0] : null;
        if(!coord || !p.title) return null;
        return { id: 'wikipedia/' + p.pageid, name: p.title, lat: coord.lat, lon: coord.lon, extract: (p.extract || '').trim() };
      })
      .filter(Boolean);
  }

  // Skip an item (a Wikipedia article or SF landmark row) that's almost
  // certainly the same real-world place as a candidate already found from
  // another source (either OSM links straight to it via a wikipedia tag,
  // or they're right on top of each other with a matching name) so the
  // same landmark doesn't get two pins.
  function isDuplicateOfCandidate(item, existingCandidates){
    const normalize = s => String(s || '').toLowerCase().replace(/^[a-z]{2,3}:/, '').trim();
    const itemName = normalize(item.name);
    return existingCandidates.some(c=>{
      const wikiTag = normalize(c.tags && c.tags.wikipedia);
      if(wikiTag && wikiTag === itemName) return true;
      return normalize(c.name) === itemName && haversine(c.lat, c.lon, item.lat, item.lon) < 75;
    });
  }

  const SF_LANDMARKS_ENDPOINT = "https://data.sfgov.org/resource/97yj-54sx.json";
  const SF_LANDMARKS_ROW_CAP = 2000; // headroom above the ~300-400 landmarks the city has actually designated

  // The city's own Article 10 Designated Landmarks registry (DataSF
  // resource 97yj-54sx) — the most authoritative historic-site source
  // available, and the only one of the three that comes with a link to
  // the actual designation report. It's small enough (a few hundred rows
  // citywide) to fetch whole and filter down to the route locally, the
  // same way the other two sources end up filtered.
  //
  // Each row's `the_geom` is a building-footprint polygon, not a point —
  // buildOverpassQuery/fetchWikipediaArticlesInBBox both key off a single
  // lat/lon, so landmarkCentroid() below approximates one by averaging
  // the footprint's corners, which is accurate enough at building scale
  // for dropping a pin.
  function landmarkCentroid(geom){
    if(!geom || !Array.isArray(geom.coordinates)) return null;
    const ring = geom.type === 'MultiPolygon' ? (geom.coordinates[0] && geom.coordinates[0][0])
      : geom.type === 'Polygon' ? geom.coordinates[0]
      : null;
    if(!Array.isArray(ring) || !ring.length) return null;
    let sumLat = 0, sumLon = 0, n = 0;
    ring.forEach(pt=>{
      if(Array.isArray(pt) && pt.length >= 2 && isFinite(pt[0]) && isFinite(pt[1])){
        sumLon += pt[0]; sumLat += pt[1]; n++;
      }
    });
    return n ? { lat: sumLat / n, lon: sumLon / n } : null;
  }

  // Returns [{id, name, lat, lon, address, landmarkNo, year, docUrl}].
  async function fetchSfDesignatedLandmarks(){
    const params = new URLSearchParams({
      $limit: String(SF_LANDMARKS_ROW_CAP),
      $select: 'the_geom,name,address,landmarkno,yeardesignated,designationdocument'
    });
    const res = await fetch(SF_LANDMARKS_ENDPOINT + '?' + params.toString());
    if(!res.ok){
      const detail = await res.text().catch(()=> '');
      throw new Error('SF landmark registry request failed (' + res.status + ')' + (detail ? ': ' + detail.slice(0,200) : ''));
    }
    const rows = await res.json();
    return rows.map(row=>{
      const centroid = landmarkCentroid(row.the_geom);
      if(!centroid || !row.name) return null;
      const year = parseInt(row.yeardesignated, 10);
      return {
        id: 'sf-landmark/' + (row.landmarkno || row.name),
        name: row.name,
        lat: centroid.lat,
        lon: centroid.lon,
        address: row.address || null,
        landmarkNo: row.landmarkno || null,
        year: isFinite(year) ? year : null,
        docUrl: (row.designationdocument && row.designationdocument.url) || null
      };
    }).filter(Boolean);
  }

  const NRHP_ENDPOINT = "https://mapservices.nps.gov/arcgis/rest/services/cultural_resources/nrhp_locations/MapServer/0/query";

  // The National Register of Historic Places — NPS's own keyless point
  // layer, the federal counterpart to the SF landmark registry above. It
  // covers sites that are nationally significant but were never put
  // through the city's own Article 10 process (and vice versa), so it's
  // queried and deduped the same way, not as a replacement. It's a
  // nationwide dataset, so unlike the SF registry this is queried by bbox
  // like Overpass/Wikipedia rather than fetched whole. Each listing links
  // to its actual nomination form on NPGallery — the same kind of
  // primary-source documentation the SF registry provides via its
  // designation report.
  //
  // bbox: {south,west,north,east}, same shape as routeBBoxPadded()'s output.
  // Returns [{id, name, lat, lon, address, refNum, year, docUrl}].
  async function fetchNrhpListingsInBBox(bbox){
    const params = new URLSearchParams({
      where: '1=1',
      geometry: [bbox.west, bbox.south, bbox.east, bbox.north].join(','),
      geometryType: 'esriGeometryEnvelope',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: 'NRIS_Refnum,RESNAME,Address,CertDate',
      outSR: '4326',
      returnGeometry: 'true',
      f: 'geojson'
    });
    const res = await fetch(NRHP_ENDPOINT + '?' + params.toString());
    if(!res.ok){
      const detail = await res.text().catch(()=> '');
      throw new Error('National Register request failed (' + res.status + ')' + (detail ? ': ' + detail.slice(0,200) : ''));
    }
    const data = await res.json();
    const features = (data && data.features) || [];
    return features.map(f=>{
      const p = f.properties || {};
      const coords = f.geometry && f.geometry.coordinates;
      if(!Array.isArray(coords) || coords.length < 2 || !p.RESNAME) return null;
      const refNum = p.NRIS_Refnum ? String(p.NRIS_Refnum).trim() : null;
      const listedDate = p.CertDate != null ? new Date(p.CertDate) : null;
      const year = listedDate && isFinite(listedDate.getTime()) ? listedDate.getFullYear() : null;
      return {
        id: 'nrhp/' + (refNum || p.RESNAME),
        name: p.RESNAME,
        lat: coords[1],
        lon: coords[0],
        address: p.Address || null,
        refNum,
        year,
        docUrl: refNum ? 'https://npgallery.nps.gov/NRHP/GetAsset/NRHP/' + refNum + '_text' : null
      };
    }).filter(Boolean);
  }

  // Route bounds padded out by the search radius (plus a little slack) so
  // Overpass results near the edge of the drawn route aren't clipped before
  // the real point-to-route distance filter runs.
  function routeBBoxPadded(){
    if(!routeBounds) return null;
    const padMeters = POI_RADIUS_METERS + 150;
    const south = routeBounds.getSouth(), north = routeBounds.getNorth();
    const west = routeBounds.getWest(), east = routeBounds.getEast();
    const midLat = (south + north) / 2;
    const latPad = padMeters / 111320;
    const lonPad = padMeters / (111320 * Math.cos(midLat * Math.PI / 180));
    return { south: south - latPad, north: north + latPad, west: west - lonPad, east: east + lonPad };
  }

  // Nearest distance from pos to any segment of the currently-drawn route
  // (both directions), reusing the same point-to-segment math as the
  // distance-to-route readout.
  function distanceToRouteMeters(pos){
    if(!routeSegments.length) return Infinity;
    let best = Infinity;
    for(let i=0;i<routeSegments.length;i++){
      const seg = routeSegments[i];
      const np = nearestPointOnSegment(pos, seg.a, seg.b);
      const d = haversine(pos[0], pos[1], np[0], np[1]);
      if(d < best) best = d;
    }
    return best;
  }

  const POI_ICON_RULES = [
    { test: t => /restaurant|fast_food|food_court/.test(t.amenity||''), icon:'🍴' },
    { test: t => /cafe/.test(t.amenity||''), icon:'☕' },
    { test: t => /bar|pub|nightclub/.test(t.amenity||''), icon:'🍺' },
    { test: t => t.amenity === 'place_of_worship', icon:'⛪' },
    { test: t => !!t.shop, icon:'🛍️' },
    { test: t => t.tourism === 'museum', icon:'🏛️' },
    { test: t => !!t.tourism, icon:'📷' },
    { test: t => !!t.historic, icon:'🏺' },
    { test: t => t.leisure === 'park' || t.leisure === 'garden', icon:'🌳' },
    { test: t => !!t.leisure, icon:'🎡' }
  ];
  function iconForTags(tags){
    for(const rule of POI_ICON_RULES){ if(rule.test(tags)) return rule.icon; }
    return '📍';
  }

  function formatAddress(tags){
    if(!tags) return null;
    const num = tags['addr:housenumber'];
    const street = tags['addr:street'];
    const city = tags['addr:city'] || 'San Francisco';
    let line = null;
    if(num && street) line = num + ' ' + street;
    else if(street) line = street;
    if(!line) return null;
    return line + ', ' + city;
  }

  // OSM occasionally carries a visitor-facing rating (mostly `stars` on
  // lodging, sometimes a plain `rating`) — pull it out if present.
  function extractRating(tags){
    if(!tags) return null;
    const raw = tags.stars != null ? tags.stars : tags.rating;
    const n = parseFloat(raw);
    return isNaN(n) ? null : n;
  }

  // Ranks candidates for the top-20 cutoff: places with a visitor rating
  // sort to the front (highest first), everything else follows in
  // best-match order (closest to the route first).
  function rankCandidates(list){
    return list.slice().sort((a,b)=>{
      const ra = extractRating(a.tags), rb = extractRating(b.tags);
      if(ra != null && rb != null) return rb - ra || (a.distMeters - b.distMeters);
      if(ra != null) return -1;
      if(rb != null) return 1;
      return a.distMeters - b.distMeters;
    });
  }

  // ---------- Chain / franchise filtering ----------
  // The "find ___" search favors local, independent places. When a search
  // turns up more than a screenful of results, national/regional chains are
  // filtered out so the list leans local; with 20 or fewer results a chain
  // stays in rather than leaving the list sparse.
  const CHAIN_NAMES = [
    // coffee
    "starbucks","peet's coffee","peets coffee","philz coffee","blue bottle coffee",
    "dunkin","dunkin donuts","tim hortons","the coffee bean & tea leaf",
    "coffee bean & tea leaf","caribou coffee","dutch bros","tully's coffee",
    "gloria jean's coffees","costa coffee",
    // fast food
    "mcdonald's","mcdonalds","burger king","wendy's","wendys","taco bell","kfc",
    "kentucky fried chicken","popeyes","chick-fil-a","subway","jimmy john's",
    "jersey mike's","panda express","in-n-out","in-n-out burger","chipotle",
    "qdoba","panera bread","five guys","shake shack","sonic drive-in","sonic",
    "arby's","domino's","domino's pizza","pizza hut","papa john's","little caesars",
    "dairy queen","carl's jr","hardee's","jack in the box","del taco","el pollo loco",
    "wingstop","raising cane's","whataburger","white castle","taco john's",
    "checkers","captain d's","long john silver's","auntie anne's","cinnabon",
    // casual / family dining
    "applebee's","chili's","olive garden","denny's","ihop","outback steakhouse",
    "red lobster","tgi friday's","tgi fridays","buffalo wild wings",
    "cheesecake factory","p.f. chang's","red robin","texas roadhouse",
    "cracker barrel","waffle house","ruby tuesday","boston market","black bear diner"
  ];

  function normalizeChainName(name){
    return String(name || '')
      .toLowerCase()
      .replace(/[®™]/g,'')
      .replace(/\s*#\s*\d+\s*$/,'') // trailing store-number suffix, e.g. "Subway #4821"
      .replace(/\s+/g,' ')
      .trim();
  }

  function isChainCandidate(c){
    const name = normalizeChainName(c.name);
    const brand = normalizeChainName(c.tags && (c.tags.brand || c.tags['brand:en']));
    return CHAIN_NAMES.some(chain => name.includes(chain) || (brand && brand.includes(chain)));
  }

  function categoryFallbackDescription(tags, pirate){
    const cat = tags.amenity || tags.shop || tags.tourism || tags.historic || tags.leisure;
    if(pirate){
      return cat
        ? ('Arrr, a ' + String(cat).replace(/_/g,' ') + ', matey.')
        : 'Arrr, a point o’ interest along the route, matey.';
    }
    return cat ? ('A ' + String(cat).replace(/_/g,' ') + '.') : 'A point of interest along the route.';
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function renderPoiStatus(text, isError){
    const el = document.getElementById('poi-search-status');
    el.textContent = text || '';
    el.classList.toggle('visible', !!text);
    el.classList.toggle('error', !!isError);
  }

  function renderPoiResultRow(shown, total){
    const row = document.getElementById('poi-search-result-row');
    const countEl = document.getElementById('poi-search-result-count');
    if(!shown){
      row.classList.remove('visible');
      countEl.textContent = '';
      return;
    }
    row.classList.add('visible');
    countEl.textContent = shown === total
      ? (shown + (shown === 1 ? ' place found' : ' places found'))
      : ('Showing ' + shown + ' of ' + total + ' found');
  }

  function clearPoiResults(){
    poiLayerGroup.clearLayers();
    poiCandidatesById = {};
    poiRankedPool = [];
    poiShownCount = 0;
    renderPoiResultRow(0,0);
    renderPoiStatus('');
    updatePoiShowMoreButton();
  }

  document.getElementById('poi-clear-btn').addEventListener('click', ()=>{
    clearPoiResults();
    poiSearchToken++; // invalidate any in-flight search
  });

  function updatePoiShowMoreButton(){
    const btn = document.getElementById('poi-show-more-btn');
    const remaining = poiRankedPool.length - poiShownCount;
    if(remaining > 0){
      btn.textContent = 'Show ' + Math.min(POI_MAX_RESULTS, remaining) + ' more';
      btn.classList.add('visible');
    }else{
      btn.classList.remove('visible');
    }
  }

  document.getElementById('poi-show-more-btn').addEventListener('click', ()=>{
    const next = poiRankedPool.slice(poiShownCount, poiShownCount + POI_MAX_RESULTS);
    renderPoiMarkerBatch(next);
    renderPoiResultRow(poiShownCount, poiRankedPool.length);
    updatePoiShowMoreButton();
  });

  // Plots one batch of candidates as map markers, appending to whatever's
  // already on the map (used both for the initial results and for each
  // "Show more" batch) and advancing poiShownCount as it goes.
  function renderPoiMarkerBatch(list){
    list.forEach(c=>{
      poiCandidatesById[c.id] = { name: c.name, tags: c.tags };
      const icon = L.divIcon({
        className: '',
        html: '<div class="poi-marker"><div class="poi-marker-pin"><span>' + iconForTags(c.tags) + '</span></div></div>',
        iconSize: [26,26], iconAnchor: [13,26]
      });
      // Wikipedia-sourced candidates already carry a written summary, so
      // there's nothing to fetch on click — show it straight away and
      // skip the "Tell me more" button entirely.
      const address = c.wikiExtract ? 'From Wikipedia' : (formatAddress(c.tags) || 'Address unavailable');
      const descHtml = c.wikiExtract
        ? '<div class="poi-popup-desc">' + escapeHtml(c.wikiExtract) + '</div>'
        : '<div class="poi-popup-desc" id="' + poiDescElementId(c.id) + '">' +
            '<button type="button" class="poi-tell-more-btn" data-poi-id="' + escapeHtml(c.id) + '">Tell me more</button>' +
          '</div>';
      // SF's own landmark registry and the National Register both
      // additionally supply a designation number/year and a link to the
      // official record — real primary-source documentation neither OSM
      // nor Wikipedia offer.
      let landmarkHtml = '';
      const designationBits = [];
      if(c.landmarkNo) designationBits.push('SF Landmark No. ' + c.landmarkNo);
      if(c.landmarkYear) designationBits.push('designated ' + c.landmarkYear);
      if(c.nrhpRefNum) designationBits.push('NRHP Ref. No. ' + c.nrhpRefNum);
      if(c.nrhpYear) designationBits.push('listed ' + c.nrhpYear);
      if(designationBits.length){
        landmarkHtml += '<div class="poi-popup-address">' + escapeHtml(designationBits.join(', ')) + '</div>';
      }
      if(c.landmarkDocUrl){
        landmarkHtml += '<div class="poi-popup-link"><a href="' + escapeHtml(c.landmarkDocUrl) +
          '" target="_blank" rel="noopener noreferrer">Designation report ↗</a></div>';
      }
      if(c.nrhpDocUrl){
        landmarkHtml += '<div class="poi-popup-link"><a href="' + escapeHtml(c.nrhpDocUrl) +
          '" target="_blank" rel="noopener noreferrer">NRHP nomination form ↗</a></div>';
      }
      const popupHtml =
        '<div class="poi-popup-title">' + escapeHtml(c.name) + '</div>' +
        '<div class="poi-popup-address">' + escapeHtml(address) + '</div>' +
        landmarkHtml +
        descHtml;
      L.marker([c.lat, c.lon], { icon, zIndexOffset: 500 })
        .bindPopup(popupHtml, { className: 'poi-popup', maxWidth: 280 })
        .addTo(poiLayerGroup);
    });
    poiShownCount += list.length;
  }

  async function runPoiSearch(rawQuery){
    const query = (rawQuery || '').trim();
    if(!query) return;
    if(!currentRouteName || !routeBounds){
      renderPoiStatus('Pick a route first.', true);
      return;
    }

    const token = ++poiSearchToken;
    const btn = document.getElementById('poi-search-btn');
    btn.disabled = true;
    clearPoiResults();
    renderPoiStatus('Thinking about "' + query + '"…');

    try{
      const plan = await fetchAIProxyJSON('interpret', { query });
      if(token !== poiSearchToken) return;
      if(!plan || !Array.isArray(plan.queries) || !plan.queries.length){
        renderPoiStatus("Couldn't figure out how to search for that — try being more specific.", true);
        return;
      }

      renderPoiStatus('Searching OpenStreetMap for ' + (plan.label || query) + '…');
      const bbox = routeBBoxPadded();
      const overpassQuery = buildOverpassQuery(plan.queries, bbox);
      const elements = await fetchOverpass(overpassQuery);
      if(token !== poiSearchToken) return;

      const seen = new Set();
      const candidates = [];
      elements.forEach(el=>{
        const lat = el.lat != null ? el.lat : (el.center && el.center.lat);
        const lon = el.lon != null ? el.lon : (el.center && el.center.lon);
        const tags = el.tags || {};
        const name = tags.name;
        if(lat == null || lon == null || !name) return;
        const id = el.type + '/' + el.id;
        if(seen.has(id)) return;
        seen.add(id);
        candidates.push({ id, name, lat, lon, tags });
      });

      if(isHistoricalPlan(plan)){
        try{
          renderPoiStatus('Checking Wikipedia for ' + (plan.label || query) + '…');
          const articles = await fetchWikipediaArticlesInBBox(bbox);
          if(token !== poiSearchToken) return;
          articles.forEach(a=>{
            if(isDuplicateOfCandidate(a, candidates)) return;
            candidates.push({
              id: a.id,
              name: a.name,
              lat: a.lat,
              lon: a.lon,
              tags: { historic: 'yes', wikipedia: 'en:' + a.name },
              wikiExtract: a.extract || null
            });
          });
        }catch(e){
          // Non-fatal — OSM results still stand on their own if Wikipedia's
          // API is unreachable or rate-limiting us.
          console.warn('[muni-walker] Wikipedia geosearch unavailable:', e);
        }

        try{
          renderPoiStatus("Checking San Francisco's landmark registry for " + (plan.label || query) + '…');
          const landmarks = await fetchSfDesignatedLandmarks();
          if(token !== poiSearchToken) return;
          landmarks.forEach(lm=>{
            if(isDuplicateOfCandidate(lm, candidates)) return;
            const tags = { historic: 'designated_landmark' };
            if(lm.address) tags['addr:street'] = lm.address;
            candidates.push({
              id: lm.id,
              name: lm.name,
              lat: lm.lat,
              lon: lm.lon,
              tags,
              landmarkNo: lm.landmarkNo,
              landmarkYear: lm.year,
              landmarkDocUrl: lm.docUrl
            });
          });
        }catch(e){
          // Non-fatal — OSM/Wikipedia results still stand on their own if
          // DataSF is unreachable or the dataset has moved.
          console.warn('[muni-walker] SF landmark registry unavailable:', e);
        }

        try{
          renderPoiStatus('Checking the National Register of Historic Places for ' + (plan.label || query) + '…');
          const nrhpListings = await fetchNrhpListingsInBBox(bbox);
          if(token !== poiSearchToken) return;
          nrhpListings.forEach(nr=>{
            if(isDuplicateOfCandidate(nr, candidates)) return;
            const tags = { historic: 'yes' };
            if(nr.address) tags['addr:street'] = nr.address;
            candidates.push({
              id: nr.id,
              name: nr.name,
              lat: nr.lat,
              lon: nr.lon,
              tags,
              nrhpRefNum: nr.refNum,
              nrhpYear: nr.year,
              nrhpDocUrl: nr.docUrl
            });
          });
        }catch(e){
          // Non-fatal — the other sources still stand on their own if NPS's
          // ArcGIS service is unreachable or the layer's moved.
          console.warn('[muni-walker] National Register lookup unavailable:', e);
        }
      }

      // If we know where the user is and they're actually near the route,
      // restrict results to the active direction's line (not the other
      // direction's, which may run down different streets) and to points
      // *ahead* of them along it — nothing already behind.
      const userProgress = (lastPos && progressModel) ? computeProgress(lastPos) : null;
      const userIsAlongRoute = !!userProgress && userProgress.perpMeters <= PROGRESS_VISIBILITY_RADIUS_METERS;

      let inRange;
      if(userIsAlongRoute){
        candidates.forEach(c => { c.routeProjection = computeProgress([c.lat, c.lon]); });
        inRange = candidates.filter(c =>
          c.routeProjection &&
          c.routeProjection.perpMeters <= POI_RADIUS_METERS &&
          c.routeProjection.alongMeters >= userProgress.alongMeters
        );
        // Still restricted to the route corridor above, but once we know
        // where the user actually is, rank/display distance is measured
        // from them rather than from the route line — "closest to me" beats
        // "closest to the route" when the two disagree.
        inRange.forEach(c => { c.distMeters = haversine(lastPos[0], lastPos[1], c.lat, c.lon); });
      }else{
        candidates.forEach(c => { c.distMeters = distanceToRouteMeters([c.lat, c.lon]); });
        inRange = candidates.filter(c => c.distMeters <= POI_RADIUS_METERS);
      }

      if(!inRange.length){
        const where = userIsAlongRoute ? ' ahead of you on this route.' : ' within 1/4 mile of this route.';
        renderPoiStatus('No ' + (plan.label || query) + ' found' + where, false);
        return;
      }

      // Prefer local/independent places once there's a large enough pool to
      // trim from; with 20 or fewer matches, keep chains in rather than
      // shrinking an already-small list.
      let candidatePool = inRange;
      if(inRange.length > POI_MAX_RESULTS){
        const localOnly = inRange.filter(c => !isChainCandidate(c));
        if(localOnly.length) candidatePool = localOnly;
      }

      poiLayerGroup.clearLayers();
      poiDescribeQuery = query;
      poiCandidatesById = {};
      poiShownCount = 0;
      poiRankedPool = rankCandidates(candidatePool);
      renderPoiMarkerBatch(poiRankedPool.slice(0, POI_MAX_RESULTS));

      renderPoiStatus('');
      renderPoiResultRow(poiShownCount, poiRankedPool.length);
      updatePoiShowMoreButton();
    }catch(e){
      if(token !== poiSearchToken) return;
      console.error('[muni-walker] POI search failed:', e);
      renderPoiStatus((e && e.message) || 'Search failed.', true);
    }finally{
      if(token === poiSearchToken) btn.disabled = false;
    }
  }

  document.getElementById('poi-search-form').addEventListener('submit', (e)=>{
    e.preventDefault();
    runPoiSearch(document.getElementById('poi-search-input').value);
  });

  // Popups are appended into the map's own DOM as they open, so one
  // delegated listener on the map container catches "Tell me more" clicks
  // for every popup, current and future, without rebinding per-marker.
  map.getContainer().addEventListener('click', async (e)=>{
    const clickedBtn = e.target.closest('.poi-tell-more-btn');
    if(!clickedBtn) return;

    const id = clickedBtn.dataset.poiId;
    const candidate = poiCandidatesById[id];
    const container = document.getElementById(poiDescElementId(id));
    if(!candidate || !container) return;

    container.innerHTML = '<span class="poi-desc-loading">Writing description…</span>';
    try{
      const descResult = await fetchAIProxyJSON('describe', {
        query: poiDescribeQuery,
        points: [{ id, name: candidate.name, tags: candidate.tags }],
        pirate: pirateMode
      });
      const entry = (descResult.descriptions || []).find(d => d.id === id);
      container.textContent = (entry && entry.description) || categoryFallbackDescription(candidate.tags, pirateMode);
    }catch(err){
      console.warn('[muni-walker] AI description unavailable:', err);
      container.innerHTML = '<span class="poi-desc-error">Couldn’t load a description.</span> ' +
        '<button type="button" class="poi-tell-more-btn" data-poi-id="' + escapeHtml(id) + '">Retry</button>';
    }
  });

  function getComputedColor(varName){
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  }

  select.addEventListener('change', ()=> loadRoute(select.value));

  // ---------- Error toast ----------
  let errorTimer = null;
  function showError(msg){
    const el = document.getElementById('error-toast');
    el.textContent = msg;
    el.classList.add('visible');
    clearTimeout(errorTimer);
    errorTimer = setTimeout(()=> el.classList.remove('visible'), 6000);
  }

  // ---------- Geolocation ----------
  let meMarker = null;
  let watchId = null;
  let following = false;
  let lastPos = null;

  const locateBtn = document.getElementById('locate-btn');
  const gpsDot = document.getElementById('gps-dot');
  const gpsText = document.getElementById('gps-text');

  // ---------- Collapsible info card ----------
  const infoCard = document.getElementById('info-card');
  const collapseBtn = document.getElementById('collapse-btn');
  collapseBtn.addEventListener('click', ()=>{
    infoCard.classList.toggle('collapsed');
    updateInfoSummary();
  });

  // ---------- Search & live-bus side panels ----------
  // Opening either one collapses the route-details panel so the map stays uncluttered;
  // the two side panels are mutually exclusive since there's only room for one at a time.
  const searchCard = document.getElementById('search-card');
  const liveCard = document.getElementById('live-card');
  const searchFabBtn = document.getElementById('search-fab-btn');
  const liveFabBtn = document.getElementById('live-fab-btn');

  function closeSidePanel(panel, fabBtn){
    panel.classList.remove('visible');
    fabBtn.classList.remove('active');
  }
  function openSidePanel(panel, fabBtn, otherPanel, otherFabBtn){
    closeSidePanel(otherPanel, otherFabBtn);
    panel.classList.add('visible');
    fabBtn.classList.add('active');
    infoCard.classList.add('collapsed');
    updateInfoSummary();
  }

  searchFabBtn.addEventListener('click', ()=>{
    if(searchCard.classList.contains('visible')){
      closeSidePanel(searchCard, searchFabBtn);
    }else{
      openSidePanel(searchCard, searchFabBtn, liveCard, liveFabBtn);
      document.getElementById('poi-search-input').focus();
    }
  });
  liveFabBtn.addEventListener('click', ()=>{
    if(liveCard.classList.contains('visible')){
      closeSidePanel(liveCard, liveFabBtn);
    }else{
      openSidePanel(liveCard, liveFabBtn, searchCard, searchFabBtn);
    }
  });
  document.getElementById('search-close-btn').addEventListener('click', ()=> closeSidePanel(searchCard, searchFabBtn));
  document.getElementById('live-close-btn').addEventListener('click', ()=> closeSidePanel(liveCard, liveFabBtn));

  function positionHeadsignOffsets(){
    const hs = document.getElementById('headsign');
    const h = hs.getBoundingClientRect().height;
    document.getElementById('basemap-select').style.top = (h + 14) + 'px';
    locateBtn.style.top = (h + 14 + 38 + 10) + 'px';
    searchFabBtn.style.top = (h + 14 + 38 + 10 + 48 + 10) + 'px';
    liveFabBtn.style.top = (h + 14 + 38 + 10 + 48 + 10 + 48 + 10) + 'px';
    document.getElementById('error-toast').style.top = (h + 14) + 'px';
    document.getElementById('empty-hint').style.top = (h + 14) + 'px';
  }
  window.addEventListener('resize', positionHeadsignOffsets);
  positionHeadsignOffsets();

  function onPosition(pos){
    const lat = pos.coords.latitude, lon = pos.coords.longitude;
    const firstFix = !lastPos;
    lastPos = [lat, lon];
    gpsDot.classList.add('live');
    gpsText.textContent = 'GPS live';

    if(!meMarker){
      meMarker = L.marker([lat,lon], {
        icon: L.divIcon({className:'', html:'<div class="me-dot"></div>', iconSize:[16,16]}),
        zIndexOffset: 1000
      }).addTo(map);
    }else{
      meMarker.setLatLng([lat,lon]);
    }

    if(following){
      map.panTo([lat,lon], {animate:true});
    }
    updateDistanceReadout();
    if(firstFix && liveEnabled) refreshLiveBuses();
  }

  function onPositionError(err){
    console.warn(err);
    gpsText.textContent = 'GPS unavailable';
    showError('Location access was blocked or unavailable. Enable location permissions to track your position.');
    following = false;
    locateBtn.classList.remove('following');
  }

  function startWatch(){
    if(!('geolocation' in navigator)){
      showError('This browser does not support geolocation.');
      return;
    }
    if(watchId !== null) return;
    gpsText.textContent = 'Locating…';
    watchId = navigator.geolocation.watchPosition(onPosition, onPositionError, {
      enableHighAccuracy:true, maximumAge:5000, timeout:15000
    });
  }

  locateBtn.addEventListener('click', ()=>{
    following = !following;
    locateBtn.classList.toggle('following', following);
    if(following){
      startWatch();
      if(lastPos) map.panTo(lastPos, {animate:true});
    }
  });

  // Start passively watching as soon as permission is available, without forcing a prompt loop.
  startWatch();

  // ---------- Distance-to-route calculation ----------
  function haversine(lat1,lon1,lat2,lon2){
    const R = 6371000;
    const toRad = d=> d*Math.PI/180;
    const dLat = toRad(lat2-lat1), dLon = toRad(lon2-lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
    return 2*R*Math.asin(Math.sqrt(a));
  }

  function nearestPointOnSegment(p, a, b){
    // local equirectangular projection around p for meter-scale accuracy
    const lat0 = p[0]*Math.PI/180;
    const kx = Math.cos(lat0);
    const toXY = (pt)=> [ (pt[1]-p[1])*kx, (pt[0]-p[0]) ];
    const A = toXY(a), B = toXY(b);
    const AB = [B[0]-A[0], B[1]-A[1]];
    const len2 = AB[0]*AB[0]+AB[1]*AB[1];
    let t = len2 === 0 ? 0 : (( -A[0]*AB[0] + -A[1]*AB[1]) / len2);
    t = Math.max(0, Math.min(1, t));
    const nx = A[0] + AB[0]*t, ny = A[1] + AB[1]*t;
    const lon = p[1] + nx/kx, lat = p[0] + ny;
    return [lat, lon];
  }

  function updateDistanceReadout(){
    const valEl = document.getElementById('distance-value');
    const subEl = document.getElementById('distance-sub');
    const coordEl = document.getElementById('nearest-coord');

    if(!lastPos){
      valEl.textContent = '—';
      subEl.textContent = 'turn on GPS to measure';
      coordEl.textContent = '—';
      updateProgressReadout(null);
      updateInfoSummary();
      return;
    }
    if(!routeSegments.length){
      valEl.textContent = '—';
      subEl.textContent = 'pick a route to measure';
      coordEl.textContent = '—';
      updateProgressReadout(null);
      updateInfoSummary();
      return;
    }

    let best = Infinity, bestPt = null;
    for(let i=0;i<routeSegments.length;i++){
      const seg = routeSegments[i];
      const np = nearestPointOnSegment(lastPos, seg.a, seg.b);
      const d = haversine(lastPos[0], lastPos[1], np[0], np[1]);
      if(d < best){ best = d; bestPt = np; }
    }

    const feet = best * 3.28084;
    if(feet < 1000){
      valEl.textContent = Math.round(feet) + ' ft';
    }else{
      valEl.textContent = (feet/5280).toFixed(1) + ' mi';
    }
    subEl.textContent = best < 40 ? "you're on the line" : 'to the nearest point on the route';
    coordEl.textContent = bestPt[0].toFixed(4) + ', ' + bestPt[1].toFixed(4);

    updateProgressReadout(lastPos);
    updateInfoSummary();
  }

  // Condensed one-line readout shown next to the title when the panel is collapsed.
  function updateInfoSummary(){
    const el = document.getElementById('info-summary');
    const parts = [];
    const mins = document.getElementById('live-arrival-mins').textContent;
    if(document.getElementById('live-arrival').classList.contains('visible') && mins && mins !== '—'){
      parts.push('next bus ' + (mins === 'due' ? 'due' : mins + 'm'));
    }
    const pct = document.getElementById('progress-pct').textContent;
    const dist = document.getElementById('distance-value').textContent;
    if(pct && pct !== '—') parts.push(pct + ' along');
    if(dist && dist !== '—') parts.push(dist + ' off-route');
    el.textContent = parts.join(' · ');
  }

  function updateProgressReadout(pos){
    const block = document.getElementById('progress-block');
    const milesEl = document.getElementById('progress-miles');
    const pctEl = document.getElementById('progress-pct');
    const fillEl = document.getElementById('progress-fill');
    const subEl = document.getElementById('progress-sub');
    const heading = block.querySelector('.stat-label');

    function hide(){
      block.classList.remove('visible');
      milesEl.textContent = '—';
      pctEl.textContent = '—';
      fillEl.style.width = '0%';
      subEl.textContent = '— mi total · — mi remaining';
    }

    if(!activeDirection || !progressModel || !pos){ hide(); return; }

    const p = computeProgress(pos);
    if(!p || p.perpMeters > PROGRESS_VISIBILITY_RADIUS_METERS){ hide(); return; }

    block.classList.add('visible');
    heading.textContent = 'Progress along route (' + (activeDirection === 'I' ? 'Inbound' : 'Outbound') + ')';

    const miles = p.alongMeters / 1609.344;
    const totalMiles = p.totalMeters / 1609.344;
    const remainingMiles = Math.max(0, totalMiles - miles);
    const pct = Math.max(0, Math.min(100, p.pct));
    milesEl.textContent = miles.toFixed(1);
    pctEl.textContent = pct.toFixed(1) + '%';
    fillEl.style.width = pct.toFixed(1) + '%';
    subEl.textContent = totalMiles.toFixed(1) + ' mi total · ' + remainingMiles.toFixed(1) + ' mi remaining';
  }

  // periodically refresh readout even without new GPS fixes (e.g. after switching routes)
  setInterval(updateDistanceReadout, 4000);

  // ---------- init ----------
  loadRouteList();
})();
