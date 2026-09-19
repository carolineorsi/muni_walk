// Data for optional map layers, toggled on/off via the "Layers" control.
// Loaded before app.js.

// ---------- Muni's Bussin' Bingo ----------
// Participating local businesses for SFMTA's Transit Month "Bussin' Bingo"
// card (sfmta.com/Bingo) — one stamp per business, 16 squares to fill.
// Coordinates from the promotion's own stop list.
const BINGO_LOCATIONS = [
    { name: 'Sol Bakery', lat: 37.7743008, lon: -122.4442782 },
    { name: 'Hayes Valley Bakeworks', lat: 37.77865329999999, lon: -122.4232455 },
    { name: 'whack donuts!', lat: 37.7947028, lon: -122.3953204 },
    { name: 'Fillmore Bakeshop', lat: 37.7869444, lon: -122.4333333 },
    { name: 'The M Stop Deli', lat: 37.7163402, lon: -122.4504691 },
    { name: 'Standard Deviant Brewing', lat: 37.7684875, lon: -122.4194984 },
    { name: 'Standard Deviant Brewing Pier 70', lat: 37.7586689, lon: -122.3839131 },
    { name: 'Sunset Cantina', lat: 37.7608708, lon: -122.4988152 },
    { name: 'Breadbelly', lat: 37.7827006, lon: -122.474388 },
    { name: 'Breadbelly B12 - Dogpatch', lat: 37.7584022, lon: -122.3842225 },
    { name: 'Outta Sight Pizza', lat: 37.7818216, lon: -122.4171258 },
    { name: 'Mission Blue', lat: 37.7124026, lon: -122.4062648 },
    { name: 'Jim\'s By MLVS', lat: 37.7582572, lon: -122.4193508 },
    { name: 'Creative Ideas Cafe', lat: 37.7118078, lon: -122.4048045 },
    { name: 'robberbaron', lat: 37.7955733, lon: -122.421569 },
    { name: 'Thorough Bread & Pastry', lat: 37.766564, lon: -122.4291851 },
    { name: 'Buffalo Kitchen', lat: 37.7118799, lon: -122.4059366 },
    { name: 'Abanico Coffee Roasters', lat: 37.7629542, lon: -122.4191888 },
    { name: 'Excelsior Coffee', lat: 37.7263543, lon: -122.4333723 },
    { name: 'Beloved Cafe & Organic Juicery', lat: 37.7523685, lon: -122.4193018 },
    { name: 'La Mejor Bakery', lat: 37.7520859, lon: -122.4191545 },
    { name: 'Café La Bohème', lat: 37.75232829999999, lon: -122.4189655 },
    { name: 'Muddy Waters Café & Lounge', lat: 37.7645244, lon: -122.4216732 },
    { name: 'Bi-Rite Creamery', lat: 37.76159, lon: -122.425717 },
    { name: 'The French Spot', lat: 37.78774900000001, lon: -122.418286 },
    { name: 'Propagation', lat: 37.7871518, lon: -122.4163661 },
    { name: 'Motoring Coffee', lat: 37.7983069, lon: -122.4246085 },
    { name: 'Woods Polk Station', lat: 37.7976958, lon: -122.4223561 },
    { name: 'Woods Lowside', lat: 37.772147, lon: -122.4310232 },
    { name: 'Woods Cole Valley', lat: 37.7661366, lon: -122.4497537 },
    { name: 'Woods Outbound', lat: 37.76025910000001, lon: -122.5055792 },
    { name: 'Woods Cervecería', lat: 37.7611469, lon: -122.4285425 }
];
