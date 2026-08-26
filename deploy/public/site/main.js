// RWF site — entry point. Boots reveals, the handicap demo, and both 3D scenes.
import { initReveals } from './reveal.js';
import { initHandicap } from './handicap.js';
import { initHero } from './hero-scene.js';
import { initGraph } from './graph-scene.js';

initReveals();
initHandicap();

const heroMount = document.getElementById('heroCanvas');
if (heroMount) initHero(heroMount);

const graphMount = document.getElementById('graphCanvas');
if (graphMount) initGraph(graphMount);
