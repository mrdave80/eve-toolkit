'use strict';
/* Static Planetary Interaction data: planet resources and every schematic. */

const PI = (() => {
  const PLANETS = {
    Barren:    { p0: ['Aqueous Liquids', 'Base Metals', 'Carbon Compounds', 'Microorganisms', 'Noble Metals'], colors: ['#c8935a', '#7a4a26', '#e2b98a'] },
    Gas:       { p0: ['Aqueous Liquids', 'Base Metals', 'Ionic Solutions', 'Noble Gas', 'Reactive Gas'], colors: ['#e8d3a6', '#b98a4e', '#f4e7c8'], ring: true },
    Ice:       { p0: ['Aqueous Liquids', 'Heavy Metals', 'Microorganisms', 'Noble Gas', 'Planktic Colonies'], colors: ['#dfeef7', '#8fb3cc', '#ffffff'] },
    Lava:      { p0: ['Base Metals', 'Felsic Magma', 'Heavy Metals', 'Non-CS Crystals', 'Suspended Plasma'], colors: ['#ff7a2f', '#5a1608', '#ffc25a'] },
    Oceanic:   { p0: ['Aqueous Liquids', 'Carbon Compounds', 'Complex Organisms', 'Microorganisms', 'Planktic Colonies'], colors: ['#2f7fd1', '#0d2c5a', '#7fc4ff'] },
    Plasma:    { p0: ['Base Metals', 'Heavy Metals', 'Noble Metals', 'Non-CS Crystals', 'Suspended Plasma'], colors: ['#b06cf0', '#3a1066', '#f0b8ff'] },
    Storm:     { p0: ['Aqueous Liquids', 'Base Metals', 'Ionic Solutions', 'Noble Gas', 'Suspended Plasma'], colors: ['#4a5d7a', '#141c2b', '#8fa4c7'] },
    Temperate: { p0: ['Aqueous Liquids', 'Autotrophs', 'Carbon Compounds', 'Complex Organisms', 'Microorganisms'], colors: ['#3e9b6e', '#1d4d6b', '#c9b27a'] }
  };

  // P0 -> P1 (3,000 raw -> 20 per 30 min cycle)
  const P1 = {
    'Water': 'Aqueous Liquids', 'Industrial Fibers': 'Autotrophs', 'Reactive Metals': 'Base Metals', 'Biofuels': 'Carbon Compounds',
    'Proteins': 'Complex Organisms', 'Silicon': 'Felsic Magma', 'Toxic Metals': 'Heavy Metals', 'Electrolytes': 'Ionic Solutions',
    'Bacteria': 'Microorganisms', 'Oxygen': 'Noble Gas', 'Precious Metals': 'Noble Metals', 'Chiral Structures': 'Non-CS Crystals',
    'Biomass': 'Planktic Colonies', 'Oxidizing Compound': 'Reactive Gas', 'Plasmoids': 'Suspended Plasma'
  };

  // P2: 40 + 40 P1 -> 5 per hour
  const P2 = {
    'Biocells': ['Biofuels', 'Precious Metals'],
    'Construction Blocks': ['Reactive Metals', 'Toxic Metals'],
    'Consumer Electronics': ['Toxic Metals', 'Chiral Structures'],
    'Coolant': ['Electrolytes', 'Water'],
    'Enriched Uranium': ['Toxic Metals', 'Precious Metals'],
    'Fertilizer': ['Bacteria', 'Proteins'],
    'Genetically Enhanced Livestock': ['Proteins', 'Biomass'],
    'Livestock': ['Proteins', 'Biofuels'],
    'Mechanical Parts': ['Reactive Metals', 'Precious Metals'],
    'Microfiber Shielding': ['Industrial Fibers', 'Silicon'],
    'Miniature Electronics': ['Chiral Structures', 'Silicon'],
    'Nanites': ['Bacteria', 'Reactive Metals'],
    'Oxides': ['Oxidizing Compound', 'Oxygen'],
    'Polyaramids': ['Oxidizing Compound', 'Industrial Fibers'],
    'Polytextiles': ['Biofuels', 'Industrial Fibers'],
    'Rocket Fuel': ['Plasmoids', 'Electrolytes'],
    'Silicate Glass': ['Oxidizing Compound', 'Silicon'],
    'Superconductors': ['Plasmoids', 'Water'],
    'Supertensile Plastics': ['Oxygen', 'Biomass'],
    'Synthetic Oil': ['Electrolytes', 'Oxygen'],
    'Test Cultures': ['Bacteria', 'Water'],
    'Transmitter': ['Plasmoids', 'Chiral Structures'],
    'Viral Agent': ['Bacteria', 'Biomass'],
    'Water-Cooled CPU': ['Reactive Metals', 'Water']
  };

  // P3: 10 of each P2 -> 3 per hour
  const P3 = {
    'Biotech Research Reports': ['Nanites', 'Livestock', 'Construction Blocks'],
    'Camera Drones': ['Silicate Glass', 'Rocket Fuel'],
    'Condensates': ['Oxides', 'Coolant'],
    'Cryoprotectant Solution': ['Test Cultures', 'Synthetic Oil', 'Fertilizer'],
    'Data Chips': ['Supertensile Plastics', 'Microfiber Shielding'],
    'Gel-Matrix Biopaste': ['Oxides', 'Biocells', 'Superconductors'],
    'Guidance Systems': ['Water-Cooled CPU', 'Transmitter'],
    'Hazmat Detection Systems': ['Polytextiles', 'Viral Agent', 'Transmitter'],
    'Hermetic Membranes': ['Polyaramids', 'Genetically Enhanced Livestock'],
    'High-Tech Transmitters': ['Polyaramids', 'Transmitter'],
    'Industrial Explosives': ['Fertilizer', 'Polytextiles'],
    'Neocoms': ['Biocells', 'Silicate Glass'],
    'Nuclear Reactors': ['Microfiber Shielding', 'Enriched Uranium'],
    'Planetary Vehicles': ['Supertensile Plastics', 'Mechanical Parts', 'Miniature Electronics'],
    'Robotics': ['Mechanical Parts', 'Consumer Electronics'],
    'Smartfab Units': ['Construction Blocks', 'Miniature Electronics'],
    'Supercomputers': ['Water-Cooled CPU', 'Coolant', 'Consumer Electronics'],
    'Synthetic Synapses': ['Supertensile Plastics', 'Test Cultures'],
    'Transcranial Microcontrollers': ['Biocells', 'Nanites'],
    'Ukomi Superconductors': ['Synthetic Oil', 'Superconductors'],
    'Vaccines': ['Livestock', 'Viral Agent']
  };

  // P4: 6 of each P3 (+ 40 of a P1 for some) -> 1 per hour
  const P4 = {
    'Broadcast Node': ['Neocoms', 'Data Chips', 'High-Tech Transmitters'],
    'Integrity Response Drones': ['Gel-Matrix Biopaste', 'Hazmat Detection Systems', 'Planetary Vehicles'],
    'Nano-Factory': ['Industrial Explosives', 'Ukomi Superconductors', 'Reactive Metals'],
    'Organic Mortar Applicators': ['Condensates', 'Robotics', 'Bacteria'],
    'Recursive Computing Module': ['Synthetic Synapses', 'Guidance Systems', 'Transcranial Microcontrollers'],
    'Self-Harmonizing Power Core': ['Camera Drones', 'Nuclear Reactors', 'Hermetic Membranes'],
    'Sterile Conduits': ['Smartfab Units', 'Vaccines', 'Water'],
    'Wetware Mainframe': ['Supercomputers', 'Biotech Research Reports', 'Cryoprotectant Solution']
  };

  const P0 = [...new Set(Object.values(PLANETS).flatMap(p => p.p0))].sort();

  // Unified item table
  const items = {};
  for (const n of P0) items[n] = { name: n, tier: 0, inputs: [] };
  for (const [n, src] of Object.entries(P1)) items[n] = { name: n, tier: 1, inputs: [{ name: src, qty: 3000 }], out: 20, cycleH: 0.5 };
  for (const [n, ins] of Object.entries(P2)) items[n] = { name: n, tier: 2, inputs: ins.map(i => ({ name: i, qty: 40 })), out: 5, cycleH: 1 };
  for (const [n, ins] of Object.entries(P3)) items[n] = { name: n, tier: 3, inputs: ins.map(i => ({ name: i, qty: 10 })), out: 3, cycleH: 1 };
  for (const [n, ins] of Object.entries(P4)) items[n] = { name: n, tier: 4, inputs: ins.map(i => ({ name: i, qty: P1[i] ? 40 : 6 })), out: 1, cycleH: 1 };
  for (const it of Object.values(items)) it.perFactoryHour = it.out ? it.out / it.cycleH : 0;

  // Base customs (POCO) value per unit; export tax = base × rate, import = half.
  const BASE_CUSTOMS = { 0: 5, 1: 400, 2: 7200, 3: 60000, 4: 1200000 };
  const FACTORY = { 1: 'Basic Industry Facility', 2: 'Advanced Industry Facility', 3: 'Advanced Industry Facility', 4: 'High-Tech Production Plant' };

  const planetsWith = p0 => Object.entries(PLANETS).filter(([, v]) => v.p0.includes(p0)).map(([k]) => k);
  const usedBy = name => Object.values(items).filter(i => i.inputs.some(x => x.name === name)).map(i => i.name);

  return { PLANETS, P0, items, BASE_CUSTOMS, FACTORY, planetsWith, usedBy, tierNames: ['Raw (P0)', 'P1', 'P2', 'P3', 'P4'] };
})();
