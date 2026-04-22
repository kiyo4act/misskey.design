<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkWindow
	ref="windowEl"
	:initialWidth="900"
	:initialHeight="680"
	:canResize="true"
	:closeButton="true"
	@closed="emit('closed')"
>
	<template #header>
		<i class="ti ti-brush" style="margin-right: 6px;"></i>
		<span :class="$style.headerTitle">{{ title || 'お絵かきキャンバス' }}</span>
	</template>

	<div :class="$style.root" @contextmenu.prevent>
		<div :class="$style.toolbar">
			<div :class="$style.toolGroup">
				<button
					class="_button"
					:class="[$style.toolButton, tool === 'pen' ? $style.toolActive : null]"
					title="ペン"
					@click="tool = 'pen'"
				>
					<i class="ti ti-pencil"></i>
				</button>
				<button
					class="_button"
					:class="[$style.toolButton, tool === 'paint' ? $style.toolActive : null]"
					title="厚塗り"
					@click="tool = 'paint'"
				>
					<i class="ti ti-brush"></i>
				</button>
				<button
					class="_button"
					:class="[$style.toolButton, tool === 'eraser' ? $style.toolActive : null]"
					title="消しゴム"
					@click="tool = 'eraser'"
				>
					<i class="ti ti-eraser"></i>
				</button>
				<button
					class="_button"
					:class="[$style.toolButton, tool === 'fill' ? $style.toolActive : null]"
					title="塗りつぶし"
					@click="tool = 'fill'"
				>
					<i class="ti ti-paint"></i>
				</button>
			</div>

			<label :class="$style.toolGroup">
				<span :class="$style.toolLabel">色</span>
				<input v-model="color" type="color" :class="$style.colorPicker" :disabled="tool === 'eraser'"/>
			</label>

			<label :class="$style.toolGroup">
				<span :class="$style.toolLabel">太さ</span>
				<input v-model.number="width" type="range" min="1" max="60" step="1" :class="$style.widthSlider"/>
				<span :class="$style.widthValue">{{ width }}</span>
			</label>

			<div :class="$style.toolGroup">
				<button class="_button" :class="$style.toolButton" :disabled="!canUndo" title="元に戻す (Ctrl+Z)" @click="undo">
					<i class="ti ti-arrow-back-up"></i>
				</button>
				<button class="_button" :class="$style.toolButton" :disabled="!canRedo" title="やり直し (Ctrl+Y)" @click="redo">
					<i class="ti ti-arrow-forward-up"></i>
				</button>
			</div>

			<div :class="$style.toolGroup">
				<button
					class="_button"
					:class="[$style.toolButton, currentLayer === 'draft' ? $style.toolActive : null]"
					:title="currentLayer === 'draft' ? '下描レイヤー（クリックで本番に切替）' : '本番レイヤー（クリックで下描に切替）'"
					@click="toggleLayer"
				>
					<i class="ti ti-layers-subtract"></i>
					<span :class="$style.toolLabel" style="margin-left: 4px;">{{ currentLayer === 'draft' ? '下描' : '本番' }}</span>
				</button>
				<label :class="$style.toolGroup" title="下描の透明度">
					<span :class="$style.toolLabel">下描</span>
					<input v-model.number="draftOpacity" type="range" min="0" max="1" step="0.05" :class="$style.widthSlider"/>
					<span :class="$style.widthValue">{{ Math.round(draftOpacity * 100) }}%</span>
				</label>
			</div>

			<div :class="$style.toolGroup">
				<button class="_button" :class="$style.toolButton" :disabled="zoom <= MIN_ZOOM" title="縮小 (Ctrl+ホイール)" @click="zoomOut">
					<i class="ti ti-zoom-out"></i>
				</button>
				<button class="_button" :class="[$style.toolButton, $style.zoomLabel]" title="100%に戻す" @click="zoomReset">
					{{ Math.round(zoom * 100) }}%
				</button>
				<button class="_button" :class="$style.toolButton" :disabled="zoom >= MAX_ZOOM" title="拡大 (Ctrl+ホイール)" @click="zoomIn">
					<i class="ti ti-zoom-in"></i>
				</button>
			</div>

			<div :class="$style.spacer"></div>

			<button class="_button" :class="$style.toolButton" title="全消し" @click="clearAll">
				<i class="ti ti-trash"></i>
			</button>
		</div>

		<div ref="canvasAreaEl" :class="$style.canvasArea">
			<div v-if="loading" :class="$style.loadingOverlay"><MkLoading/></div>

			<!-- Participant avatars — overlaid in the top-right so they don't block drawing -->
			<div v-if="visibleParticipants.length > 0" :class="$style.participantList" title="お絵かきに参加中のユーザー">
				<div v-for="p in visibleParticipants" :key="p.user.id" :class="$style.participantItem" :title="p.user.username">
					<MkAvatar :user="p.user" :class="$style.participantAvatar" :link="false" :preview="false"/>
				</div>
			</div>

			<div ref="canvasContainerEl" :class="$style.canvasScroll" @wheel="onWheel">
				<div :class="$style.canvasWrap" :style="{ minWidth: '100%', minHeight: '100%' }">
					<canvas
						ref="canvasEl"
						:class="[$style.canvas, tool === 'fill' ? $style.canvasFillCursor : $style.canvasBrushCursor]"
						:width="CANVAS_W"
						:height="CANVAS_H"
						:style="canvasDisplayStyle"
						@pointerdown="onPointerDown"
						@pointermove="onCanvasPointerMove"
						@pointerup="onPointerUp"
						@pointerenter="onCanvasPointerEnter"
						@pointerleave="onCanvasPointerLeave"
						@pointercancel="onPointerUp"
					></canvas>
				</div>
			</div>

			<!-- Circular brush cursor overlay — positioned against canvasArea so it stays fixed when scrolling -->
			<div
				v-show="cursorVisible && tool !== 'fill'"
				:class="$style.brushCursor"
				:style="cursorStyle"
			></div>
		</div>

		<div :class="$style.footer">
			<button class="_button" :class="$style.cancelButton" @click="close">
				{{ i18n.ts.cancel }}
			</button>
			<button class="_button" :class="$style.cancelButton" title="画像をダウンロード" @click="downloadImage">
				<i class="ti ti-download"></i> ダウンロード
			</button>
			<MkButton primary gradate :disabled="saving" @click="saveAndClose">
				<template v-if="!saving"><i class="ti ti-device-floppy"></i> 保存して反映</template>
				<template v-else><MkLoading :em="true"/></template>
			</MkButton>
		</div>
	</div>
</MkWindow>
</template>

<script lang="ts" setup>
import { onMounted, onBeforeUnmount, ref, computed, useTemplateRef, watch } from 'vue';
import * as Misskey from 'misskey-js';
import MkWindow from '@/components/MkWindow.vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { ensureSignin } from '@/i.js';
import {
	apiChatDrawingUpdate,
	apiChatDrawingShow,
	type ChatDrawing,
	type ChatDrawingStroke,
} from '@/utility/chat-drawing-api.js';

type ChatConnection =
	| Misskey.IChannelConnection<Misskey.Channels['chatUser']>
	| Misskey.IChannelConnection<Misskey.Channels['chatRoom']>;

const props = defineProps<{
	connection: ChatConnection;
	drawingId: string;
	roomId?: string | null;
	otherUserId?: string | null;
}>();

const emit = defineEmits<{
	(event: 'closed'): void;
}>();

const $i = ensureSignin();

// Internal canvas is always fixed resolution; the window can be resized and the canvas scales via CSS.
const CANVAS_W = 1024;
const CANVAS_H = 768;

const windowEl = useTemplateRef('windowEl');
const canvasEl = useTemplateRef('canvasEl');
const canvasContainerEl = useTemplateRef('canvasContainerEl');
const canvasAreaEl = useTemplateRef('canvasAreaEl');

// Brush cursor overlay state (tracks pointer in container-local coords, sized by brush width)
const cursorVisible = ref(false);
const cursorStyle = ref<{ left: string; top: string; width: string; height: string }>({ left: '0px', top: '0px', width: '0px', height: '0px' });

const tool = ref<'pen' | 'eraser' | 'fill' | 'paint'>('pen');
const currentLayer = ref<'main' | 'draft'>('main');
const draftOpacity = ref(0.4);
const zoom = ref(1);
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;

// Layer-separated offscreen canvases. Strokes are drawn to the corresponding offscreen
// canvas (each starts fully transparent) and then composited onto the visible canvas.
// This keeps the main layer's eraser/pen from affecting draft pixels — the main canvas
// becomes transparent where erased, letting draft show through in the composite.
const mainCanvas = document.createElement('canvas');
const draftCanvas = document.createElement('canvas');
mainCanvas.width = draftCanvas.width = 0; // sized on first use
let mainCtx: CanvasRenderingContext2D | null = null;
let draftCtx: CanvasRenderingContext2D | null = null;
const color = ref<string>('#222222');
const width = ref<number>(6);
const saving = ref(false);
const loading = ref(true);
const title = ref<string>('');

const strokes = ref<ChatDrawingStroke[]>([]);

// Per-session per-user undo/redo. Only my own strokes made in this session
// are undoable. Save (drawingUpdated) clears these stacks.
const myUndoStack = ref<string[]>([]);
const myRedoStack = ref<ChatDrawingStroke[]>([]);
const canUndo = computed(() => myUndoStack.value.length > 0);
const canRedo = computed(() => myRedoStack.value.length > 0);

function newStrokeId(): string {
	// 16 url-safe chars, matches the server-side /^[A-Za-z0-9_-]{1,32}$/ regex
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
	let out = '';
	for (let i = 0; i < 16; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
	return out;
}

// Presence: other users currently viewing/editing this drawing.
// Entries expire 20s after the last heartbeat from that user.
const PRESENCE_TTL_MS = 20000;
const PRESENCE_HEARTBEAT_MS = 8000;
const participants = ref<Map<string, { user: Misskey.entities.UserLite; expiresAt: number }>>(new Map());
const now = ref(Date.now());
const visibleParticipants = computed(() => {
	const out: { user: Misskey.entities.UserLite; expiresAt: number }[] = [];
	for (const entry of participants.value.values()) {
		if (entry.expiresAt > now.value) out.push(entry);
	}
	return out;
});
let presenceInterval: ReturnType<typeof setInterval> | null = null;
let tickInterval: ReturnType<typeof setInterval> | null = null;

let ctx: CanvasRenderingContext2D | null = null;
let isDrawingStroke = false;
let activePointerId: number | null = null;
let currentPoints: [number, number, number][] = [];

function pressureFromEvent(ev: PointerEvent): number {
	// Only honour actual pen-tablet pressure. Mouse reports a constant 0.5 while the
	// button is down, and touch input is inconsistent across devices — treat both as full pressure.
	if (ev.pointerType === 'pen') return Math.max(0, Math.min(1, ev.pressure || 0));
	return 1;
}

function getContext(): CanvasRenderingContext2D {
	if (!ctx) {
		ctx = canvasEl.value!.getContext('2d', { willReadFrequently: false })!;
	}
	return ctx;
}

function ensureLayerCanvases() {
	if (mainCanvas.width !== CANVAS_W || mainCanvas.height !== CANVAS_H) {
		mainCanvas.width = CANVAS_W;
		mainCanvas.height = CANVAS_H;
		mainCtx = mainCanvas.getContext('2d', { willReadFrequently: true });
	}
	if (draftCanvas.width !== CANVAS_W || draftCanvas.height !== CANVAS_H) {
		draftCanvas.width = CANVAS_W;
		draftCanvas.height = CANVAS_H;
		draftCtx = draftCanvas.getContext('2d', { willReadFrequently: true });
	}
}

function getLayerCtx(layer: 'main' | 'draft'): CanvasRenderingContext2D {
	ensureLayerCanvases();
	return (layer === 'draft' ? draftCtx : mainCtx)!;
}

function recompositeDisplay() {
	ensureLayerCanvases();
	const c = getContext();
	c.save();
	c.setTransform(1, 0, 0, 1, 0, 0);
	c.globalCompositeOperation = 'source-over';
	c.globalAlpha = 1;
	c.fillStyle = '#ffffff';
	c.fillRect(0, 0, CANVAS_W, CANVAS_H);
	c.globalAlpha = draftOpacity.value;
	c.drawImage(draftCanvas, 0, 0);
	c.globalAlpha = 1;
	c.drawImage(mainCanvas, 0, 0);
	c.restore();
}

function clearCanvas() {
	ensureLayerCanvases();
	mainCtx!.save();
	mainCtx!.setTransform(1, 0, 0, 1, 0, 0);
	mainCtx!.clearRect(0, 0, CANVAS_W, CANVAS_H);
	mainCtx!.restore();
	draftCtx!.save();
	draftCtx!.setTransform(1, 0, 0, 1, 0, 0);
	draftCtx!.clearRect(0, 0, CANVAS_W, CANVAS_H);
	draftCtx!.restore();
	recompositeDisplay();
}

function hexToRgba(hex: string): [number, number, number, number] {
	const s = hex.replace('#', '');
	if (s.length === 3) return [parseInt(s[0] + s[0], 16), parseInt(s[1] + s[1], 16), parseInt(s[2] + s[2], 16), 255];
	if (s.length === 6) return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16), 255];
	if (s.length === 8) return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16), parseInt(s.slice(6, 8), 16)];
	return [0, 0, 0, 255];
}

// Tolerance + coverage blending + gap-tolerant propagation.
//  - FLOOD_TOLERANCE: barrier = any pixel whose channel diff from seed exceeds this.
//  - GAP_CLOSE_RADIUS: barrier mask is morphologically dilated by this radius, so small
//    gaps in outlines don't leak. Propagation is blocked across dilated barriers, but
//    blending at each filled pixel still uses the pixel's true distance to the seed, so
//    anti-aliased outline edges stay smooth.
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

function floodFillOnContext(c: CanvasRenderingContext2D, sx: number, sy: number, hexColor: string) {
	sx = Math.max(0, Math.min(CANVAS_W - 1, Math.floor(sx)));
	sy = Math.max(0, Math.min(CANVAS_H - 1, Math.floor(sy)));
	const imageData = c.getImageData(0, 0, CANVAS_W, CANVAS_H);
	const data = imageData.data;
	const w = CANVAS_W;
	const h = CANVAS_H;
	const startPos = (sy * w + sx) * 4;
	const tR = data[startPos], tG = data[startPos + 1], tB = data[startPos + 2], tA = data[startPos + 3];
	const [fR, fG, fB, fA] = hexToRgba(hexColor);
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
	// tips, etc. Constrained to pixels (a) inside closed_barrier and (b) fillable. closed_barrier
	// never includes the shape's exterior (closing fills only closed holes), so unlimited-depth
	// BFS here cannot leak past the outline.
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

	c.putImageData(imageData, 0, 0);
}

function renderStrokeToCtx(c: CanvasRenderingContext2D, stroke: ChatDrawingStroke) {
	if (stroke.points.length === 0) return;

	if (stroke.tool === 'fill') {
		const p0 = stroke.points[0];
		floodFillOnContext(c, p0[0] * CANVAS_W, p0[1] * CANVAS_H, stroke.color);
		return;
	}

	c.save();
	c.lineCap = 'round';
	c.lineJoin = 'round';
	const isPaint = stroke.tool === 'paint';
	const isEraser = stroke.tool === 'eraser';
	if (isEraser) {
		// Clear pixels on the layer (alpha → 0). The composite will show whatever layer is
		// beneath (or the white background), so it reads as "erased".
		c.globalCompositeOperation = 'destination-out';
		c.strokeStyle = '#000';
		c.globalAlpha = 1;
	} else {
		c.strokeStyle = stroke.color;
	}
	const baseWidth = Math.max(1, stroke.width * CANVAS_W);

	const p0 = stroke.points[0];
	if (stroke.points.length === 1) {
		const pr = p0.length >= 3 ? (p0[2] as number) : 1;
		c.lineWidth = Math.max(0.5, baseWidth * pr);
		if (!isEraser) c.globalAlpha = isPaint ? 0.25 + 0.55 * pr : 1;
		c.beginPath();
		c.moveTo(p0[0] * CANVAS_W, p0[1] * CANVAS_H);
		c.lineTo(p0[0] * CANVAS_W + 0.01, p0[1] * CANVAS_H + 0.01);
		c.stroke();
	} else {
		for (let i = 1; i < stroke.points.length; i++) {
			const a = stroke.points[i - 1];
			const b = stroke.points[i];
			const pa = a.length >= 3 ? (a[2] as number) : 1;
			const pb = b.length >= 3 ? (b[2] as number) : 1;
			const avg = (pa + pb) / 2;
			c.lineWidth = Math.max(0.5, baseWidth * avg);
			if (!isEraser) c.globalAlpha = isPaint ? 0.25 + 0.55 * avg : 1;
			c.beginPath();
			c.moveTo(a[0] * CANVAS_W, a[1] * CANVAS_H);
			c.lineTo(b[0] * CANVAS_W, b[1] * CANVAS_H);
			c.stroke();
		}
	}
	c.restore();
}

function renderStroke(stroke: ChatDrawingStroke) {
	const layer = stroke.layer === 'draft' ? 'draft' : 'main';
	renderStrokeToCtx(getLayerCtx(layer), stroke);
	recompositeDisplay();
}

function redrawAll() {
	clearCanvas();
	// Separate, then render onto each layer canvas. Layer ordering for display happens
	// in recompositeDisplay (draft drawn first, main on top).
	const draft: ChatDrawingStroke[] = [];
	const main: ChatDrawingStroke[] = [];
	for (const s of strokes.value) {
		if (s.layer === 'draft') draft.push(s);
		else main.push(s);
	}
	for (const s of draft) renderStrokeToCtx(getLayerCtx('draft'), s);
	for (const s of main) renderStrokeToCtx(getLayerCtx('main'), s);
	recompositeDisplay();
}

function canvasPointToNormalized(ev: PointerEvent): [number, number, number] {
	const rect = canvasEl.value!.getBoundingClientRect();
	const x = (ev.clientX - rect.left) / rect.width;
	const y = (ev.clientY - rect.top) / rect.height;
	return [
		Math.max(0, Math.min(1, x)),
		Math.max(0, Math.min(1, y)),
		pressureFromEvent(ev),
	];
}

// Container-size tracking for zoom-aware canvas display sizing.
const containerSize = ref({ w: 0, h: 0 });
let resizeObserver: ResizeObserver | null = null;

const canvasDisplayStyle = computed(() => {
	const cw = containerSize.value.w;
	const ch = containerSize.value.h;
	if (cw === 0 || ch === 0) return {};
	// Fit canvas to container at zoom=1, preserving 4:3 aspect
	const ratio = CANVAS_W / CANVAS_H;
	const baseW = Math.min(cw, ch * ratio);
	const baseH = baseW / ratio;
	const w = baseW * zoom.value;
	const h = baseH * zoom.value;
	return {
		width: `${w}px`,
		height: `${h}px`,
		maxWidth: 'none',
		maxHeight: 'none',
	};
});

function updateBrushCursor(ev: PointerEvent) {
	if (!canvasEl.value || !canvasAreaEl.value) return;
	const canvasRect = canvasEl.value.getBoundingClientRect();
	const areaRect = canvasAreaEl.value.getBoundingClientRect();
	const displayScale = canvasRect.width / CANVAS_W;
	const size = Math.max(4, width.value * displayScale);
	// Cursor lives in canvasArea (non-scrolling), so viewport delta is all we need.
	cursorStyle.value = {
		left: (ev.clientX - areaRect.left) + 'px',
		top: (ev.clientY - areaRect.top) + 'px',
		width: size + 'px',
		height: size + 'px',
	};
}

function onCanvasPointerMove(ev: PointerEvent) {
	updateBrushCursor(ev);
	onPointerMove(ev);
}

function onCanvasPointerEnter(ev: PointerEvent) {
	cursorVisible.value = true;
	updateBrushCursor(ev);
}

function onCanvasPointerLeave(ev: PointerEvent) {
	cursorVisible.value = false;
	onPointerUp(ev);
}

function onPointerDown(ev: PointerEvent) {
	if (isDrawingStroke || loading.value) return;
	ev.preventDefault();

	if (tool.value === 'fill') {
		// Fill always writes to the main layer (operating on main-layer pixels only).
		const point = canvasPointToNormalized(ev);
		const stroke: ChatDrawingStroke = {
			id: newStrokeId(),
			points: [[point[0], point[1]]],
			color: color.value,
			width: 0,
			tool: 'fill',
			layer: 'main',
		};
		strokes.value.push(stroke);
		renderStroke(stroke); // targets main ctx then recomposites
		props.connection.send('drawStroke', { drawingId: props.drawingId, stroke });
		myUndoStack.value.push(stroke.id!);
		myRedoStack.value = [];
		return;
	}

	canvasEl.value?.setPointerCapture(ev.pointerId);
	isDrawingStroke = true;
	activePointerId = ev.pointerId;
	currentPoints = [canvasPointToNormalized(ev)];
	renderStroke({
		points: currentPoints,
		color: color.value,
		width: width.value / CANVAS_W,
		tool: tool.value,
		layer: currentLayer.value,
	});
}

function onPointerMove(ev: PointerEvent) {
	if (!isDrawingStroke || ev.pointerId !== activePointerId) return;
	const p = canvasPointToNormalized(ev);
	const last = currentPoints[currentPoints.length - 1];
	const dx = (p[0] - last[0]) * CANVAS_W;
	const dy = (p[1] - last[1]) * CANVAS_H;
	if (dx * dx + dy * dy < 1) return;

	const avgP = (last[2] + p[2]) / 2;
	const c = getLayerCtx(currentLayer.value);
	c.save();
	c.lineCap = 'round';
	c.lineJoin = 'round';
	if (tool.value === 'eraser') {
		c.globalCompositeOperation = 'destination-out';
		c.strokeStyle = '#000';
		c.globalAlpha = 1;
	} else {
		c.strokeStyle = color.value;
		c.globalAlpha = tool.value === 'paint' ? 0.25 + 0.55 * avgP : 1;
	}
	c.lineWidth = Math.max(0.5, width.value * avgP);
	c.beginPath();
	c.moveTo(last[0] * CANVAS_W, last[1] * CANVAS_H);
	c.lineTo(p[0] * CANVAS_W, p[1] * CANVAS_H);
	c.stroke();
	c.restore();
	recompositeDisplay();

	currentPoints.push(p);
}

function onPointerUp(ev: PointerEvent) {
	if (!isDrawingStroke || ev.pointerId !== activePointerId) return;
	isDrawingStroke = false;
	activePointerId = null;
	try { canvasEl.value?.releasePointerCapture(ev.pointerId); } catch { /* noop */ }

	if (currentPoints.length === 0) return;

	const stroke: ChatDrawingStroke = {
		id: newStrokeId(),
		points: currentPoints,
		color: color.value,
		width: width.value / CANVAS_W,
		tool: tool.value,
		layer: currentLayer.value,
	};
	currentPoints = [];

	strokes.value.push(stroke);
	props.connection.send('drawStroke', { drawingId: props.drawingId, stroke });
	myUndoStack.value.push(stroke.id!);
	myRedoStack.value = [];
}

function onRemoteStroke(payload: { userId: string; drawingId: string; stroke: ChatDrawingStroke }) {
	if (payload.drawingId !== props.drawingId) return;
	if (payload.userId === $i.id) return;
	strokes.value.push(payload.stroke);
	renderStroke(payload.stroke);
}

function onRemoteClear(payload: { userId: string; drawingId: string }) {
	if (payload.drawingId !== props.drawingId) return;
	strokes.value = [];
	clearCanvas();
}

function onRemotePresence(payload: { drawingId: string; userId: string; user: Misskey.entities.UserLite }) {
	if (payload.drawingId !== props.drawingId) return;
	if (payload.userId === $i.id) return;
	participants.value.set(payload.userId, {
		user: payload.user,
		expiresAt: Date.now() + PRESENCE_TTL_MS,
	});
}

async function onRemoteDrawingUpdated(payload: { drawingId: string; imageAccessKey: string; updatedAt: string; lastEditedById: string }) {
	if (payload.drawingId !== props.drawingId) return;
	if (payload.lastEditedById === $i.id) return;
	try {
		const fresh = await apiChatDrawingShow(payload.drawingId);
		strokes.value = fresh.strokes;
		// someone committed — our in-memory undo/redo history no longer matches the canonical state.
		myUndoStack.value = [];
		myRedoStack.value = [];
		redrawAll();
	} catch (err) {
		console.error('failed to reload drawing', err);
	}
}

function clearAll() {
	strokes.value = [];
	clearCanvas();
	myUndoStack.value = [];
	myRedoStack.value = [];
	props.connection.send('drawClear', { drawingId: props.drawingId });
}

function toggleLayer() {
	currentLayer.value = currentLayer.value === 'draft' ? 'main' : 'draft';
}

// Re-composite whenever the draft opacity slider moves so the user sees the change live.
watch(draftOpacity, () => recompositeDisplay());

function clampZoom(z: number): number {
	return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
}

function zoomIn() { zoom.value = clampZoom(zoom.value * 1.25); }
function zoomOut() { zoom.value = clampZoom(zoom.value / 1.25); }
function zoomReset() { zoom.value = 1; }

function onWheel(ev: WheelEvent) {
	if (!(ev.ctrlKey || ev.metaKey)) return;
	ev.preventDefault();
	const factor = ev.deltaY < 0 ? 1.1 : 1 / 1.1;
	zoom.value = clampZoom(zoom.value * factor);
}

function removeStrokeById(strokeId: string): ChatDrawingStroke | null {
	const idx = strokes.value.findIndex(s => s.id === strokeId);
	if (idx < 0) return null;
	const [removed] = strokes.value.splice(idx, 1);
	redrawAll();
	return removed;
}

function undo() {
	const id = myUndoStack.value.pop();
	if (!id) return;
	const removed = removeStrokeById(id);
	if (removed) myRedoStack.value.push(removed);
	props.connection.send('drawUndo', { drawingId: props.drawingId, strokeId: id });
}

function redo() {
	const stroke = myRedoStack.value.pop();
	if (!stroke || !stroke.id) return;
	strokes.value.push(stroke);
	renderStroke(stroke);
	myUndoStack.value.push(stroke.id);
	props.connection.send('drawStroke', { drawingId: props.drawingId, stroke });
}

function onRemoteUndo(payload: { userId: string; drawingId: string; strokeId: string }) {
	if (payload.drawingId !== props.drawingId) return;
	if (payload.userId === $i.id) return;
	removeStrokeById(payload.strokeId);
}

function onKeyDown(ev: KeyboardEvent) {
	if (!(ev.ctrlKey || ev.metaKey)) return;
	const k = ev.key.toLowerCase();
	if (k === 'z' && !ev.shiftKey) {
		ev.preventDefault();
		undo();
	} else if (k === 'y' || (k === 'z' && ev.shiftKey)) {
		ev.preventDefault();
		redo();
	}
}

function sendPresence() {
	props.connection.send('drawingPresence', { drawingId: props.drawingId });
}

async function downloadImage() {
	if (!canvasEl.value) return;
	// Export the native 1024×768 display canvas (already composited by recompositeDisplay with
	// the user's current draft opacity). Zoom is CSS-only so it doesn't affect the PNG.
	try {
		const blob = await new Promise<Blob>((resolve, reject) => {
			canvasEl.value!.toBlob(b => b ? resolve(b) : reject(new Error('toBlob returned null')), 'image/png');
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		const safeTitle = (title.value || 'drawing').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80);
		const stamp = new Date().toISOString().replace(/[:.]/g, '-');
		a.download = `${safeTitle}-${stamp}.png`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		// Release memory on the next tick so Safari has time to start the download.
		setTimeout(() => URL.revokeObjectURL(url), 0);
	} catch (err) {
		console.error(err);
		os.alert({ type: 'error', text: i18n.ts.somethingHappened });
	}
}

async function saveAndClose() {
	if (saving.value) return;
	saving.value = true;
	try {
		await apiChatDrawingUpdate({ drawingId: props.drawingId, strokes: strokes.value });
		close();
	} catch (err) {
		console.error(err);
		os.alert({ type: 'error', text: i18n.ts.somethingHappened });
	} finally {
		saving.value = false;
	}
}

function close() {
	windowEl.value?.close();
}

onMounted(async () => {
	clearCanvas();
	// Observe the canvas scroll container so display size tracks window resizes.
	if (canvasContainerEl.value) {
		resizeObserver = new ResizeObserver(entries => {
			for (const e of entries) {
				containerSize.value = { w: e.contentRect.width, h: e.contentRect.height };
			}
		});
		resizeObserver.observe(canvasContainerEl.value);
	}
	props.connection.on('drawStroke', onRemoteStroke);
	props.connection.on('drawClear', onRemoteClear);
	props.connection.on('drawingUpdated', onRemoteDrawingUpdated);
	props.connection.on('drawingPresence', onRemotePresence);
	props.connection.on('drawUndo', onRemoteUndo);
	window.addEventListener('keydown', onKeyDown);

	try {
		const fresh = await apiChatDrawingShow(props.drawingId);
		title.value = fresh.title ?? '';
		strokes.value = fresh.strokes;
		redrawAll();
	} catch (err) {
		console.error(err);
		os.alert({ type: 'error', text: i18n.ts.somethingHappened });
	} finally {
		loading.value = false;
	}

	// announce presence and heartbeat
	sendPresence();
	presenceInterval = setInterval(sendPresence, PRESENCE_HEARTBEAT_MS);
	// tick for expiring stale participants in the UI
	tickInterval = setInterval(() => { now.value = Date.now(); }, 3000);
});

onBeforeUnmount(() => {
	props.connection.off('drawStroke', onRemoteStroke);
	props.connection.off('drawClear', onRemoteClear);
	props.connection.off('drawingUpdated', onRemoteDrawingUpdated);
	props.connection.off('drawingPresence', onRemotePresence);
	props.connection.off('drawUndo', onRemoteUndo);
	window.removeEventListener('keydown', onKeyDown);
	if (presenceInterval) clearInterval(presenceInterval);
	if (tickInterval) clearInterval(tickInterval);
	if (resizeObserver) resizeObserver.disconnect();
});
</script>

<style lang="scss" module>
.headerTitle {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	max-width: 100%;
}

.root {
	display: flex;
	flex-direction: column;
	height: 100%;
	min-height: 0;
}

.toolbar {
	display: flex;
	flex-wrap: wrap;
	gap: 12px;
	align-items: center;
	padding: 8px 12px;
	background: var(--MI_THEME-panel);
	border-bottom: solid 1px var(--MI_THEME-divider);
	flex: 0 0 auto;
}

.toolGroup {
	display: flex;
	align-items: center;
	gap: 6px;
}

.toolLabel {
	font-size: 0.85em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.toolButton {
	width: 36px;
	height: 36px;
	border-radius: 6px;
	display: inline-flex;
	align-items: center;
	justify-content: center;

	&:hover:not(:disabled) {
		background: var(--MI_THEME-accentedBg);
	}

	&:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
}

.toolActive {
	background: var(--MI_THEME-accent);
	color: #fff;

	&:hover {
		background: var(--MI_THEME-accent);
	}
}

.colorPicker {
	width: 36px;
	height: 28px;
	border: none;
	padding: 0;
	background: transparent;
	cursor: pointer;

	&:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
}

.widthSlider {
	width: 120px;
}

.widthValue {
	min-width: 24px;
	text-align: right;
	font-variant-numeric: tabular-nums;
	font-size: 0.85em;
}

.spacer {
	flex: 1;
}

.canvasArea {
	flex: 1 1 auto;
	min-height: 0;
	background: var(--MI_THEME-bg);
	position: relative;
}

.canvasScroll {
	position: absolute;
	inset: 0;
	overflow: auto;
	padding: 12px;
	box-sizing: border-box;
}

.canvasWrap {
	display: flex;
	align-items: center;
	justify-content: center;
	width: fit-content;
	height: fit-content;
	min-width: 100%;
	min-height: 100%;
}

.zoomLabel {
	width: auto;
	min-width: 48px;
	padding: 0 6px;
	font-variant-numeric: tabular-nums;
	font-size: 0.85em;
}

.loadingOverlay {
	position: absolute;
	inset: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgba(0, 0, 0, 0.2);
	z-index: 10;
}

.participantList {
	position: absolute;
	top: 12px;
	right: 12px;
	display: flex;
	gap: 4px;
	padding: 4px 6px;
	background: rgba(255, 255, 255, 0.7);
	border-radius: 999px;
	backdrop-filter: blur(6px);
	z-index: 5;
	pointer-events: none;
}

.participantItem {
	pointer-events: auto;
}

.participantAvatar {
	width: 28px;
	height: 28px;
	display: block;
	border-radius: 50%;
	border: 2px solid #fff;
	box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
}

.canvas {
	max-width: 100%;
	max-height: 100%;
	width: auto;
	height: auto;
	aspect-ratio: 1024 / 768;
	background: #fff;
	border-radius: 8px;
	box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
	touch-action: none;
}

.canvasBrushCursor {
	cursor: none; // replaced by the circular overlay
}

.canvasFillCursor {
	cursor: crosshair;
}

.brushCursor {
	position: absolute;
	pointer-events: none;
	transform: translate(-50%, -50%);
	border: 1px solid rgba(0, 0, 0, 0.85);
	box-shadow:
		inset 0 0 0 1px rgba(255, 255, 255, 0.8),
		0 0 0 1px rgba(255, 255, 255, 0.45);
	border-radius: 50%;
	z-index: 20;
	transition: width 0.08s ease, height 0.08s ease;
}

.footer {
	display: flex;
	gap: 8px;
	justify-content: flex-end;
	padding: 8px 12px;
	background: var(--MI_THEME-panel);
	border-top: solid 1px var(--MI_THEME-divider);
	flex: 0 0 auto;
}

.cancelButton {
	padding: 8px 16px;
	border-radius: 6px;

	&:hover {
		background: var(--MI_THEME-accentedBg);
	}
}
</style>
