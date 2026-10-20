# Real World Racing

**Race through the real streets of Hyderabad, right in your browser.**

▶ **Play now:** https://realworldracing.vercel.app

Real World Racing turns OpenStreetMap data into 3D race tracks. Roads, buildings, lakes, parks and famous landmarks are generated from real map data, so every corner is a real corner of the city.

## Tracks

| Track | Length | Highlights |
|---|---|---|
| Nizam's Heritage Run | 2.1 km sprint | Salar Jung Museum, Gulzar Houz, Charminar, Mecca Masjid, Chowmahalla Palace |
| Hussain Sagar Loop | 9.7 km lap | Tank Bund, Buddha Statue, Lumbini Park, Necklace Road, NTR Gardens |
| Cyber Sprint | 4.4 km sprint | Cyber Towers, HITEC City Road, Inorbit Mall, Durgam Cheruvu Cable Bridge |

## Features

- Real road layouts, buildings and landmarks from OpenStreetMap
- Procedural cars with arcade physics, drifting, nitro and AI rivals
- Day and night modes
- Optional street detail (signs, lamps, traffic lights) from Mapillary
- Works on desktop and phone (touch controls)

## Controls

| Action | Keys |
|---|---|
| Steer / throttle / brake | Arrow keys or WASD |
| Drift | Shift |
| Nitro | Space |
| Day / night | N |

## Tech

Vite · three.js · Vercel serverless function (Mapillary proxy) · Python data pipeline for baking OSM tracks.

## Run locally

```bash
npm install
npm run dev      # local dev server
npm run build    # production build in dist/
```

Street detail needs a Mapillary token in the `MLY_TOKEN` environment variable (set it in Vercel). The game works fine without it.

More detail on the generation pipeline: [docs/TECHNICAL.md](docs/TECHNICAL.md).

## Credits

Map data © OpenStreetMap contributors (ODbL). Street detail © Mapillary contributors (CC BY-SA).

Sister project: [Real World Voxel Racing](https://github.com/moansari1234/realworldvoxel).
