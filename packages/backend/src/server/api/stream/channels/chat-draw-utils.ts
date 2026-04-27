/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const MAX_POINTS_PER_STROKE = 2000;
const MIN_WIDTH = 0.0005;
const MAX_WIDTH = 0.25;
const MAX_TEXT_LEN = 1000;
// Tile-patch limits. The patch is the dirty rect of a completed main-layer stroke,
// encoded as a base64 PNG. Cap at the canvas size we actually render at and 2 MB of
// base64 per patch so a single stroke can't blow up the WebSocket payload budget.
const MAX_TILE_PIXEL_DIMENSION = 1024;
const MAX_TILE_PATCH_BASE64_BYTES = 2 * 1024 * 1024;

export type SanitizedDrawStroke = {
	id?: string;
	points: number[][];
	color: string;
	width: number;
	tool: 'pen' | 'eraser' | 'fill' | 'paint' | 'watercolor' | 'text' | 'mixer' | 'airbrush';
	layer?: 'main' | 'draft' | 'lineart';
	clip?: boolean;
	text?: string;
	hardness?: number;
	core?: boolean;
};

export function sanitizeDrawStroke(input: unknown): SanitizedDrawStroke | null {
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
		? Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, widthNum))
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

	// Strip control chars except \n; cap length so a single text stroke can't bloat the doc.
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

// A raster tile patch represents the dirty rect produced by a completed main-layer
// stroke. The author renders the stroke into their local mainCanvas, extracts the
// affected rect as a PNG, and broadcasts it. Receivers decode the PNG and draw it
// into their mainCanvas at (x, y) with the given composite mode. The wire form
// trades stroke-vector compactness for arbitrary brush expressiveness — anything
// the author's canvas can render is faithfully reproduced on every peer.
export type SanitizedDrawTilePatch = {
	id?: string;
	x: number;
	y: number;
	width: number;
	height: number;
	dataBase64: string;
	composite: 'source-over' | 'destination-out' | 'source-atop';
};

export function sanitizeDrawTilePatch(input: unknown): SanitizedDrawTilePatch | null {
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
	// Only the small fixed set of composite modes we actually use.
	const composite: SanitizedDrawTilePatch['composite'] =
		raw.composite === 'destination-out' ? 'destination-out' :
		raw.composite === 'source-atop' ? 'source-atop' :
		'source-over';
	const id = typeof raw.id === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(raw.id) ? raw.id : undefined;
	return { id, x, y, width, height, dataBase64, composite };
}
