/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { createCanvas } from '@napi-rs/canvas';
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

const MAX_STROKES = 4000;
const MAX_POINTS_PER_STROKE = 2000;
const MIN_STROKE_WIDTH = 0.0005;
const MAX_STROKE_WIDTH = 0.25;
const DEFAULT_WIDTH = 1024;
const DEFAULT_HEIGHT = 768;
// Redis live buffer: strokes sent via WebSocket that have not yet been committed via update.
const LIVE_BUFFER_TTL_SECONDS = 60 * 60 * 24; // 24h
const LIVE_BUFFER_MAX_LEN = MAX_STROKES;
const liveBufferKey = (drawingId: string) => `chatDrawingBuf:${drawingId}`;

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

	const tool: 'pen' | 'eraser' | 'fill' | 'paint' =
		raw.tool === 'eraser' ? 'eraser' :
		raw.tool === 'fill' ? 'fill' :
		raw.tool === 'paint' ? 'paint' :
		'pen';

	const id = typeof raw.id === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(raw.id) ? raw.id : undefined;
	const layer: 'main' | 'draft' = raw.layer === 'draft' ? 'draft' : 'main';

	return { id, points, color, width, tool, layer };
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
//  - FLOOD_TOLERANCE: per-channel diff threshold separating "region" from "barrier"
//  - GAP_CLOSE_RADIUS: barriers are morphologically dilated by this radius, so small gaps
//    in outlines (e.g. imperfect pen loops) don't leak. Propagation is blocked across
//    any dilated barrier. Blending still uses the pixel's true distance to the seed,
//    so anti-aliased edges of the outline stay smooth.
const FLOOD_TOLERANCE = 80;
const GAP_CLOSE_RADIUS = 3;

function dilateMask(mask: Uint8Array, w: number, h: number, radius: number): Uint8Array {
	const n = w * h;
	const temp = new Uint8Array(n);
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
	const result = new Uint8Array(n);
	for (let x = 0; x < w; x++) {
		for (let y = 0; y < h; y++) {
			let any = 0;
			const yMin = y - radius < 0 ? 0 : y - radius;
			const yMax = y + radius >= h ? h - 1 : y + radius;
			for (let yy = yMin; yy <= yMax; yy++) {
				if (temp[yy * w + x]) { any = 1; break; }
			}
			result[y * w + x] = any;
		}
	}
	return result;
}

function erodeMask(mask: Uint8Array, w: number, h: number, radius: number): Uint8Array {
	const n = w * h;
	const temp = new Uint8Array(n);
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
	const result = new Uint8Array(n);
	for (let x = 0; x < w; x++) {
		for (let y = 0; y < h; y++) {
			let all = 1;
			const yMin = y - radius < 0 ? 0 : y - radius;
			const yMax = y + radius >= h ? h - 1 : y + radius;
			for (let yy = yMin; yy <= yMax; yy++) {
				if (!temp[yy * w + x]) { all = 0; break; }
			}
			result[y * w + x] = all;
		}
	}
	return result;
}

function buildClosedBarrier(data: Uint8ClampedArray, w: number, h: number, tR: number, tG: number, tB: number, tA: number, radius: number): Uint8Array {
	const n = w * h;
	const barrier = new Uint8Array(n);
	for (let i = 0; i < n; i++) {
		const pos = i * 4;
		const d = Math.max(
			Math.abs(data[pos] - tR),
			Math.abs(data[pos + 1] - tG),
			Math.abs(data[pos + 2] - tB),
			Math.abs(data[pos + 3] - tA),
		);
		if (d > FLOOD_TOLERANCE) barrier[i] = 1;
	}
	if (radius <= 0) return barrier;
	const dilated = dilateMask(barrier, w, h, radius);
	return erodeMask(dilated, w, h, radius);
}

function floodFill(data: Uint8ClampedArray, w: number, h: number, sx: number, sy: number, fill: [number, number, number, number]): void {
	if (sx < 0 || sy < 0 || sx >= w || sy >= h) return;
	const startPos = (sy * w + sx) * 4;
	const tR = data[startPos], tG = data[startPos + 1], tB = data[startPos + 2], tA = data[startPos + 3];
	const [fR, fG, fB, fA] = fill;
	if (tR === fR && tG === fG && tB === fB && tA === fA) return;

	const barrier = buildClosedBarrier(data, w, h, tR, tG, tB, tA, GAP_CLOSE_RADIUS);
	barrier[sy * w + sx] = 0;

	const visited = new Uint8Array(w * h);
	const diff = (pos: number) => Math.max(
		Math.abs(data[pos] - tR),
		Math.abs(data[pos + 1] - tG),
		Math.abs(data[pos + 2] - tB),
		Math.abs(data[pos + 3] - tA),
	);
	const blendAt = (pos: number) => {
		const d = diff(pos);
		const ratio = d === 0 ? 1 : Math.max(0, 1 - d / FLOOD_TOLERANCE);
		data[pos] = Math.round(data[pos] + (fR - data[pos]) * ratio);
		data[pos + 1] = Math.round(data[pos + 1] + (fG - data[pos + 1]) * ratio);
		data[pos + 2] = Math.round(data[pos + 2] + (fB - data[pos + 2]) * ratio);
		data[pos + 3] = Math.round(data[pos + 3] + (fA - data[pos + 3]) * ratio);
	};
	const passable = (idx: number) => !visited[idx] && !barrier[idx];

	const stack: number[] = [sx, sy];
	while (stack.length > 0) {
		const y = stack.pop()!;
		const x = stack.pop()!;
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
				if (!spanAbove && matchUp) { stack.push(xRight, y - 1); spanAbove = true; }
				else if (spanAbove && !matchUp) spanAbove = false;
			}
			if (y < h - 1) {
				const idxDown = idx + w;
				const matchDown = passable(idxDown);
				if (!spanBelow && matchDown) { stack.push(xRight, y + 1); spanBelow = true; }
				else if (spanBelow && !matchDown) spanBelow = false;
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
			if (diff(nIdx * 4) > FLOOD_TOLERANCE) return;
			visited[nIdx] = 1;
			blendAt(nIdx * 4);
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

const DRAFT_LAYER_ALPHA = 0.4;

function renderStrokesToLayerCtx(ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>, strokes: ChatDrawingStroke[], width: number, height: number): void {
	for (const stroke of strokes) {
		if (stroke.points.length === 0) continue;

		if (stroke.tool === 'fill') {
			const [fx, fy] = stroke.points[0];
			const sx = Math.max(0, Math.min(width - 1, Math.floor(fx * width)));
			const sy = Math.max(0, Math.min(height - 1, Math.floor(fy * height)));
			const fillColor = hexToRgba(stroke.color);
			const imageData = ctx.getImageData(0, 0, width, height);
			floodFill(imageData.data, width, height, sx, sy, fillColor);
			ctx.putImageData(imageData, 0, 0);
			continue;
		}

		ctx.save();
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		if (stroke.tool === 'eraser') {
			// Clear pixels (sets alpha to 0) so an underlying layer shows through in the composite.
			ctx.globalCompositeOperation = 'destination-out';
			ctx.strokeStyle = '#000';
			ctx.globalAlpha = 1;
		} else {
			ctx.strokeStyle = stroke.color;
		}
		const baseWidth = Math.max(1, stroke.width * width);
		const isPaint = stroke.tool === 'paint';
		const isEraser = stroke.tool === 'eraser';

		const p0 = stroke.points[0];
		if (stroke.points.length === 1) {
			const pr = p0.length >= 3 ? p0[2]! : 1;
			ctx.lineWidth = Math.max(0.5, baseWidth * pr);
			if (!isEraser) ctx.globalAlpha = isPaint ? 0.25 + 0.55 * pr : 1;
			ctx.beginPath();
			ctx.moveTo(p0[0] * width, p0[1] * height);
			ctx.lineTo(p0[0] * width + 0.01, p0[1] * height + 0.01);
			ctx.stroke();
		} else {
			for (let i = 1; i < stroke.points.length; i++) {
				const a = stroke.points[i - 1];
				const b = stroke.points[i];
				const pa = a.length >= 3 ? a[2]! : 1;
				const pb = b.length >= 3 ? b[2]! : 1;
				const avg = (pa + pb) / 2;
				ctx.lineWidth = Math.max(0.5, baseWidth * avg);
				if (!isEraser) ctx.globalAlpha = isPaint ? 0.25 + 0.55 * avg : 1;
				ctx.beginPath();
				ctx.moveTo(a[0] * width, a[1] * height);
				ctx.lineTo(b[0] * width, b[1] * height);
				ctx.stroke();
			}
		}
		ctx.restore();
	}
}

async function renderStrokesToPng(strokes: ChatDrawingStroke[], width: number, height: number): Promise<Buffer> {
	// Render main and draft onto separate transparent buffers so main-layer erasers don't
	// punch through draft, then composite onto a white canvas for the final PNG.
	const mainLayer = createCanvas(width, height);
	const draftLayer = createCanvas(width, height);
	const mainCtx = mainLayer.getContext('2d');
	const draftCtx = draftLayer.getContext('2d');

	const draftStrokes = strokes.filter(s => s.layer === 'draft');
	const mainStrokes = strokes.filter(s => s.layer !== 'draft');

	renderStrokesToLayerCtx(draftCtx, draftStrokes, width, height);
	renderStrokesToLayerCtx(mainCtx, mainStrokes, width, height);

	const out = createCanvas(width, height);
	const outCtx = out.getContext('2d');
	outCtx.fillStyle = '#ffffff';
	outCtx.fillRect(0, 0, width, height);
	outCtx.globalAlpha = DRAFT_LAYER_ALPHA;
	outCtx.drawImage(draftLayer, 0, 0);
	outCtx.globalAlpha = 1;
	outCtx.drawImage(mainLayer, 0, 0);

	return out.encode('png');
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

		private idService: IdService,
		private internalStorageService: InternalStorageService,
		private globalEventService: GlobalEventService,
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
	public async clearLiveStrokes(drawingId: string): Promise<void> {
		await this.redisClient.del(liveBufferKey(drawingId));
	}

	@bindThis
	public async clearLiveBufferForClear(drawingId: string): Promise<void> {
		// called when clients send drawClear over WebSocket — forget buffered strokes
		await this.redisClient.del(liveBufferKey(drawingId));
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
		const png = await renderStrokesToPng(cleanStrokes, DEFAULT_WIDTH, DEFAULT_HEIGHT);
		this.internalStorageService.saveFromBuffer(drawingStorageKey(accessKey), png);

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
		this.internalStorageService.saveFromBuffer(drawingStorageKey(accessKey), png);

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
		} satisfies Partial<MiChatDrawing>;

		return await this.chatDrawingsRepository.insertOne(drawing);
	}

	@bindThis
	public async updateDrawing(
		editor: MiUser,
		drawing: MiChatDrawing,
		strokes: unknown,
	): Promise<MiChatDrawing> {
		const cleanStrokes = sanitizeStrokes(strokes);
		const png = await renderStrokesToPng(cleanStrokes, drawing.width || DEFAULT_WIDTH, drawing.height || DEFAULT_HEIGHT);

		// rotate access key so stale CDN/browser caches don't serve old image
		const newAccessKey = randomBytes(24).toString('hex');
		this.internalStorageService.saveFromBuffer(drawingStorageKey(newAccessKey), png);

		const oldAccessKey = drawing.imageAccessKey;

		const now = new Date();
		await this.chatDrawingsRepository.update(drawing.id, {
			strokes: cleanStrokes,
			updatedAt: now,
			lastEditedById: editor.id,
			imageAccessKey: newAccessKey,
			imageSize: png.byteLength,
		});

		if (oldAccessKey && oldAccessKey !== newAccessKey) {
			this.internalStorageService.del(drawingStorageKey(oldAccessKey));
		}

		// persisted state is now the authoritative source; forget the live buffer
		await this.clearLiveStrokes(drawing.id);

		const updated = await this.chatDrawingsRepository.findOneByOrFail({ id: drawing.id });

		if (updated.roomId != null) {
			this.globalEventService.publishChatRoomStream(updated.roomId, 'drawingUpdated', {
				drawingId: updated.id,
				imageAccessKey: newAccessKey,
				updatedAt: now.toISOString(),
				lastEditedById: editor.id,
			});
		} else if (updated.user1Id != null && updated.user2Id != null) {
			const payload = {
				drawingId: updated.id,
				imageAccessKey: newAccessKey,
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
}
