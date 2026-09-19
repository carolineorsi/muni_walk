// Data for optional map layers, toggled on/off via the "Layers" control.
// Loaded before app.js.
//
// Each location can carry a `hours` field: weekly opening hours as static
// data (not fetched at runtime), keyed by day (sun..sat), each value either
// null (closed that day) or a ["HH:MM","HH:MM"] 24-hour open/close pair.
// A close time past midnight is given as the next day's clock time (e.g.
// ["16:00","02:00"] for 4pm-2am); app.js's isLocationOpen() handles the
// wraparound. `hoursUnconfirmed: true` flags hours that couldn't be
// verified against a reliable source (see hoursNote) — this environment's
// network policy blocks sfmta.com, SF open-data, OpenStreetMap, Wikidata,
// the Leaflet CDN, and (as found while researching this) sfpl.org and most
// business/aggregator sites directly, so hours were sourced via web search
// summaries rather than a page read directly; flagged entries want a
// human spot-check before being trusted for anything beyond a rough map
// popup.

// ---------- Muni's Bussin' Bingo ----------
// Participating local businesses for SFMTA's Transit Month "Bussin' Bingo"
// card (sfmta.com/Bingo) — one stamp per business, 16 squares to fill.
// Coordinates from the promotion's own stop list.
const BINGO_LOCATIONS = [
    { name: 'Sol Bakery', lat: 37.7743008, lon: -122.4442782,
      hours: { sun: ['09:00','15:00'], mon: null, tue: null, wed: null, thu: null, fri: ['09:00','15:00'], sat: ['09:00','15:00'] },
      hoursUnconfirmed: true, hoursNote: 'Hours inferred from repeated "open Fri–Sun" mentions in search results; no explicit hours table found.' },
    { name: 'Hayes Valley Bakeworks', lat: 37.77865329999999, lon: -122.4232455,
      hours: { sun: null, mon: ['08:00','15:00'], tue: ['08:00','15:00'], wed: ['08:00','15:00'], thu: ['08:00','15:00'], fri: ['08:00','15:00'], sat: null } },
    { name: 'whack donuts!', lat: 37.7947028, lon: -122.3953204,
      hours: { sun: null, mon: null, tue: ['09:00','14:00'], wed: ['09:00','14:00'], thu: ['09:00','14:00'], fri: ['09:30','14:00'], sat: ['07:30','12:30'] },
      hoursUnconfirmed: true, hoursNote: 'No storefront could be confirmed near this pin’s Dogpatch/Pier coordinates; hours shown are for the Embarcadero Center location and may not apply here — cross-check the address.' },
    { name: 'Fillmore Bakeshop', lat: 37.7869444, lon: -122.4333333,
      hours: { sun: null, mon: null, tue: ['08:00','16:00'], wed: ['08:00','16:00'], thu: ['08:00','16:00'], fri: ['08:00','16:00'], sat: ['08:00','16:00'] } },
    { name: 'The M Stop Deli', lat: 37.7163402, lon: -122.4504691,
      hours: { sun: ['10:00','17:00'], mon: ['09:00','19:00'], tue: ['09:00','19:00'], wed: ['09:00','19:00'], thu: ['09:00','19:00'], fri: ['09:00','19:00'], sat: ['10:00','19:00'] } },
    { name: 'Standard Deviant Brewing', lat: 37.7684875, lon: -122.4194984,
      hours: { sun: ['10:00','21:00'], mon: null, tue: ['16:00','21:00'], wed: ['16:00','22:00'], thu: ['16:00','22:00'], fri: ['15:00','24:00'], sat: ['12:00','24:00'] } },
    { name: 'Standard Deviant Brewing Pier 70', lat: 37.7586689, lon: -122.3839131,
      hours: { sun: ['10:00','21:00'], mon: ['16:00','21:00'], tue: ['16:00','21:00'], wed: ['16:00','21:00'], thu: ['16:00','22:00'], fri: ['14:00','22:00'], sat: ['12:00','22:00'] },
      hoursUnconfirmed: true, hoursNote: 'Only a single source could be checked (site and SFMTA listing blocked) — moderate confidence.' },
    { name: 'Sunset Cantina', lat: 37.7608708, lon: -122.4988152,
      hours: { sun: ['11:00','21:00'], mon: ['12:00','21:00'], tue: ['12:00','21:00'], wed: ['12:00','21:00'], thu: ['12:00','22:00'], fri: ['12:00','22:00'], sat: ['11:00','22:00'] } },
    { name: 'Breadbelly', lat: 37.7827006, lon: -122.474388,
      hours: { sun: ['08:00','14:00'], mon: ['08:00','14:00'], tue: ['08:00','14:00'], wed: ['08:00','14:00'], thu: ['08:00','14:00'], fri: ['08:00','14:00'], sat: ['08:00','14:00'] } },
    { name: 'Breadbelly B12 - Dogpatch', lat: 37.7584022, lon: -122.3842225,
      hours: { sun: ['08:00','14:00'], mon: ['08:00','14:00'], tue: ['08:00','14:00'], wed: ['08:00','14:00'], thu: ['08:00','14:00'], fri: ['08:00','14:00'], sat: ['08:00','14:00'] } },
    { name: 'Outta Sight Pizza', lat: 37.7818216, lon: -122.4171258,
      hours: { sun: ['11:00','21:00'], mon: ['11:00','21:00'], tue: ['11:00','21:00'], wed: ['11:00','21:00'], thu: ['11:00','21:00'], fri: ['11:00','21:00'], sat: ['11:00','21:00'] },
      hoursUnconfirmed: true, hoursNote: 'No Fillmore/Japantown location could be found; hours shown are for the Larkin St flagship and may not match this pin — cross-check the address.' },
    { name: 'Mission Blue', lat: 37.7124026, lon: -122.4062648,
      hours: { sun: ['08:00','15:00'], mon: ['07:00','15:00'], tue: ['07:00','15:00'], wed: ['07:00','15:00'], thu: ['07:00','15:00'], fri: ['07:00','15:00'], sat: ['07:00','15:00'] },
      hoursNote: 'Address (144 Leland Ave) is usually labeled Visitacion Valley rather than Excelsior on mapping sites.' },
    { name: 'Jim\'s By MLVS', lat: 37.7582572, lon: -122.4193508,
      hours: { sun: null, mon: ['07:00','14:30'], tue: ['07:00','14:30'], wed: ['07:00','14:30'], thu: ['07:00','14:30'], fri: ['07:00','14:30'], sat: ['07:00','14:30'] } },
    { name: 'Creative Ideas Cafe', lat: 37.7118078, lon: -122.4048045,
      hours: { sun: null, mon: ['08:00','14:30'], tue: ['08:00','14:30'], wed: ['08:00','18:00'], thu: ['08:00','14:30'], fri: ['08:00','18:00'], sat: ['08:30','15:00'] } },
    { name: 'robberbaron', lat: 37.7955733, lon: -122.421569,
      hours: { sun: null, mon: null, tue: ['16:30','22:00'], wed: ['16:30','23:00'], thu: ['16:30','23:00'], fri: ['16:30','01:00'], sat: ['16:30','01:00'] },
      hoursNote: 'Every source describes this as an evenings-only wine/beer bar rather than a coffee shop — worth confirming this is the intended business.' },
    { name: 'Thorough Bread & Pastry', lat: 37.766564, lon: -122.4291851,
      hours: { sun: ['08:00','17:00'], mon: null, tue: null, wed: ['08:00','16:00'], thu: ['08:00','16:00'], fri: ['08:00','16:00'], sat: ['08:00','17:00'] } },
    { name: 'Buffalo Kitchen', lat: 37.7118799, lon: -122.4059366,
      hours: { sun: null, mon: null, tue: null, wed: null, thu: null, fri: null, sat: null },
      hoursUnconfirmed: true, hoursNote: 'Yelp lists this business as CLOSED (checked ~Sept 2026) — likely permanently closed; verify before keeping it on the card.' },
    { name: 'Abanico Coffee Roasters', lat: 37.7629542, lon: -122.4191888,
      hours: { sun: ['08:00','16:00'], mon: ['07:30','16:00'], tue: ['07:30','16:00'], wed: ['07:30','16:00'], thu: ['07:30','16:00'], fri: ['07:30','16:00'], sat: ['08:00','16:00'] } },
    { name: 'Excelsior Coffee', lat: 37.7263543, lon: -122.4333723,
      hours: { sun: ['07:30','16:00'], mon: ['07:30','16:00'], tue: ['07:30','16:00'], wed: ['07:30','16:00'], thu: ['07:30','16:00'], fri: ['07:30','16:00'], sat: ['07:30','16:00'] } },
    { name: 'Beloved Cafe & Organic Juicery', lat: 37.7523685, lon: -122.4193018,
      hours: { sun: ['08:30','16:30'], mon: ['08:30','16:30'], tue: ['08:30','16:30'], wed: ['08:30','16:30'], thu: ['08:30','16:30'], fri: ['08:30','16:30'], sat: ['08:30','16:30'] },
      hoursUnconfirmed: true, hoursNote: 'Sources disagreed slightly on closing time (4pm vs 4:30pm); weekend hours assumed same as weekday, not separately confirmed.' },
    { name: 'La Mejor Bakery', lat: 37.7520859, lon: -122.4191545,
      hours: { sun: ['06:00','21:00'], mon: ['06:00','22:00'], tue: ['06:00','22:00'], wed: ['06:00','22:00'], thu: ['06:00','22:00'], fri: ['06:00','22:00'], sat: ['06:00','22:00'] },
      hoursUnconfirmed: true, hoursNote: 'A 16-hour daily span looks unusually long for a small panaderia — possible aggregator error, worth a phone/site check.' },
    { name: 'Café La Bohème', lat: 37.75232829999999, lon: -122.4189655,
      hours: { sun: ['08:00','17:00'], mon: ['06:00','17:00'], tue: ['06:00','17:00'], wed: ['06:00','17:00'], thu: ['06:00','17:00'], fri: ['06:00','17:00'], sat: ['07:00','17:00'] } },
    { name: 'Muddy Waters Café & Lounge', lat: 37.7645244, lon: -122.4216732,
      hours: { sun: ['07:00','22:00'], mon: ['07:00','15:00'], tue: ['07:00','15:00'], wed: ['07:00','15:00'], thu: ['07:00','19:00'], fri: ['07:00','22:00'], sat: ['07:00','22:00'] },
      hoursNote: 'Cafe by day, becomes "Baobab Lounge" some evenings — outer open/close span shown rather than the daytime-only cafe hours.' },
    { name: 'Bi-Rite Creamery', lat: 37.76159, lon: -122.425717,
      hours: { sun: ['12:00','22:00'], mon: ['12:00','21:00'], tue: ['12:00','21:00'], wed: ['12:00','21:00'], thu: ['12:00','21:00'], fri: ['12:00','21:00'], sat: ['12:00','22:00'] } },
    { name: 'The French Spot', lat: 37.78774900000001, lon: -122.418286,
      hours: { sun: ['08:00','13:00'], mon: null, tue: null, wed: null, thu: ['08:00','13:00'], fri: ['08:00','13:00'], sat: ['08:00','13:00'] } },
    { name: 'Propagation', lat: 37.7871518, lon: -122.4163661,
      hours: { sun: null, mon: ['17:00','24:00'], tue: ['17:00','24:00'], wed: ['17:00','24:00'], thu: ['17:00','24:00'], fri: ['16:00','02:00'], sat: ['16:00','02:00'] },
      hoursNote: 'This is a garden-themed cocktail bar, not a coffee/plant shop — worth confirming this is the intended business.' },
    { name: 'Motoring Coffee', lat: 37.7983069, lon: -122.4246085,
      hours: { sun: ['07:00','18:00'], mon: ['07:00','18:00'], tue: ['07:00','18:00'], wed: ['07:00','18:00'], thu: ['07:00','18:00'], fri: ['07:00','18:00'], sat: ['07:00','18:00'] },
      hoursUnconfirmed: true, hoursNote: 'Only SF location found is on Union St (Cow Hollow/Marina), not Polk St — cross-check the address against this pin.' },
    { name: 'Woods Polk Station', lat: 37.7976958, lon: -122.4223561,
      hours: { sun: ['13:00','20:00'], mon: ['16:00','22:00'], tue: ['16:00','22:00'], wed: ['16:00','22:00'], thu: ['16:00','22:00'], fri: ['13:00','24:00'], sat: ['13:00','24:00'] } },
    { name: 'Woods Lowside', lat: 37.772147, lon: -122.4310232,
      hours: { sun: ['13:00','22:00'], mon: ['17:00','23:00'], tue: ['17:00','23:00'], wed: ['17:00','23:00'], thu: ['17:00','23:00'], fri: ['16:00','24:00'], sat: ['13:00','24:00'] } },
    { name: 'Woods Cole Valley', lat: 37.7661366, lon: -122.4497537,
      hours: { sun: ['12:00','20:00'], mon: ['16:00','22:00'], tue: ['16:00','22:00'], wed: ['16:00','22:00'], thu: ['16:00','22:00'], fri: ['16:00','23:00'], sat: ['15:00','23:00'] } },
    { name: 'Woods Outbound', lat: 37.76025910000001, lon: -122.5055792,
      hours: { sun: ['13:00','20:00'], mon: ['16:00','22:00'], tue: ['16:00','22:00'], wed: ['16:00','22:00'], thu: ['16:00','22:00'], fri: ['16:00','23:00'], sat: ['12:00','23:00'] } },
    { name: 'Woods Cervecería', lat: 37.7611469, lon: -122.4285425,
      hours: { sun: ['12:00','21:00'], mon: ['16:00','21:00'], tue: ['16:00','21:00'], wed: ['16:00','21:00'], thu: ['16:00','21:00'], fri: ['16:00','22:00'], sat: ['12:00','22:00'] } }
];

// ---------- San Francisco Public Library branches ----------
// Every SFPL branch (Main plus all 27 neighborhood branches; shared
// children's rooms inside a branch building, e.g. Chinatown Children's,
// aren't listed separately). Addresses cross-checked against sfpl.org and
// independent listings (Yelp/SF Station/Waze/librarytechnology.org), but
// this environment's network policy blocks map/geocoding services, so
// these coordinates are our own estimate from each address using general
// SF street-grid geography rather than a verified geocoder — treat them as
// approximate (may be off by a block) and nudge any pin that looks wrong.
const LIBRARY_LOCATIONS = [
    { name: 'Main Library', lat: 37.7793, lon: -122.4162,
      hours: { sun: ['12:00','18:00'], mon: ['09:00','18:00'], tue: ['09:00','20:00'], wed: ['09:00','20:00'], thu: ['09:00','20:00'], fri: ['12:00','18:00'], sat: ['10:00','18:00'] } },
    { name: 'Anza', lat: 37.7807, lon: -122.4966,
      hours: { sun: ['13:00','17:00'], mon: ['10:00','18:00'], tue: ['10:00','20:00'], wed: ['13:00','20:00'], thu: ['10:00','18:00'], fri: ['13:00','18:00'], sat: ['10:00','18:00'] } },
    { name: 'Bayview', lat: 37.7307, lon: -122.3888,
      hours: { sun: ['13:00','17:00'], mon: ['10:00','18:00'], tue: ['10:00','20:00'], wed: ['10:00','20:00'], thu: ['10:00','20:00'], fri: ['13:00','18:00'], sat: ['10:00','18:00'] } },
    { name: 'Bernal Heights', lat: 37.7391, lon: -122.4136,
      hours: { sun: ['13:00','17:00'], mon: ['10:00','18:00'], tue: ['10:00','19:00'], wed: ['12:00','20:00'], thu: ['10:00','18:00'], fri: ['13:00','18:00'], sat: ['10:00','18:00'] } },
    { name: 'Chinatown', lat: 37.7952, lon: -122.4102,
      hours: { sun: ['13:00','17:00'], mon: ['10:00','18:00'], tue: ['10:00','20:00'], wed: ['10:00','20:00'], thu: ['10:00','20:00'], fri: ['13:00','18:00'], sat: ['10:00','18:00'] } },
    { name: 'Eureka Valley', lat: 37.7622, lon: -122.4349,
      hours: { sun: ['13:00','17:00'], mon: ['10:00','18:00'], tue: ['10:00','20:00'], wed: ['10:00','20:00'], thu: ['10:00','20:00'], fri: ['13:00','18:00'], sat: ['10:00','18:00'] } },
    { name: 'Excelsior', lat: 37.7268, lon: -122.4283,
      hours: { sun: ['13:00','17:00'], mon: ['10:00','18:00'], tue: ['10:00','20:00'], wed: ['10:00','20:00'], thu: ['10:00','20:00'], fri: ['13:00','18:00'], sat: ['10:00','18:00'] } },
    { name: 'Glen Park', lat: 37.7338, lon: -122.4335,
      hours: { sun: ['13:00','17:00'], mon: ['10:00','18:00'], tue: ['10:00','18:00'], wed: ['12:00','20:00'], thu: ['10:00','19:00'], fri: ['13:00','18:00'], sat: ['10:00','18:00'] } },
    { name: 'Golden Gate Valley', lat: 37.7986, lon: -122.4356,
      hours: { sun: ['13:00','17:00'], mon: ['10:00','18:00'], tue: ['10:00','18:00'], wed: ['12:00','20:00'], thu: ['12:00','20:00'], fri: ['13:00','18:00'], sat: ['10:00','18:00'] } },
    { name: 'Ingleside', lat: 37.7255, lon: -122.4531,
      hours: { sun: ['13:00','17:00'], mon: ['10:00','18:00'], tue: ['10:00','18:00'], wed: ['10:00','20:00'], thu: ['12:00','19:00'], fri: ['13:00','18:00'], sat: ['10:00','18:00'] } },
    { name: 'Marina', lat: 37.8006, lon: -122.4374,
      hours: { sun: ['13:00','17:00'], mon: ['10:00','18:00'], tue: ['10:00','18:00'], wed: ['13:00','20:00'], thu: ['10:00','20:00'], fri: ['13:00','18:00'], sat: ['10:00','18:00'] } },
    { name: 'Merced', lat: 37.7247, lon: -122.4770,
      hours: { sun: ['13:00','17:00'], mon: ['10:00','18:00'], tue: ['10:00','20:00'], wed: ['10:00','20:00'], thu: ['10:00','20:00'], fri: ['13:00','18:00'], sat: ['10:00','18:00'] } },
    { name: 'Mission', lat: 37.7513, lon: -122.4197,
      hours: { sun: ['13:00','17:00'], mon: ['10:00','18:00'], tue: ['10:00','20:00'], wed: ['10:00','20:00'], thu: ['10:00','20:00'], fri: ['13:00','18:00'], sat: ['10:00','18:00'] },
      hoursNote: 'The home building (300 Bartlett St) is closed for renovation; branch is currently running full service from a temporary site at 1234 Valencia St, whose hours are shown here — re-verify once it reopens at Bartlett St.' },
    { name: 'Mission Bay', lat: 37.7706, lon: -122.3934,
      hours: { sun: ['13:00','17:00'], mon: ['10:00','18:00'], tue: ['10:00','18:00'], wed: ['11:00','20:00'], thu: ['10:00','18:00'], fri: ['13:00','18:00'], sat: ['10:00','18:00'] } },
    { name: 'Noe Valley', lat: 37.7511, lon: -122.4327,
      hours: { sun: ['13:00','17:00'], mon: ['11:00','18:00'], tue: ['10:00','20:00'], wed: ['12:00','20:00'], thu: ['10:00','18:00'], fri: ['13:00','18:00'], sat: ['10:00','18:00'] } },
    { name: 'North Beach', lat: 37.8027, lon: -122.4118,
      hours: { sun: ['13:00','17:00'], mon: ['10:00','18:00'], tue: ['10:00','20:00'], wed: ['13:00','20:00'], thu: ['10:00','18:00'], fri: ['13:00','18:00'], sat: ['10:00','18:00'] } },
    { name: 'Ocean View', lat: 37.7217, lon: -122.4653,
      hours: { sun: ['13:00','17:00'], mon: ['10:00','18:00'], tue: ['10:00','18:00'], wed: ['12:00','20:00'], thu: ['10:00','19:00'], fri: ['13:00','18:00'], sat: ['10:00','18:00'] } },
    { name: 'Ortega', lat: 37.7433, lon: -122.4949,
      hours: { sun: ['13:00','17:00'], mon: ['10:00','18:00'], tue: ['10:00','18:00'], wed: ['12:00','20:00'], thu: ['11:00','20:00'], fri: ['13:00','18:00'], sat: ['10:00','18:00'] } },
    { name: 'Park', lat: 37.7714, lon: -122.4463,
      hours: { sun: ['13:00','17:00'], mon: ['12:00','18:00'], tue: ['10:00','20:00'], wed: ['12:00','20:00'], thu: ['10:00','18:00'], fri: ['13:00','18:00'], sat: ['10:00','18:00'] } },
    { name: 'Parkside', lat: 37.7433, lon: -122.4808,
      hours: { sun: ['13:00','17:00'], mon: ['13:00','18:00'], tue: ['10:00','20:00'], wed: ['10:00','20:00'], thu: ['10:00','18:00'], fri: ['13:00','18:00'], sat: ['10:00','18:00'] } },
    { name: 'Portola', lat: 37.7275, lon: -122.4064,
      hours: { sun: ['13:00','17:00'], mon: ['10:00','18:00'], tue: ['10:00','18:00'], wed: ['12:00','20:00'], thu: ['10:00','19:00'], fri: ['13:00','18:00'], sat: ['10:00','18:00'] } },
    { name: 'Potrero', lat: 37.7591, lon: -122.4001,
      hours: { sun: ['13:00','17:00'], mon: ['13:00','18:00'], tue: ['10:00','20:00'], wed: ['12:00','20:00'], thu: ['10:00','20:00'], fri: ['13:00','18:00'], sat: ['10:00','18:00'] } },
    { name: 'Presidio', lat: 37.7889, lon: -122.4407,
      hours: { sun: ['13:00','17:00'], mon: ['13:00','18:00'], tue: ['10:00','20:00'], wed: ['10:00','20:00'], thu: ['10:00','18:00'], fri: ['13:00','18:00'], sat: ['10:00','18:00'] } },
    { name: 'Richmond', lat: 37.7822, lon: -122.4636,
      hours: { sun: ['13:00','17:00'], mon: ['10:00','18:00'], tue: ['10:00','20:00'], wed: ['10:00','20:00'], thu: ['10:00','20:00'], fri: ['13:00','18:00'], sat: ['10:00','18:00'] } },
    { name: 'Sunset', lat: 37.7626, lon: -122.4753,
      hours: { sun: ['13:00','17:00'], mon: ['10:00','18:00'], tue: ['10:00','20:00'], wed: ['10:00','20:00'], thu: ['10:00','20:00'], fri: ['13:00','18:00'], sat: ['10:00','18:00'] } },
    { name: 'Visitacion Valley', lat: 37.7156, lon: -122.4067,
      hours: { sun: ['13:00','17:00'], mon: ['10:00','18:00'], tue: ['10:00','20:00'], wed: ['10:00','20:00'], thu: ['10:00','20:00'], fri: ['13:00','18:00'], sat: ['10:00','18:00'] } },
    { name: 'West Portal', lat: 37.7405, lon: -122.4658,
      hours: { sun: ['13:00','17:00'], mon: ['10:00','18:00'], tue: ['10:00','20:00'], wed: ['10:00','20:00'], thu: ['10:00','20:00'], fri: ['13:00','18:00'], sat: ['10:00','18:00'] } },
    { name: 'Western Addition', lat: 37.7838, lon: -122.4381,
      hours: { sun: ['13:00','17:00'], mon: ['10:00','18:00'], tue: ['10:00','18:00'], wed: ['12:00','20:00'], thu: ['10:00','19:00'], fri: ['13:00','18:00'], sat: ['10:00','18:00'] } }
];
