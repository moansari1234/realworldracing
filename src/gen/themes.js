// Each real-world zone gets a generation theme: palettes, floor ranges, facade texture style, props
export const THEMES = {
  oldcity: {
    label: 'Old City · Charminar',
    ground: '#c9b08a', sidewalk: '#b9a68a', grass: '#8fa65a', water: '#3f7f8f', road: '#6a6662',
    sky: ['#f6b26b', '#fbe3b8', '#8fb3d9'], fog: '#e8c79a', fogNear: 120, fogFar: 900,
    sun: { color: '#ffd8a0', intensity: 2.6, dir: [-0.6, 0.55, 0.45] }, hemi: ['#ffe8c8', '#8a7050', 1.4],
    walls: ['#e8d5b0', '#f0e2c4', '#d9b98c', '#efe7da', '#e6c79c', '#cfe0d8', '#f2d7d0', '#d6e4ef', '#e9d27a', '#c7d9b6'],
    roof: '#9c8c78', floors: [2, 4], floorH: 3.3, facade: 'mughal', shops: true, domeChance: 0.07, tankChance: 0.45,
    filler: 1.0, fillerDepth: [8, 16], treeChance: 0.15, kerb: ['#f2c230', '#1c1c1c'],
  },
  lake: {
    label: 'Hussain Sagar · Tank Bund',
    ground: '#9da57a', sidewalk: '#b8b2a6', grass: '#6f9a48', water: '#2f6f8f', road: '#5e5e62',
    sky: ['#ff9a6a', '#ffd3a1', '#6f97c9'], fog: '#e7b79a', fogNear: 200, fogFar: 1400,
    sun: { color: '#ffc58f', intensity: 2.4, dir: [0.7, 0.32, -0.25] }, hemi: ['#ffe2c8', '#5d6a4c', 1.3],
    walls: ['#f1ece2', '#e4ddd0', '#d8dde3', '#efe2c7', '#d0c7b8', '#e9e9e9', '#c9d6cf'],
    roof: '#8a8a86', floors: [3, 7], floorH: 3.3, facade: 'modern', shops: true, domeChance: 0.0, tankChance: 0.4,
    filler: 0.6, fillerDepth: [10, 20], treeChance: 0.55, kerb: ['#f2c230', '#1c1c1c'],
  },
  hitec: {
    label: 'HITEC City · Cable Bridge',
    ground: '#8e9284', sidewalk: '#a9aba5', grass: '#5f8a45', water: '#21506a', road: '#58595d',
    sky: ['#6aa6e8', '#d6e9fb', '#3d75c4'], fog: '#c9dbea', fogNear: 250, fogFar: 1800,
    sun: { color: '#fff4e0', intensity: 2.8, dir: [0.4, 0.75, 0.35] }, hemi: ['#e8f2ff', '#5a6250', 1.2],
    walls: ['#cfe0ec', '#bcd3e3', '#e0e8ee', '#a9c4d6', '#d9e4e8', '#c3d6df', '#e8e2d6', '#b7cfc4'],
    roof: '#7c8086', floors: [8, 20], floorH: 3.6, facade: 'glass', shops: false, domeChance: 0, tankChance: 0.1,
    filler: 0.45, fillerDepth: [18, 34], treeChance: 0.5, kerb: ['#f2c230', '#1c1c1c'],
  },
};
