/**
 * The Saturn coin as a hologram, drawn on a canvas: a small emitter at the bottom projects a beam of
 * green light, and in it a see-through hexagon coin turns on its vertical axis (its ridged edge shows
 * as it goes round) while the outline Saturn floats in front, always facing you, spinning on its own
 * axis the other way. Scanlines scroll through it, a bright band sweeps up, it flickers a little and
 * glitches now and then, with a faint cyan fringe like a real projection.
 * One loop is COIN_PERIOD seconds, so recordings loop seamlessly. The glow is a CSS drop-shadow.
 */
type P2 = [number, number];

const GREEN = [61, 255, 139];
const GREY = [150, 155, 166];
/** the colour of the current draw: green when on, grey when powered off */
let G = '61,255,139';
let POWER = 1;
const R = 46; // hexagon vertex radius, in coin units (the canvas is 112 units wide)
const CORNER = 7;
const T = 7.5; // thickness
const D = 320; // camera distance, for a little perspective
export const COIN_PERIOD = 6; // s: the coin turns once, the planet twice the other way
export const COIN_ASPECT = 1.3; // canvas height / width
const TAU = Math.PI * 2;

const outline: P2[] = [];
const ridges: { p: P2; n: P2 }[] = [];
(() => {
	const v: P2[] = [0, 60, 120, 180, 240, 300].map((a) => [R * Math.cos((a * Math.PI) / 180), R * Math.sin((a * Math.PI) / 180)]);
	const toward = (a: P2, b: P2): P2 => {
		const t = CORNER / Math.hypot(b[0] - a[0], b[1] - a[1]);
		return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
	};
	for (let i = 0; i < 6; i++) {
		const p = v[i];
		const a = toward(p, v[(i + 5) % 6]);
		const b = toward(p, v[(i + 1) % 6]);
		for (let s = 0; s <= 8; s++) {
			const u = s / 8;
			outline.push([(1 - u) ** 2 * a[0] + 2 * (1 - u) * u * p[0] + u * u * b[0], (1 - u) ** 2 * a[1] + 2 * (1 - u) * u * p[1] + u * u * b[1]]);
		}
		const c = toward(v[(i + 1) % 6], p);
		const ang = ((i * 60 + 30) * Math.PI) / 180;
		for (const u of [0.3, 0.7]) ridges.push({ p: [b[0] + (c[0] - b[0]) * u, b[1] + (c[1] - b[1]) * u], n: [Math.cos(ang), Math.sin(ang)] });
	}
})();

function hull(pts: P2[]): P2[] {
	const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
	const cross = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
	const lo: P2[] = [];
	const up: P2[] = [];
	for (const q of p) {
		while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
		lo.push(q);
	}
	for (let i = p.length - 1; i >= 0; i--) {
		const q = p[i];
		while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
		up.push(q);
	}
	up.pop();
	lo.pop();
	return lo.concat(up);
}

// minimal Saturn: outline, two rings, three lines of longitude, the equator
const RINGS: [number, number, number, number][] = [
	[45, 12.5, 1.6, 1],
	[33, 8.6, 1, 0.6],
];
const SPARKS = [
	{ ring: 0, a: 0.4, m: 1 },
	{ ring: 0, a: 3.4, m: 2 },
	{ ring: 1, a: 1.9, m: 1 },
];
// light rising up the beam: [x across the beam -1..1, phase, laps per loop]
const MOTES: [number, number, number][] = [
	[-0.55, 0.05, 2], [0.2, 0.38, 3], [0.62, 0.71, 2], [-0.15, 0.55, 3], [0.4, 0.15, 1], [-0.75, 0.86, 2],
];
// glitches: [start, end] as fractions of the loop
const GLITCHES: Record<CoinStyle, [number, number][]> = {
	hologram: [
		[0.415, 0.44],
		[0.885, 0.9],
	],
	// the flat cursor Saturn inside a 3D coin glitches more, like the projection can't quite hold it
	cursor: [
		[0.16, 0.175],
		[0.415, 0.445],
		[0.64, 0.652],
		[0.885, 0.905],
	],
};
/** hologram: a 3D Saturn facing you; cursor: the website cursor's flat Saturn, spinning the same way */
export type CoinStyle = 'hologram' | 'cursor';

/** line weight multiplier for the current draw (thicker lines at small sizes) */
let WT = 1;
let off: HTMLCanvasElement | null = null;
let tint: HTMLCanvasElement | null = null;

function drawPlanet(o: CanvasRenderingContext2D, cx: number, cy: number, s: number, spin: number, loop: number) {
	o.save();
	o.translate(cx, cy);
	o.rotate((-20 * Math.PI) / 180);
	o.scale(s, s);
	const stroke = (alpha: number, width: number) => {
		o.strokeStyle = `rgba(${G},${alpha})`;
		o.lineWidth = width * WT;
		o.stroke();
	};
	// rings: the far half is behind the planet, so dimmer
	for (const [rx, ry, w, a] of RINGS) {
		o.beginPath();
		o.ellipse(0, 0, rx, ry, 0, Math.PI, TAU);
		stroke(a * 0.35, w);
	}
	o.beginPath();
	o.arc(0, 0, 19, 0, TAU);
	o.fillStyle = `rgba(${G},.05)`;
	o.fill();
	o.save();
	o.beginPath();
	o.arc(0, 0, 19, 0, TAU);
	o.clip();
	o.beginPath();
	o.ellipse(0, 0, 19, 3.4, 0, 0, Math.PI);
	stroke(0.55, 0.95);
	for (let j = 0; j < 6; j++) {
		const lon = spin + (j * Math.PI) / 3;
		const c = Math.cos(lon);
		const sn = Math.sin(lon);
		o.beginPath();
		for (let q = 0; q <= 24; q++) {
			const lat = -Math.PI / 2 + (q * Math.PI) / 24;
			const x = 19 * Math.cos(lat) * sn;
			const y = 19 * Math.sin(lat);
			if (q) o.lineTo(x, y);
			else o.moveTo(x, y);
		}
		stroke(c > 0 ? 0.15 + 0.7 * c : 0.07, 0.95);
	}
	o.restore();
	o.beginPath();
	o.arc(0, 0, 19, 0, TAU);
	stroke(1, 1.6);
	for (const [rx, ry, w, a] of RINGS) {
		o.beginPath();
		o.ellipse(0, 0, rx, ry, 0, 0, Math.PI);
		stroke(a, w);
	}
	o.fillStyle = `rgba(200,255,222,${POWER.toFixed(3)})`;
	for (const sp of SPARKS) {
		const [rx, ry] = RINGS[sp.ring];
		const a = sp.a + loop * TAU * sp.m;
		const x = rx * Math.cos(a);
		const y = ry * Math.sin(a);
		if (y < 0 && Math.abs(x) < 19.5) continue;
		o.beginPath();
		o.arc(x, y, 1, 0, TAU);
		o.fill();
	}
	o.restore();
}

/**
 * The website cursor's Saturn exactly: flat, tilted, its lines of longitude drawn as ellipses that
 * widen and narrow as it spins (`spin` radians), the far half of the rings hidden behind it.
 */
function drawCursorPlanet(o: CanvasRenderingContext2D, cx: number, cy: number, s: number, spin: number) {
	o.save();
	o.translate(cx, cy);
	o.rotate((-20 * Math.PI) / 180);
	o.scale(s, s);
	const stroke = (alpha: number, width: number) => {
		o.strokeStyle = `rgba(${G},${alpha})`;
		o.lineWidth = width * WT;
		o.stroke();
	};
	o.setLineDash([2, 3.5]);
	o.beginPath();
	o.moveTo(0, -29);
	o.lineTo(0, 29);
	stroke(0.55, 1.6);
	o.setLineDash([]);
	const rings: [number, number, number, number][] = [
		[45, 12.5, 2.6, 1],
		[32, 8, 1.8, 0.75],
	];
	// the far half of the rings, except where the planet is in front of it
	o.save();
	o.beginPath();
	o.rect(-60, -40, 120, 80);
	o.arc(0, 0, 21, 0, TAU, true);
	o.clip('evenodd');
	for (const [rx, ry, w, a] of rings) {
		o.beginPath();
		o.ellipse(0, 0, rx, ry, 0, Math.PI, TAU);
		stroke(a, w);
	}
	o.restore();
	o.beginPath();
	o.arc(0, 0, 19, 0, TAU);
	stroke(1, 2.6);
	o.save();
	o.beginPath();
	o.arc(0, 0, 19, 0, TAU);
	o.clip();
	for (const [x, y, ry] of [
		[17, -8, 3],
		[19, 1, 3.5],
		[16, 10, 3],
	]) {
		o.beginPath();
		o.ellipse(0, y, x, ry, 0, 0, Math.PI);
		stroke(0.7, 1.6);
	}
	for (let i = 0; i < 3; i++) {
		const lon = spin + (i * Math.PI) / 3;
		o.beginPath();
		o.ellipse(0, 0, Math.max(0.01, Math.abs(Math.sin(lon)) * 19), 19, 0, 0, TAU);
		stroke(0.25 + 0.6 * Math.max(0, Math.cos(lon)), 1.6);
	}
	o.restore();
	for (const [rx, ry, w, a] of rings) {
		o.beginPath();
		o.ellipse(0, 0, rx, ry, 0, 0, Math.PI);
		stroke(a, w);
	}
	o.restore();
}

export type CoinOptions = {
	style?: CoinStyle;
	/** the emitter and beam under the coin (canvas COIN_ASPECT times as tall as wide); off: just the coin, centred */
	beam?: boolean;
	/** 0..1: how bright the projection is (the power button dims it when off) */
	energy?: number;
	/** 0..1: powered off (grey, no beam, the projector unlit) to on (green light) */
	power?: number;
	/** line weight multiplier, for drawing it small (a header icon) */
	weight?: number;
	/** time (s) for the scanlines, sweep and flicker, if they should keep moving while the coin holds still */
	fxT?: number;
	glitches?: boolean;
};

/**
 * Draw the hologram on a canvas `w` CSS pixels wide. `t` (s) is where the spin is: the coin is face
 * on at every whole COIN_PERIOD.
 */
export function drawCoin(ctx: CanvasRenderingContext2D, w: number, t: number, opts: CoinOptions | CoinStyle = {}) {
	const { style = 'hologram', beam: withBeam = true, energy = 1, fxT = t, glitches = false, weight = 1, power: pw = 1 } = typeof opts === 'string' ? { style: opts } : opts;
	const power = Math.max(0, Math.min(1, pw));
	POWER = power;
	G = GREY.map((g, i) => Math.round(g + (GREEN[i] - g) * power)).join(',');
	WT = weight;
	const main = ctx.canvas;
	const dpr = main.width / w;
	if (!off || off.width !== main.width || off.height !== main.height) {
		off = document.createElement('canvas');
		tint = document.createElement('canvas');
		off.width = tint.width = main.width;
		off.height = tint.height = main.height;
	}
	const o = off.getContext('2d')!;
	const h = main.height / dpr;
	const k = withBeam ? w / 112 : Math.min(w, h) / 100;
	const loop = (((t % COIN_PERIOD) + COIN_PERIOD) % COIN_PERIOD) / COIN_PERIOD;
	const fx = (((fxT % COIN_PERIOD) + COIN_PERIOD) % COIN_PERIOD) / COIN_PERIOD;

	o.setTransform(1, 0, 0, 1, 0, 0);
	o.globalCompositeOperation = 'source-over';
	o.clearRect(0, 0, off.width, off.height);
	o.setTransform(dpr, 0, 0, dpr, 0, 0);
	o.globalCompositeOperation = 'lighter';
	o.lineJoin = 'round';
	o.lineCap = 'round';

	// the projector
	const cx = w / 2;
	const ey = h - 12 * k;
	const bob = Math.sin(loop * TAU) * 1.6 * k;
	const cy = withBeam ? 58 * k + bob : h / 2 + bob * 0.5;
	if (withBeam) {
	const glowE = o.createRadialGradient(cx, ey, 0, cx, ey, 22 * k);
	glowE.addColorStop(0, `rgba(${G},${(0.35 * power).toFixed(3)})`);
	glowE.addColorStop(1, `rgba(${G},0)`);
	o.fillStyle = glowE;
	o.fillRect(cx - 24 * k, ey - 10 * k, 48 * k, 20 * k);
	o.beginPath();
	o.ellipse(cx, ey, 15 * k, 3.4 * k, 0, 0, TAU);
	o.strokeStyle = `rgba(${G},${(0.55 + 0.4 * power).toFixed(3)})`;
	o.lineWidth = 1.3 * k * WT;
	o.stroke();
	o.beginPath();
	o.ellipse(cx, ey, 7 * k, 1.6 * k, 0, 0, TAU);
	o.strokeStyle = `rgba(${G},.55)`;
	o.lineWidth = 0.8 * k * WT;
	o.stroke();
	// the beam, widening up towards the coin
	const top = cy + 30 * k;
	const beam = o.createLinearGradient(0, ey, 0, top - 30 * k);
	beam.addColorStop(0, `rgba(${G},${(0.2 * power).toFixed(3)})`);
	beam.addColorStop(0.6, `rgba(${G},${(0.05 * power).toFixed(3)})`);
	beam.addColorStop(1, `rgba(${G},0)`);
	o.beginPath();
	o.moveTo(cx - 13 * k, ey);
	o.lineTo(cx - 46 * k, top - 30 * k);
	o.lineTo(cx + 46 * k, top - 30 * k);
	o.lineTo(cx + 13 * k, ey);
	o.closePath();
	o.fillStyle = beam;
	o.fill();
	for (const [mx, ph, laps] of MOTES) {
		const u = (loop * laps + ph) % 1; // 0 at the emitter, 1 at the coin
		const y = ey - u * (ey - top);
		const half = 13 * k + u * 30 * k;
		o.beginPath();
		o.arc(cx + mx * half, y, 0.75 * k, 0, TAU);
		o.fillStyle = `rgba(200,255,222,${(Math.sin(u * Math.PI) * 0.8 * power).toFixed(3)})`;
		o.fill();
	}
	}

	// the coin, see-through light
	const th = loop * TAU;
	const ph = ((16 + 6 * Math.sin(loop * TAU)) * Math.PI) / 180;
	const cT = Math.cos(th);
	const sT = Math.sin(th);
	const cP = Math.cos(ph);
	const sP = Math.sin(ph);
	const proj = (x: number, y: number, z: number): P2 => {
		const x1 = x * cT + z * sT;
		const z1 = -x * sT + z * cT;
		const y2 = y * cP - z1 * sP;
		const z2 = y * sP + z1 * cP;
		const f = D / (D - z2);
		return [cx + x1 * f * k, cy + y2 * f * k];
	};
	const front = outline.map(([x, y]) => proj(x, y, T / 2));
	const back = outline.map(([x, y]) => proj(x, y, -T / 2));
	const facingFront = cT * cP > 0;
	const face = facingFront ? front : back;
	const far = facingFront ? back : front;
	const poly = (pts: P2[]) => {
		o.beginPath();
		pts.forEach(([x, y], i) => (i ? o.lineTo(x, y) : o.moveTo(x, y)));
		o.closePath();
	};
	poly(far);
	o.strokeStyle = `rgba(${G},.13)`;
	o.lineWidth = 0.9 * k * WT;
	o.stroke();
	poly(hull([...front, ...back]));
	o.strokeStyle = `rgba(${G},.4)`;
	o.lineWidth = 1 * k * WT;
	o.stroke();
	o.beginPath();
	for (const r of ridges) {
		if (r.n[1] * sP - r.n[0] * sT * cP <= 0.03) continue;
		const a = proj(r.p[0], r.p[1], T / 2 - 0.9);
		const b = proj(r.p[0], r.p[1], -T / 2 + 0.9);
		o.moveTo(a[0], a[1]);
		o.lineTo(b[0], b[1]);
	}
	o.strokeStyle = `rgba(${G},.38)`;
	o.lineWidth = 0.6 * k * WT;
	o.stroke();
	poly(face);
	o.fillStyle = `rgba(${G},.045)`;
	o.fill();
	o.strokeStyle = `rgb(${G})`;
	o.lineWidth = 1.7 * k * WT;
	o.stroke();

	if (style === 'cursor') drawCursorPlanet(o, cx, cy, k * 0.6, loop * TAU * 1.5);
	else drawPlanet(o, cx, cy, k * 0.64, -loop * TAU * 2, loop);

	// scanlines scrolling up through it, and a bright band sweeping up twice a loop
	o.setTransform(1, 0, 0, 1, 0, 0);
	o.globalCompositeOperation = 'destination-out';
	o.fillStyle = `rgba(0,0,0,${(0.42 * power).toFixed(3)})`;
	const step = 3 * dpr;
	const shift = (fx * 20 * step) % step;
	for (let y = -shift; y < off.height; y += step) o.fillRect(0, y, off.width, dpr);
	o.globalCompositeOperation = 'source-atop';
	const by = off.height * (1.1 - 1.3 * ((fx * 2) % 1));
	const band = o.createLinearGradient(0, by - 14 * dpr, 0, by + 14 * dpr);
	band.addColorStop(0, 'rgba(255,255,255,0)');
	band.addColorStop(0.5, `rgba(220,255,235,${(0.28 * power).toFixed(3)})`);
	band.addColorStop(1, 'rgba(255,255,255,0)');
	o.fillStyle = band;
	o.fillRect(0, by - 14 * dpr, off.width, 28 * dpr);

	// a cyan copy for the colour fringe
	const tc = tint!.getContext('2d')!;
	tc.globalCompositeOperation = 'source-over';
	tc.clearRect(0, 0, tint!.width, tint!.height);
	tc.drawImage(off, 0, 0);
	tc.globalCompositeOperation = 'source-in';
	tc.fillStyle = 'rgb(90,210,255)';
	tc.fillRect(0, 0, tint!.width, tint!.height);

	const glitch = glitches ? GLITCHES[style].find(([a, b]) => loop >= a && loop < b) : undefined;
	// a steady projection: just the faintest shimmer
	const flicker = (0.97 + 0.03 * Math.sin(fx * TAU * 3)) * (0.42 + 0.58 * Math.max(0, Math.min(1, energy)));
	ctx.save();
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.clearRect(0, 0, main.width, main.height);
	ctx.globalAlpha = (glitch ? 0.5 : 0.28) * flicker * power;
	ctx.drawImage(tint!, -(glitch ? 3.5 : 1) * dpr, 0);
	ctx.globalAlpha = (glitch ? 0.75 : 1) * flicker;
	ctx.globalCompositeOperation = 'lighter';
	ctx.drawImage(off, 0, 0);
	if (glitch) {
		// a few slices of the picture jump sideways
		const g = Math.floor(((loop - glitch[0]) / (glitch[1] - glitch[0])) * 3);
		const slices: [number, number, number][] = [
			[0.24, 0.035, 5],
			[0.39, 0.02, -7],
			[0.46, 0.05, 4],
			[0.63, 0.025, -5],
		];
		ctx.globalCompositeOperation = 'source-over';
		ctx.globalAlpha = flicker;
		for (const [fy, fh, dx] of slices) {
			const y = Math.round((fy + g * 0.04) * main.height);
			const sh = Math.max(2, Math.round(fh * main.height));
			ctx.clearRect(0, y, main.width, sh);
			ctx.drawImage(off, 0, y, main.width, sh, dx * (g % 2 ? -1 : 1) * dpr, y, main.width, sh);
		}
	}
	ctx.restore();
}
