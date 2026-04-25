/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const MAX_POINTS_PER_STROKE = 2000;
const MIN_WIDTH = 0.0005;
const MAX_WIDTH = 0.25;
const MAX_TEXT_LEN = 1000;

export type SanitizedDrawStroke = {
	id?: string;
	points: number[][];
	color: string;
	width: number;
	tool: 'pen' | 'eraser' | 'fill' | 'paint' | 'watercolor' | 'text';
	layer?: 'main' | 'draft' | 'lineart';
	clip?: boolean;
	text?: string;
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

	const tool: 'pen' | 'eraser' | 'fill' | 'paint' | 'watercolor' | 'text' =
		raw.tool === 'eraser' ? 'eraser' :
		raw.tool === 'fill' ? 'fill' :
		raw.tool === 'paint' ? 'paint' :
		raw.tool === 'watercolor' ? 'watercolor' :
		raw.tool === 'text' ? 'text' :
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

	return { id, points, color, width, tool, layer, clip, text };
}
