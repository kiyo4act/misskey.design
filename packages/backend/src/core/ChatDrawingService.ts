/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { createCanvas, loadImage, type Canvas, type Image } from '@napi-rs/canvas';
import * as Redis from 'ioredis';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import type { ChatDrawingsRepository, ChatRoomsRepository, ChatRoomMembershipsRepository } from '@/models/_.js';
import { MiChatDrawing, type ChatDrawingStroke } from '@/models/ChatDrawing.js';
import type { MiUser } from '@/models/User.js';
import type { MiChatRoom } from '@/models/ChatRoom.js';
import { IdService } from '@/core/IdService.js';
import { InternalStorageService } from '@/core/InternalStorageService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { S3Service } from '@/core/S3Service.js';
import type { MiMeta } from '@/models/Meta.js';
import type { Config } from '@/config.js';

const MAX_STROKES = 4000;
const MAX_POINTS_PER_STROKE = 2000;
const MIN_STROKE_WIDTH = 0.0005;
const MAX_STROKE_WIDTH = 0.25;
const MAX_TEXT_LEN = 1000;
const DEFAULT_WIDTH = 1024;
const DEFAULT_HEIGHT = 768;
// Redis live buffer: strokes sent via WebSocket that have not yet been committed via update.
const LIVE_BUFFER_TTL_SECONDS = 60 * 60 * 24; // 24h
const LIVE_BUFFER_MAX_LEN = MAX_STROKES;
const liveBufferKey = (drawingId: string) => `chatDrawingBuf:${drawingId}`;
// Tile-patch live buffer: PNG patches for the main (raster) layer that haven't been
// committed via update yet. Capped by count so a flood of fine strokes can't OOM Redis;
// each patch can be up to ~2MB base64.
const LIVE_TILE_BUFFER_MAX_LEN = 200;
const liveTileBufferKey = (drawingId: string) => `chatDrawingTileBuf:${drawingId}`;

const MAX_TITLE_LEN = 256;

function sanitizeTitle(raw: unknown): string {
	if (typeof raw !== 'string') return '';
	return raw.trim().slice(0, MAX_TITLE_LEN);
}

function sanitizeStroke(input: unknown): ChatDrawingStroke | null {
	if (!input || typeof input !== 'object') return null;
	const raw = input as Record<string, unknown>;

	if (!Array.isArray(raw.points)) return null;
	const points: number[][] = [];
	for (const p of raw.points) {
		if (!Array.isArray(p) || p.length < 2) continue;
		const x = Number(p[0]);
		const y = Number(p[1]);
		if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
		const cx = Math.max(0, Math.min(1, x));
		const cy = Math.max(0, Math.min(1, y));
		if (p.length >= 3) {
			const pr = Number(p[2]);
			const cp = Number.isFinite(pr) ? Math.max(0, Math.min(1, pr)) : 1;
			points.push([cx, cy, cp]);
		} else {
			points.push([cx, cy]);
		}
		if (points.length >= MAX_POINTS_PER_STROKE) break;
	}
	if (points.length === 0) return null;

	const color = typeof raw.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(raw.color)
		? raw.color
		: '#000000';

	const widthNum = Number(raw.width);
	const width = Number.isFinite(widthNum)
		? Math.max(MIN_STROKE_WIDTH, Math.min(MAX_STROKE_WIDTH, widthNum))
		: 0.01;

	const tool: 'pen' | 'eraser' | 'fill' | 'paint' | 'watercolor' | 'text' | 'mixer' | 'airbrush' =
		raw.tool === 'eraser' ? 'eraser' :
		raw.tool === 'fill' ? 'fill' :
		raw.tool === 'paint' ? 'paint' :
		raw.tool === 'watercolor' ? 'watercolor' :
		raw.tool === 'text' ? 'text' :
		raw.tool === 'mixer' ? 'mixer' :
		raw.tool === 'airbrush' ? 'airbrush' :
		'pen';

	const id = typeof raw.id === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(raw.id) ? raw.id : undefined;
	const layer: 'main' | 'draft' | 'lineart' =
		raw.layer === 'draft' ? 'draft' :
		raw.layer === 'lineart' ? 'lineart' :
		'main';
	const clip = raw.clip === true ? true : undefined;

	let text: string | undefined;
	if (tool === 'text' && typeof raw.text === 'string') {
		// eslint-disable-next-line no-control-regex
		text = raw.text.replace(/[\x00-\x09\x0B-\x1F\x7F]/g, '').slice(0, MAX_TEXT_LEN);
	}
	if (tool === 'text' && !text) return null;

	let hardness: number | undefined;
	let core: boolean | undefined;
	if (tool === 'airbrush') {
		const h = Number(raw.hardness);
		hardness = Number.isFinite(h) ? Math.max(0, Math.min(1, h)) : undefined;
		core = raw.core === true ? true : undefined;
	}

	return { id, points, color, width, tool, layer, clip, text, hardness, core };
}

// Mirror of the SanitizedDrawTilePatch wire shape, kept local so the service can be
// used outside the WebSocket layer (e.g., for late-joiner replay).
export type ChatDrawingTilePatch = {
	id?: string;
	x: number;
	y: number;
	width: number;
	height: number;
	dataBase64: string;
	composite: 'source-over' | 'destination-out' | 'source-atop';
};

const MAX_TILE_PIXEL_DIMENSION = 1024;
const MAX_TILE_PATCH_BASE64_BYTES = 2 * 1024 * 1024;

function sanitizeTilePatch(input: unknown): ChatDrawingTilePatch | null {
	if (!input || typeof input !== 'object') return null;
	const raw = input as Record<string, unknown>;
	const x = Math.floor(Number(raw.x));
	const y = Math.floor(Number(raw.y));
	const width = Math.floor(Number(raw.width));
	const height = Math.floor(Number(raw.height));
	if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) return null;
	if (width <= 0 || height <= 0) return null;
	if (width > MAX_TILE_PIXEL_DIMENSION || height > MAX_TILE_PIXEL_DIMENSION) return null;
	if (x < 0 || y < 0) return null;
	const dataBase64 = typeof raw.dataBase64 === 'string' ? raw.dataBase64 : null;
	if (!dataBase64) return null;
	if (dataBase64.length === 0 || dataBase64.length > MAX_TILE_PATCH_BASE64_BYTES) return null;
	const composite: ChatDrawingTilePatch['composite'] =
		raw.composite === 'destination-out' ? 'destination-out' :
		raw.composite === 'source-atop' ? 'source-atop' :
		'source-over';
	const id = typeof raw.id === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(raw.id) ? raw.id : undefined;
	return { id, x, y, width, height, dataBase64, composite };
}

function hexToRgba(hex: string): [number, number, number, number] {
	const s = hex.replace('#', '');
	if (s.length === 3) {
		return [parseInt(s[0] + s[0], 16), parseInt(s[1] + s[1], 16), parseInt(s[2] + s[2], 16), 255];
	}
	if (s.length === 6) {
		return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16), 255];
	}
	if (s.length === 8) {
		return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16), parseInt(s.slice(6, 8), 16)];
	}
	return [0, 0, 0, 255];
}

// Tolerance + coverage blending + gap-tolerant propagation.
//  - FLOOD_RGB_TOLERANCE / FLOOD_ALPHA_TOLERANCE: per-channel diff thresholds separating
//    "region" from "barrier". Alpha is gated tighter so thin pen-tablet pressure strokes
//    (low-alpha anti-aliased cores) form a proper barrier and don't leak fill.
//  - GAP_CLOSE_RADIUS: barriers are morphologically dilated by this radius, so small gaps
//    in outlines (e.g. imperfect pen loops) don't leak. Propagation is blocked across
//    any dilated barrier. Blending still uses the pixel's true distance to the seed,
//    so anti-aliased edges of the outline stay smooth.
// See the matching frontend comment for semantics. Split thresholds keep flood from
// leaking through anti-aliased pen edges on transparent layers — especially thin pen-tablet
// pressure strokes where alpha at the stroke core can be as low as ~15.
const FLOOD_RGB_TOLERANCE = 140;
const FLOOD_ALPHA_TOLERANCE = 16;
const RIM_TOLERANCE = 230;
const GAP_CLOSE_RADIUS = 3;
// Fills live on a separate layer from the outline — we can safely overshoot into the
// outline's anti-alias to eliminate the white halo without modifying the line layer.
const FILL_DILATE_ITERATIONS = 2;

// Reusable scratch Uint8Arrays for morphological / flood passes. Each fill previously
// allocated ~6 × 786KB masks → 5MB GC churn per fill. Pooled module-wide; safe because
// JS is single-threaded within a request and all usages are synchronous.
const scratchPool: (Uint8Array | null)[] = [null, null, null, null, null];

function getScratch(slot: number, n: number): Uint8Array {
	let buf = scratchPool[slot];
	if (!buf || buf.length < n) { buf = new Uint8Array(n); scratchPool[slot] = buf; } else buf.fill(0);
	return buf;
}

function dilateMask(mask: Uint8Array, w: number, h: number, radius: number): Uint8Array {
	const n = w * h;
	const temp = getScratch(0, n);
	for (let y = 0; y < h; y++) {
		const rowOff = y * w;
		for (let x = 0; x < w; x++) {
			let any = 0;
			const xMin = x - radius < 0 ? 0 : x - radius;
			const xMax = x + radius >= w ? w - 1 : x + radius;
			for (let xx = xMin; xx <= xMax; xx++) {
				if (mask[rowOff + xx]) { any = 1; break; }
			}
			temp[rowOff + x] = any;
		}
	}
	// Result writes into mask itself — callers either don't reuse the input or pass a
	// throwaway buffer. Saves one more allocation per call.
	for (let x = 0; x < w; x++) {
		for (let y = 0; y < h; y++) {
			let any = 0;
			const yMin = y - radius < 0 ? 0 : y - radius;
			const yMax = y + radius >= h ? h - 1 : y + radius;
			for (let yy = yMin; yy <= yMax; yy++) {
				if (temp[yy * w + x]) { any = 1; break; }
			}
			mask[y * w + x] = any;
		}
	}
	return mask;
}

function erodeMask(mask: Uint8Array, w: number, h: number, radius: number): Uint8Array {
	const n = w * h;
	const temp = getScratch(0, n);
	for (let y = 0; y < h; y++) {
		const rowOff = y * w;
		for (let x = 0; x < w; x++) {
			let all = 1;
			const xMin = x - radius < 0 ? 0 : x - radius;
			const xMax = x + radius >= w ? w - 1 : x + radius;
			for (let xx = xMin; xx <= xMax; xx++) {
				if (!mask[rowOff + xx]) { all = 0; break; }
			}
			temp[rowOff + x] = all;
		}
	}
	for (let x = 0; x < w; x++) {
		for (let y = 0; y < h; y++) {
			let all = 1;
			const yMin = y - radius < 0 ? 0 : y - radius;
			const yMax = y + radius >= h ? h - 1 : y + radius;
			for (let yy = yMin; yy <= yMax; yy++) {
				if (!temp[yy * w + x]) { all = 0; break; }
			}
			mask[y * w + x] = all;
		}
	}
	return mask;
}

function buildClosedBarrier(data: Uint8ClampedArray, w: number, h: number, tR: number, tG: number, tB: number, tA: number, radius: number): Uint8Array {
	const n = w * h;
	const barrier = new Uint8Array(n);
	for (let i = 0; i < n; i++) {
		const pos = i * 4;
		const rgbD = Math.max(
			Math.abs(data[pos] - tR),
			Math.abs(data[pos + 1] - tG),
			Math.abs(data[pos + 2] - tB),
		);
		const alphaD = Math.abs(data[pos + 3] - tA);
		if (rgbD > FLOOD_RGB_TOLERANCE || alphaD > FLOOD_ALPHA_TOLERANCE) barrier[i] = 1;
	}
	if (radius <= 0) return barrier;
	const dilated = dilateMask(barrier, w, h, radius);
	return erodeMask(dilated, w, h, radius);
}

// `sample` is the composite used for seed + barrier detection (e.g. main+lineart for a
// main-layer fill); `data` is the target layer the fill writes to. Pass `sample === data`
// to fall back to single-layer fill.
function floodFill(data: Uint8ClampedArray, sample: Uint8ClampedArray, w: number, h: number, sx: number, sy: number, fill: [number, number, number, number]): void {
	if (sx < 0 || sy < 0 || sx >= w || sy >= h) return;
	const startPos = (sy * w + sx) * 4;
	const tR = sample[startPos], tG = sample[startPos + 1], tB = sample[startPos + 2], tA = sample[startPos + 3];
	const [fR, fG, fB, fA] = fill;
	if (sample === data && tR === fR && tG === fG && tB === fB && tA === fA) return;

	const barrier = buildClosedBarrier(sample, w, h, tR, tG, tB, tA, GAP_CLOSE_RADIUS);
	barrier[sy * w + sx] = 0;

	const visited = getScratch(1, w * h);
	const sampleDiff = (pos: number) => Math.max(
		Math.abs(sample[pos] - tR),
		Math.abs(sample[pos + 1] - tG),
		Math.abs(sample[pos + 2] - tB),
		Math.abs(sample[pos + 3] - tA),
	);
	// Full replace on the TARGET layer; rim softness comes from the post-pass below.
	const blendAt = (pos: number) => {
		data[pos] = fR;
		data[pos + 1] = fG;
		data[pos + 2] = fB;
		data[pos + 3] = fA;
	};
	const rimBlendAt = (pos: number) => {
		const d = sampleDiff(pos);
		if (d >= RIM_TOLERANCE) return;
		const ratio = Math.max(0, 1 - d / RIM_TOLERANCE);
		data[pos] = Math.round(data[pos] + (fR - data[pos]) * ratio);
		data[pos + 1] = Math.round(data[pos + 1] + (fG - data[pos + 1]) * ratio);
		data[pos + 2] = Math.round(data[pos + 2] + (fB - data[pos + 2]) * ratio);
		data[pos + 3] = Math.round(data[pos + 3] + (fA - data[pos + 3]) * ratio);
	};
	const passable = (idx: number) => !visited[idx] && !barrier[idx];

	const stack: number[] = [sx, sy];
	while (stack.length > 0) {
		const y = stack.pop() as number;
		const x = stack.pop() as number;
		let xLeft = x;
		let idx = y * w + xLeft;
		while (xLeft >= 0 && passable(idx)) {
			xLeft--;
			idx--;
		}
		xLeft++;
		idx++;
		let spanAbove = false;
		let spanBelow = false;
		let xRight = xLeft;
		while (xRight < w && passable(idx)) {
			visited[idx] = 1;
			blendAt(idx * 4);
			if (y > 0) {
				const idxUp = idx - w;
				const matchUp = passable(idxUp);
				if (!spanAbove && matchUp) { stack.push(xRight, y - 1); spanAbove = true; } else if (spanAbove && !matchUp) spanAbove = false;
			}
			if (y < h - 1) {
				const idxDown = idx + w;
				const matchDown = passable(idxDown);
				if (!spanBelow && matchDown) { stack.push(xRight, y + 1); spanBelow = true; } else if (spanBelow && !matchDown) spanBelow = false;
			}
			xRight++;
			idx++;
		}
	}

	// Phase 2: fill pockets that primary couldn't reach — closed-gap interiors, acute-corner
	// tips, and any other pixel trapped inside the closing's barrier. Propagation is constrained
	// to pixels that are (a) inside closed_barrier and (b) fillable (diff <= tolerance). Since
	// closed_barrier only covers walls + closed holes (never the shape exterior), unlimited-depth
	// BFS here cannot leak past the outline: the exterior is simply not in barrier territory.
	{
		const q: number[] = [];
		const tryPush = (nIdx: number) => {
			if (visited[nIdx]) return;
			if (!barrier[nIdx]) return;
			const pos = nIdx * 4;
			// Passability is judged against the SAMPLE composite (what the user sees),
			// not the (often empty) target layer. Using `data` here caused Phase 2 to
			// treat every barrier pixel as passable — the fill painted over the outline.
			const rgbD = Math.max(
				Math.abs(sample[pos] - tR),
				Math.abs(sample[pos + 1] - tG),
				Math.abs(sample[pos + 2] - tB),
			);
			const alphaD = Math.abs(sample[pos + 3] - tA);
			if (rgbD > FLOOD_RGB_TOLERANCE || alphaD > FLOOD_ALPHA_TOLERANCE) return;
			visited[nIdx] = 1;
			blendAt(pos);
			q.push(nIdx);
		};
		for (let idx = 0; idx < w * h; idx++) {
			if (!visited[idx]) continue;
			const y = (idx / w) | 0;
			const x = idx - y * w;
			if (x > 0) tryPush(idx - 1);
			if (x < w - 1) tryPush(idx + 1);
			if (y > 0) tryPush(idx - w);
			if (y < h - 1) tryPush(idx + w);
		}
		let head = 0;
		while (head < q.length) {
			const idx = q[head++];
			const y = (idx / w) | 0;
			const x = idx - y * w;
			if (x > 0) tryPush(idx - 1);
			if (x < w - 1) tryPush(idx + 1);
			if (y > 0) tryPush(idx - w);
			if (y < h - 1) tryPush(idx + w);
		}
	}

	// Dilation pass: overshoot fill into the outline's anti-alias zone so no white halo
	// remains. Safe because the outline lives on a separate layer.
	{
		let frontier = getScratch(2, w * h);
		let next = getScratch(3, w * h);
		for (let idx = 0; idx < w * h; idx++) if (visited[idx]) frontier[idx] = 1;
		for (let iter = 0; iter < FILL_DILATE_ITERATIONS; iter++) {
			next.fill(0);
			let grew = false;
			for (let idx = 0; idx < w * h; idx++) {
				if (!frontier[idx]) continue;
				const y = (idx / w) | 0;
				const x = idx - y * w;
				const neighbors = [
					x > 0 ? idx - 1 : -1,
					x < w - 1 ? idx + 1 : -1,
					y > 0 ? idx - w : -1,
					y < h - 1 ? idx + w : -1,
				];
				for (const n of neighbors) {
					if (n < 0 || visited[n]) continue;
					if (!barrier[n]) continue;
					if (sampleDiff(n * 4) >= RIM_TOLERANCE) continue;
					const pos = n * 4;
					data[pos] = fR;
					data[pos + 1] = fG;
					data[pos + 2] = fB;
					data[pos + 3] = fA;
					visited[n] = 1;
					next[n] = 1;
					grew = true;
				}
			}
			if (!grew) break;
			const swap = frontier; frontier = next; next = swap;
		}
	}

	// Rim pass: soften any residual hairline where dilation stopped before the outline's true edge.
	{
		const rimProcessed = getScratch(4, w * h);
		for (let idx = 0; idx < w * h; idx++) {
			if (!visited[idx]) continue;
			const y = (idx / w) | 0;
			const x = idx - y * w;
			const neighbors = [
				x > 0 ? idx - 1 : -1,
				x < w - 1 ? idx + 1 : -1,
				y > 0 ? idx - w : -1,
				y < h - 1 ? idx + w : -1,
			];
			for (const n of neighbors) {
				if (n < 0) continue;
				if (visited[n] || rimProcessed[n]) continue;
				rimProcessed[n] = 1;
				rimBlendAt(n * 4);
			}
		}
	}
}

export function sanitizeStrokes(input: unknown): ChatDrawingStroke[] {
	if (!Array.isArray(input)) return [];
	const out: ChatDrawingStroke[] = [];
	for (const s of input) {
		if (out.length >= MAX_STROKES) break;
		const cleaned = sanitizeStroke(s);
		if (cleaned) out.push(cleaned);
	}
	return out;
}

// Unified server-side renderer for pen / paint / watercolor / mixer — must match the
// frontend's two-pass rendering. Stamp every segment onto a throwaway canvas at full
// alpha (with shadowBlur for watercolor; with sampled-and-mixed colour for mixer), then
// composite onto the target with the stroke's transparency in one go. Kills the bead
// artefact at segment endpoints when alpha < 1.
function renderBrushStrokeServer(
	ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
	stroke: ChatDrawingStroke,
	width: number,
	height: number,
): void {
	if (stroke.points.length === 0) return;
	const tmp: Canvas = createCanvas(width, height);
	const tctx = tmp.getContext('2d');
	const [r, g, b, alphaByte] = hexToRgba(stroke.color);
	const opaqueColor = `rgb(${r},${g},${b})`;
	tctx.lineCap = 'round';
	tctx.lineJoin = 'round';
	tctx.globalAlpha = 1;
	tctx.globalCompositeOperation = 'source-over';
	const isWatercolor = stroke.tool === 'watercolor';
	const isAirbrush = stroke.tool === 'airbrush';
	const isMixer = stroke.tool === 'mixer';
	if (isWatercolor || isAirbrush) {
		tctx.shadowColor = opaqueColor;
		tctx.shadowOffsetX = 0;
		tctx.shadowOffsetY = 0;
	}
	const baseWidth = Math.max(1, stroke.width * width);
	// Airbrush shadow-trick: render the source line off-canvas, offset shadow back into
	// view → halo without a visible core line. Must match the frontend's offset distance.
	const SHADOW_TRICK_DIST = width * 2;
	const abHardness = isAirbrush ? Math.max(0, Math.min(1, stroke.hardness ?? 0.3)) : 0;
	const abCore = isAirbrush && stroke.core === true;
	const abBlurFactor = (1 - abHardness) * 1.5;
	const abLineFactor = 0.3 + 0.7 * abHardness;
	const drawOne = (ax: number, ay: number, bx: number, by: number, avg: number) => {
		let drawAx = ax, drawBx = bx;
		if (isAirbrush) {
			tctx.shadowOffsetY = 0;
			tctx.shadowBlur = baseWidth * abBlurFactor * (0.5 + 0.5 * avg);
			tctx.lineWidth = Math.max(0.5, baseWidth * abLineFactor * (0.5 + 0.5 * avg));
			if (abCore) {
				tctx.shadowOffsetX = 0;
			} else {
				tctx.shadowOffsetX = SHADOW_TRICK_DIST;
				drawAx = ax - SHADOW_TRICK_DIST;
				drawBx = bx - SHADOW_TRICK_DIST;
			}
		} else if (isWatercolor) {
			tctx.shadowOffsetX = 0;
			tctx.shadowOffsetY = 0;
			tctx.shadowBlur = baseWidth * 0.7;
			tctx.lineWidth = Math.max(0.5, baseWidth * (0.4 + 0.6 * avg));
		} else {
			tctx.lineWidth = Math.max(0.5, baseWidth * avg);
		}
		if (isMixer) {
			const mx = Math.max(0, Math.min(width - 1, Math.round((ax + bx) / 2)));
			const my = Math.max(0, Math.min(height - 1, Math.round((ay + by) / 2)));
			let mr = r, mg = g, mb = b;
			try {
				const data = ctx.getImageData(mx, my, 1, 1).data;
				const w = 0.5 * (data[3] / 255);
				mr = Math.round(r * (1 - w) + data[0] * w);
				mg = Math.round(g * (1 - w) + data[1] * w);
				mb = Math.round(b * (1 - w) + data[2] * w);
			} catch { /* fall back to brush colour */ }
			tctx.strokeStyle = `rgb(${mr},${mg},${mb})`;
		} else {
			tctx.strokeStyle = opaqueColor;
		}
		tctx.beginPath();
		tctx.moveTo(drawAx, ay);
		tctx.lineTo(drawBx, by);
		tctx.stroke();
	};
	const p0 = stroke.points[0];
	if (stroke.points.length === 1) {
		const pr = p0.length >= 3 ? (p0[2] as number) : 1;
		drawOne(p0[0] * width, p0[1] * height, p0[0] * width + 0.01, p0[1] * height + 0.01, pr);
	} else {
		for (let i = 1; i < stroke.points.length; i++) {
			const a = stroke.points[i - 1];
			const b2 = stroke.points[i];
			const pa = a.length >= 3 ? (a[2] as number) : 1;
			const pb = b2.length >= 3 ? (b2[2] as number) : 1;
			const avg = (pa + pb) / 2;
			drawOne(a[0] * width, a[1] * height, b2[0] * width, b2[1] * height, avg);
		}
	}
	ctx.save();
	ctx.globalCompositeOperation = stroke.clip ? 'source-atop' : 'source-over';
	ctx.globalAlpha = alphaByte / 255;
	ctx.drawImage(tmp, 0, 0);
	ctx.restore();
}

function renderOneStroke(
	ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
	stroke: ChatDrawingStroke,
	width: number,
	height: number,
	layers?: { main: Canvas; draft: Canvas; lineart: Canvas; sample: Canvas },
): void {
	if (stroke.points.length === 0) return;

	if (stroke.tool === 'text') {
		if (!stroke.text) return;
		const fontPx = Math.max(4, stroke.width * width);
		const lineHeight = fontPx * 1.4;
		const lines = stroke.text.split('\n');
		const x = stroke.points[0][0] * width;
		const y = stroke.points[0][1] * height;
		ctx.save();
		ctx.font = `${fontPx}px sans-serif`;
		ctx.textBaseline = 'top';
		ctx.fillStyle = stroke.color;
		for (let i = 0; i < lines.length; i++) {
			ctx.fillText(lines[i], x, y + i * lineHeight);
		}
		ctx.restore();
		return;
	}

	if (stroke.tool === 'fill') {
		const [fx, fy] = stroke.points[0];
		const sx = Math.max(0, Math.min(width - 1, Math.floor(fx * width)));
		const sy = Math.max(0, Math.min(height - 1, Math.floor(fy * height)));
		const fillColor = hexToRgba(stroke.color);
		const imageData = ctx.getImageData(0, 0, width, height);
		// Fills on main or lineart sample a composite of main + lineart so outlines on
		// one layer block fills on the other. Fills on draft stay layer-local. The
		// sample canvas is shared across the whole render pass to avoid per-fill
		// allocation of a fresh 1024×768 buffer.
		let sampleData: Uint8ClampedArray = imageData.data;
		if (layers) {
			const strokeLayer = stroke.layer === 'draft' ? 'draft' : stroke.layer === 'lineart' ? 'lineart' : 'main';
			const sampleNames = strokeLayer === 'draft' ? (['draft'] as const) : (['main', 'lineart'] as const);
			const sampleCtx = layers.sample.getContext('2d');
			sampleCtx.save();
			sampleCtx.setTransform(1, 0, 0, 1, 0, 0);
			sampleCtx.globalCompositeOperation = 'source-over';
			sampleCtx.globalAlpha = 1;
			sampleCtx.clearRect(0, 0, width, height);
			for (const n of sampleNames) sampleCtx.drawImage(layers[n], 0, 0);
			sampleCtx.restore();
			sampleData = sampleCtx.getImageData(0, 0, width, height).data;
		}
		floodFill(imageData.data, sampleData, width, height, sx, sy, fillColor);
		ctx.putImageData(imageData, 0, 0);
		return;
	}

	if (stroke.tool === 'pen' || stroke.tool === 'paint' || stroke.tool === 'watercolor' || stroke.tool === 'mixer' || stroke.tool === 'airbrush') {
		renderBrushStrokeServer(ctx, stroke, width, height);
		return;
	}

	// Eraser only path — destination-out at full alpha, no bead artefact possible.
	ctx.save();
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	ctx.globalCompositeOperation = 'destination-out';
	ctx.strokeStyle = '#000';
	ctx.globalAlpha = 1;
	const baseWidth = Math.max(1, stroke.width * width);
	const p0 = stroke.points[0];
	if (stroke.points.length === 1) {
		const pr = p0.length >= 3 ? (p0[2] as number) : 1;
		ctx.lineWidth = Math.max(0.5, baseWidth * pr);
		ctx.beginPath();
		ctx.moveTo(p0[0] * width, p0[1] * height);
		ctx.lineTo(p0[0] * width + 0.01, p0[1] * height + 0.01);
		ctx.stroke();
	} else {
		for (let i = 1; i < stroke.points.length; i++) {
			const a = stroke.points[i - 1];
			const b = stroke.points[i];
			const pa = a.length >= 3 ? (a[2] as number) : 1;
			const pb = b.length >= 3 ? (b[2] as number) : 1;
			const avg = (pa + pb) / 2;
			ctx.lineWidth = Math.max(0.5, baseWidth * avg);
			ctx.beginPath();
			ctx.moveTo(a[0] * width, a[1] * height);
			ctx.lineTo(b[0] * width, b[1] * height);
			ctx.stroke();
		}
	}
	ctx.restore();
}

async function renderStrokesToPng(
	strokes: ChatDrawingStroke[],
	width: number,
	height: number,
	mainRasterPng?: Buffer | null,
): Promise<Buffer> {
	// New layer model: main is a raster bitmap (pre-baked by the client and persisted
	// independently); lineart and draft remain vector strokes. We start by loading the
	// main raster (if provided) into the main layer canvas, then replay non-main strokes
	// over their respective layers.
	//
	// Backward compat: if no main raster is provided (legacy drawing whose strokes still
	// include layer === 'main' entries, or a save from an old client), fall back to the
	// original behavior of rendering main strokes into the main layer.
	//
	// The DRAFT layer is intentionally EXCLUDED from the published PNG — it's a sketch
	// underlay kept in stored data so authors can continue editing, but it shouldn't be
	// visible in the chat thumbnail / final image. A fill on main may still sample the
	// draft via the draw-time sample composite it received, but draft strokes themselves
	// don't appear in the output.
	const mainLayer: Canvas = createCanvas(width, height);
	const draftLayer: Canvas = createCanvas(width, height);
	const lineartLayer: Canvas = createCanvas(width, height);
	// Shared sample buffer reused by every fill in this render pass.
	const sampleLayer: Canvas = createCanvas(width, height);
	const mainCtx = mainLayer.getContext('2d');
	const draftCtx = draftLayer.getContext('2d');
	const lineartCtx = lineartLayer.getContext('2d');

	let mainRasterApplied = false;
	if (mainRasterPng && mainRasterPng.length > 0) {
		try {
			const img: Image = await loadImage(mainRasterPng);
			mainCtx.drawImage(img, 0, 0, width, height);
			mainRasterApplied = true;
		} catch {
			// Fall through to stroke-replay path so we don't wedge saves on a bad raster.
		}
	}

	const layerHandles = { main: mainLayer, draft: draftLayer, lineart: lineartLayer, sample: sampleLayer };
	for (const stroke of strokes) {
		// Skip main-layer strokes when the raster supersedes them. Draft and lineart
		// remain vector and always replay.
		if (mainRasterApplied && (stroke.layer === undefined || stroke.layer === 'main')) continue;
		const targetCtx =
			stroke.layer === 'draft' ? draftCtx :
			stroke.layer === 'lineart' ? lineartCtx :
			mainCtx;
		renderOneStroke(targetCtx, stroke, width, height, layerHandles);
	}

	const out = createCanvas(width, height);
	const outCtx = out.getContext('2d');
	outCtx.fillStyle = '#ffffff';
	outCtx.fillRect(0, 0, width, height);
	outCtx.drawImage(mainLayer, 0, 0);
	outCtx.drawImage(lineartLayer, 0, 0);

	return out.encode('png');
}

// Render only the main layer to a PNG by rendering all main-layer strokes from a
// (legacy) stroke array. Used for the one-time migration when a drawing has no
// stored mainImageAccessKey yet but does have main strokes in `strokes[]`.
async function renderLegacyMainStrokesToPng(strokes: ChatDrawingStroke[], width: number, height: number): Promise<Buffer> {
	const mainLayer: Canvas = createCanvas(width, height);
	const draftLayer: Canvas = createCanvas(width, height);
	const lineartLayer: Canvas = createCanvas(width, height);
	const sampleLayer: Canvas = createCanvas(width, height);
	const mainCtx = mainLayer.getContext('2d');
	const draftCtx = draftLayer.getContext('2d');
	const lineartCtx = lineartLayer.getContext('2d');
	const layerHandles = { main: mainLayer, draft: draftLayer, lineart: lineartLayer, sample: sampleLayer };
	// Replay every stroke (not just main-layer ones) so cross-layer fills sample
	// the same composite that produced the original main pixels — then keep just the
	// main layer in the output.
	for (const stroke of strokes) {
		const targetCtx =
			stroke.layer === 'draft' ? draftCtx :
			stroke.layer === 'lineart' ? lineartCtx :
			mainCtx;
		renderOneStroke(targetCtx, stroke, width, height, layerHandles);
	}
	return mainLayer.encode('png');
}

function normalizeUserPair(aId: string, bId: string): { user1Id: string; user2Id: string } {
	return aId < bId
		? { user1Id: aId, user2Id: bId }
		: { user1Id: bId, user2Id: aId };
}

function drawingStorageKey(accessKey: string): string {
	return `chatdrawing-${accessKey}.png`;
}

@Injectable()
export class ChatDrawingService {
	constructor(
		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		@Inject(DI.chatDrawingsRepository)
		private chatDrawingsRepository: ChatDrawingsRepository,

		@Inject(DI.chatRoomsRepository)
		private chatRoomsRepository: ChatRoomsRepository,

		@Inject(DI.chatRoomMembershipsRepository)
		private chatRoomMembershipsRepository: ChatRoomMembershipsRepository,

		@Inject(DI.config)
		private config: Config,

		@Inject(DI.meta)
		private meta: MiMeta,

		private idService: IdService,
		private internalStorageService: InternalStorageService,
		private globalEventService: GlobalEventService,
		private s3Service: S3Service,
	) {
	}

	@bindThis
	public async appendLiveStroke(drawingId: string, stroke: ChatDrawingStroke): Promise<void> {
		const key = liveBufferKey(drawingId);
		const pipeline = this.redisClient.pipeline();
		pipeline.rpush(key, JSON.stringify(stroke));
		pipeline.ltrim(key, -LIVE_BUFFER_MAX_LEN, -1);
		pipeline.expire(key, LIVE_BUFFER_TTL_SECONDS);
		await pipeline.exec();
	}

	@bindThis
	public async getLiveStrokes(drawingId: string): Promise<ChatDrawingStroke[]> {
		const raw = await this.redisClient.lrange(liveBufferKey(drawingId), 0, -1);
		const out: ChatDrawingStroke[] = [];
		for (const item of raw) {
			try {
				const parsed = JSON.parse(item);
				const clean = sanitizeStroke(parsed);
				if (clean) out.push(clean);
			} catch {
				// skip malformed entry
			}
		}
		return out;
	}

	@bindThis
	public async appendLiveTilePatch(drawingId: string, patch: ChatDrawingTilePatch): Promise<void> {
		const clean = sanitizeTilePatch(patch);
		if (!clean) return;
		const key = liveTileBufferKey(drawingId);
		const pipeline = this.redisClient.pipeline();
		pipeline.rpush(key, JSON.stringify(clean));
		pipeline.ltrim(key, -LIVE_TILE_BUFFER_MAX_LEN, -1);
		pipeline.expire(key, LIVE_BUFFER_TTL_SECONDS);
		await pipeline.exec();
	}

	@bindThis
	public async getLiveTilePatches(drawingId: string): Promise<ChatDrawingTilePatch[]> {
		const raw = await this.redisClient.lrange(liveTileBufferKey(drawingId), 0, -1);
		const out: ChatDrawingTilePatch[] = [];
		for (const item of raw) {
			try {
				const parsed = JSON.parse(item);
				const clean = sanitizeTilePatch(parsed);
				if (clean) out.push(clean);
			} catch {
				// skip malformed entry
			}
		}
		return out;
	}

	@bindThis
	public async clearLiveStrokes(drawingId: string): Promise<void> {
		await this.redisClient.del(liveBufferKey(drawingId), liveTileBufferKey(drawingId));
	}

	@bindThis
	public async clearLiveBufferForClear(drawingId: string): Promise<void> {
		// called when clients send drawClear over WebSocket — forget buffered strokes
		// AND buffered raster patches
		await this.redisClient.del(liveBufferKey(drawingId), liveTileBufferKey(drawingId));
	}

	@bindThis
	public async removeBufferedStrokeById(drawingId: string, strokeId: string): Promise<void> {
		// drawUndo: drop the stroke with the matching id from the live buffer so late joiners
		// and subsequent packDrawing calls don't resurrect it.
		const key = liveBufferKey(drawingId);
		const raw = await this.redisClient.lrange(key, 0, -1);
		if (raw.length === 0) return;
		const kept: string[] = [];
		let changed = false;
		for (const item of raw) {
			try {
				const parsed = JSON.parse(item);
				if (parsed && parsed.id === strokeId) { changed = true; continue; }
			} catch { /* keep malformed as-is */ }
			kept.push(item);
		}
		if (!changed) return;
		const pipeline = this.redisClient.pipeline();
		pipeline.del(key);
		if (kept.length > 0) {
			pipeline.rpush(key, ...kept);
			pipeline.expire(key, LIVE_BUFFER_TTL_SECONDS);
		}
		await pipeline.exec();
	}

	@bindThis
	public async findById(drawingId: string): Promise<MiChatDrawing | null> {
		return this.chatDrawingsRepository.findOneBy({ id: drawingId });
	}

	@bindThis
	public async hasEditPermission(userId: MiUser['id'], drawing: MiChatDrawing): Promise<boolean> {
		if (drawing.roomId != null) {
			const room = await this.chatRoomsRepository.findOneBy({ id: drawing.roomId });
			if (!room) return false;
			if (room.ownerId === userId) return true;
			const membership = await this.chatRoomMembershipsRepository.findOneBy({ roomId: drawing.roomId, userId });
			return membership != null;
		}
		if (drawing.user1Id != null && drawing.user2Id != null) {
			return userId === drawing.user1Id || userId === drawing.user2Id;
		}
		return false;
	}

	@bindThis
	public async createForRoom(
		creator: MiUser,
		room: MiChatRoom,
		title: unknown,
		strokes: unknown,
	): Promise<MiChatDrawing> {
		const cleanStrokes = sanitizeStrokes(strokes);
		const cleanTitle = sanitizeTitle(title);
		const now = new Date();
		const accessKey = randomBytes(24).toString('hex');
		// Fresh drawings start empty — no main raster yet. The composite PNG is just
		// the white canvas + lineart strokes (none on create).
		const png = await renderStrokesToPng(cleanStrokes, DEFAULT_WIDTH, DEFAULT_HEIGHT);
		await this.storeDrawingPng(accessKey, png);

		const drawing = {
			id: this.idService.gen(now.getTime()),
			createdAt: now,
			updatedAt: now,
			createdById: creator.id,
			lastEditedById: creator.id,
			roomId: room.id,
			user1Id: null,
			user2Id: null,
			title: cleanTitle,
			strokes: cleanStrokes,
			width: DEFAULT_WIDTH,
			height: DEFAULT_HEIGHT,
			imageAccessKey: accessKey,
			imageSize: png.byteLength,
			mainImageAccessKey: null,
			mainImageSize: 0,
		} satisfies Partial<MiChatDrawing>;

		return await this.chatDrawingsRepository.insertOne(drawing);
	}

	@bindThis
	public async createForDm(
		creator: MiUser,
		otherUser: MiUser,
		title: unknown,
		strokes: unknown,
	): Promise<MiChatDrawing> {
		const { user1Id, user2Id } = normalizeUserPair(creator.id, otherUser.id);
		const cleanStrokes = sanitizeStrokes(strokes);
		const cleanTitle = sanitizeTitle(title);
		const now = new Date();
		const accessKey = randomBytes(24).toString('hex');
		const png = await renderStrokesToPng(cleanStrokes, DEFAULT_WIDTH, DEFAULT_HEIGHT);
		await this.storeDrawingPng(accessKey, png);

		const drawing = {
			id: this.idService.gen(now.getTime()),
			createdAt: now,
			updatedAt: now,
			createdById: creator.id,
			lastEditedById: creator.id,
			roomId: null,
			user1Id,
			user2Id,
			title: cleanTitle,
			strokes: cleanStrokes,
			width: DEFAULT_WIDTH,
			height: DEFAULT_HEIGHT,
			imageAccessKey: accessKey,
			imageSize: png.byteLength,
			mainImageAccessKey: null,
			mainImageSize: 0,
		} satisfies Partial<MiChatDrawing>;

		return await this.chatDrawingsRepository.insertOne(drawing);
	}

	@bindThis
	public async updateDrawing(
		editor: MiUser,
		drawing: MiChatDrawing,
		strokes: unknown,
		preBakedPng?: Buffer | null,
		mainRasterPng?: Buffer | null,
	): Promise<MiChatDrawing> {
		const allClean = sanitizeStrokes(strokes);
		const width = drawing.width || DEFAULT_WIDTH;
		const height = drawing.height || DEFAULT_HEIGHT;

		// Determine the authoritative main raster for this save:
		//   1. Client-supplied raster (the new path — every modern client provides this).
		//   2. Existing raster on the drawing if the client didn't update it.
		//   3. Legacy fallback: bake main strokes from the strokes array into a PNG,
		//      so a one-time migration happens on first save of an old drawing.
		let storedMainPng: Buffer | null = null;
		if (mainRasterPng && mainRasterPng.length > 0) {
			storedMainPng = mainRasterPng;
		} else if (drawing.mainImageAccessKey == null && allClean.some(s => s.layer === undefined || s.layer === 'main')) {
			storedMainPng = await renderLegacyMainStrokesToPng(allClean, width, height);
		}

		// Strokes stored in DB are now lineart + draft only; main is the raster. Drop
		// any main-layer strokes (they've been baked into either the client-supplied
		// raster or the legacy migration raster above).
		const persistedStrokes = (storedMainPng != null || drawing.mainImageAccessKey != null)
			? allClean.filter(s => s.layer === 'draft' || s.layer === 'lineart')
			: allClean;

		// Composite PNG: prefer the client-baked one. Otherwise we render it now using
		// the just-decided main raster + lineart strokes.
		const compositePng = preBakedPng && preBakedPng.length > 0
			? preBakedPng
			: await renderStrokesToPng(allClean, width, height, storedMainPng);

		const newAccessKey = randomBytes(24).toString('hex');
		await this.storeDrawingPng(newAccessKey, compositePng);

		// Rotate the main raster key only when we have new bytes to write — saves a no-op
		// upload + delete cycle when a save changed only the lineart layer.
		const oldMainAccessKey = drawing.mainImageAccessKey;
		let newMainAccessKey: string | null = drawing.mainImageAccessKey;
		let newMainSize = drawing.mainImageSize;
		if (storedMainPng != null) {
			const rotatedKey: string = randomBytes(24).toString('hex');
			await this.storeDrawingPng(rotatedKey, storedMainPng);
			newMainAccessKey = rotatedKey;
			newMainSize = storedMainPng.byteLength;
		}

		const oldAccessKey = drawing.imageAccessKey;

		const now = new Date();
		await this.chatDrawingsRepository.update(drawing.id, {
			strokes: persistedStrokes,
			updatedAt: now,
			lastEditedById: editor.id,
			imageAccessKey: newAccessKey,
			imageSize: compositePng.byteLength,
			mainImageAccessKey: newMainAccessKey,
			mainImageSize: newMainSize,
		});

		if (oldAccessKey && oldAccessKey !== newAccessKey) {
			await this.deleteDrawingPng(oldAccessKey);
		}
		if (oldMainAccessKey && oldMainAccessKey !== newMainAccessKey) {
			await this.deleteDrawingPng(oldMainAccessKey);
		}

		// persisted state is now the authoritative source; forget the live buffer
		await this.clearLiveStrokes(drawing.id);

		const updated = await this.chatDrawingsRepository.findOneByOrFail({ id: drawing.id });

		const publishedImageUrl = this.publicImageUrl(newAccessKey) ?? '';
		if (updated.roomId != null) {
			this.globalEventService.publishChatRoomStream(updated.roomId, 'drawingUpdated', {
				drawingId: updated.id,
				imageAccessKey: newAccessKey,
				imageUrl: publishedImageUrl,
				updatedAt: now.toISOString(),
				lastEditedById: editor.id,
			});
		} else if (updated.user1Id != null && updated.user2Id != null) {
			const payload = {
				drawingId: updated.id,
				imageAccessKey: newAccessKey,
				imageUrl: publishedImageUrl,
				updatedAt: now.toISOString(),
				lastEditedById: editor.id,
			};
			this.globalEventService.publishChatUserStream(updated.user1Id, updated.user2Id, 'drawingUpdated', payload);
			this.globalEventService.publishChatUserStream(updated.user2Id, updated.user1Id, 'drawingUpdated', payload);
		}

		return updated;
	}

	@bindThis
	public imageStoragePath(accessKey: string): string {
		return this.internalStorageService.resolvePath(drawingStorageKey(accessKey));
	}

	@bindThis
	public readImage(accessKey: string): NodeJS.ReadableStream {
		return this.internalStorageService.read(drawingStorageKey(accessKey));
	}

	// R2 / S3-compatible object-storage key for a drawing PNG. Uses a dedicated prefix
	// so chat-drawing objects don't collide with Drive uploads in the same bucket.
	private objectStorageKey(accessKey: string): string {
		return `chat-drawings/chatdrawing-${accessKey}.png`;
	}

	// Public URL for a drawing PNG. When the instance is configured for object storage
	// we return the direct CDN-fronted bucket URL — clients fetch from R2 directly and
	// the app server never touches the image again. Otherwise fall back to the legacy
	// `/chat-drawings/:key.png` route served from InternalStorage.
	@bindThis
	public publicImageUrl(accessKey: string | null): string | null {
		if (!accessKey) return null;
		if (this.meta.useObjectStorage) {
			const baseUrl = this.meta.objectStorageBaseUrl
				?? `${this.meta.objectStorageUseSSL ? 'https' : 'http'}://${this.meta.objectStorageEndpoint}${this.meta.objectStoragePort ? `:${this.meta.objectStoragePort}` : ''}/${this.meta.objectStorageBucket}`;
			return `${baseUrl}/${this.objectStorageKey(accessKey)}`;
		}
		return `${this.config.url}/chat-drawings/${accessKey}.png`;
	}

	@bindThis
	public async storeDrawingPng(accessKey: string, png: Buffer): Promise<void> {
		if (this.meta.useObjectStorage && this.meta.objectStorageBucket) {
			await this.s3Service.upload(this.meta, {
				Bucket: this.meta.objectStorageBucket,
				Key: this.objectStorageKey(accessKey),
				Body: png,
				ContentType: 'image/png',
				CacheControl: 'max-age=31536000, immutable',
				...(this.meta.objectStorageSetPublicRead ? { ACL: 'public-read' as const } : {}),
			});
		} else {
			this.internalStorageService.saveFromBuffer(drawingStorageKey(accessKey), png);
		}
	}

	@bindThis
	public async deleteDrawingPng(accessKey: string): Promise<void> {
		if (this.meta.useObjectStorage && this.meta.objectStorageBucket) {
			// Idempotent; swallow failures so a missing old object doesn't break the save path.
			try {
				await this.s3Service.delete(this.meta, {
					Bucket: this.meta.objectStorageBucket,
					Key: this.objectStorageKey(accessKey),
				});
			} catch { /* noop */ }
		} else {
			this.internalStorageService.del(drawingStorageKey(accessKey));
		}
	}
}
