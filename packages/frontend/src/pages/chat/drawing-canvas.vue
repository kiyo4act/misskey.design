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
		<!-- Row 1: tool palette + undo/redo + clear -->
		<div :class="$style.toolbar">
			<div :class="$style.toolGroup">
				<button class="_button" :class="[$style.toolButton, tool === 'pen' ? $style.toolActive : null]" title="ペン" @click="tool = 'pen'"><i class="ti ti-pencil"></i></button>
				<button class="_button" :class="[$style.toolButton, tool === 'paint' ? $style.toolActive : null]" title="厚塗り" @click="tool = 'paint'"><i class="ti ti-brush"></i></button>
				<button class="_button" :class="[$style.toolButton, tool === 'watercolor' ? $style.toolActive : null]" title="水彩" @click="tool = 'watercolor'"><i class="ti ti-droplet"></i></button>
				<button class="_button" :class="[$style.toolButton, tool === 'text' ? $style.toolActive : null]" title="テキスト" @click="tool = 'text'"><i class="ti ti-typography"></i></button>
				<button class="_button" :class="[$style.toolButton, tool === 'line' ? $style.toolActive : null]" title="直線" @click="tool = 'line'"><i class="ti ti-line"></i></button>
				<button class="_button" :class="[$style.toolButton, tool === 'eraser' ? $style.toolActive : null]" title="消しゴム" @click="tool = 'eraser'"><i class="ti ti-eraser"></i></button>
				<button class="_button" :class="[$style.toolButton, tool === 'fill' ? $style.toolActive : null]" title="塗りつぶし" @click="tool = 'fill'"><i class="ti ti-paint"></i></button>
				<button class="_button" :class="[$style.toolButton, tool === 'spoit' ? $style.toolActive : null]" title="スポイト (Alt+クリック)" @click="tool = 'spoit'"><i class="ti ti-color-picker"></i></button>
				<button class="_button" :class="[$style.toolButton, tool === 'hand' ? $style.toolActive : null]" title="手のひら (ドラッグ移動 / Shift+ドラッグ回転 / ホイールでズーム)" @click="tool = 'hand'"><i class="ti ti-hand-stop"></i></button>
			</div>

			<div :class="$style.separator"></div>

			<div :class="$style.toolGroup">
				<button class="_button" :class="$style.toolButton" :disabled="!canUndo" title="元に戻す (Ctrl+Z)" @click="undo"><i class="ti ti-arrow-back-up"></i></button>
				<button class="_button" :class="$style.toolButton" :disabled="!canRedo" title="やり直し (Ctrl+Y)" @click="redo"><i class="ti ti-arrow-forward-up"></i></button>
			</div>

			<div :class="$style.separator"></div>

			<button
				class="_button"
				:class="[$style.layerToggle, currentLayer !== 'main' ? $style.toolActive : null]"
				:title="`編集中レイヤー: ${currentLayerLabel}（クリックで切替）`"
				@click="toggleLayer"
			>
				<i class="ti ti-layers-subtract"></i>
				<span :class="$style.layerToggleLabel">{{ currentLayerLabel }}</span>
			</button>

			<button
				class="_button"
				:class="[$style.toolButton, lineartClipEnabled ? $style.toolActive : null]"
				title="線画クリップ: ペン/厚塗り/直線を線画レイヤーの既存ピクセルのみに重ねる"
				@click="lineartClipEnabled = !lineartClipEnabled"
			>
				<i class="ti ti-link"></i>
			</button>

			<button
				class="_button"
				:class="[$style.toolButton, pressureSensitivity ? $style.toolActive : null]"
				:title="pressureSensitivity ? '筆圧検知: ON（クリックで OFF）' : '筆圧検知: OFF（クリックで ON）'"
				@click="pressureSensitivity = !pressureSensitivity"
			>
				<i :class="['ti', pressureSensitivity ? 'ti-writing' : 'ti-writing-off']"></i>
			</button>


			<div :class="$style.spacer"></div>

			<button class="_button" :class="$style.toolButton" title="全消し" @click="clearAll"><i class="ti ti-trash"></i></button>
		</div>

		<!-- Row 2: color + brush params + layer opacity + view controls -->
		<div :class="[$style.toolbar, $style.toolbarSecondary]">
			<div :class="$style.toolGroup">
				<button
					ref="colorSwatchEl"
					class="_button"
					:class="$style.colorSwatch"
					:style="{ background: composedColor }"
					:disabled="tool === 'eraser'"
					title="色を選択"
					@click="toggleColorPopover"
				>
					<span :class="$style.colorSwatchInner" :style="{ background: composedColor }"></span>
				</button>
				<div v-if="recentColors.length > 0" :class="$style.recentColors" title="最近使った色">
					<button
						v-for="c in recentColors"
						:key="c"
						class="_button"
						:class="$style.recentColorChip"
						:style="{ background: c }"
						:disabled="tool === 'eraser'"
						@click="applyRecentColor(c)"
					></button>
				</div>
			</div>

			<div :class="$style.separator"></div>

			<label :class="$style.sliderField" :title="tool === 'eraser' ? '消しゴムの太さ' : tool === 'text' ? '文字サイズ' : '太さ'">
				<i :class="[$style.sliderIcon, tool === 'eraser' ? 'ti ti-eraser' : tool === 'text' ? 'ti ti-typography' : 'ti ti-line-height']"></i>
				<input v-model.number="activeBrushWidth" type="range" min="1" max="60" step="1" :class="$style.widthSlider"/>
				<span :class="$style.widthValue">{{ activeBrushWidth }}</span>
			</label>

			<label :class="$style.sliderField" title="不透明度" :style="tool === 'eraser' ? 'opacity: 0.4;' : ''">
				<i class="ti ti-droplet" :class="$style.sliderIcon"></i>
				<input v-model.number="opacity" type="range" min="0.05" max="1" step="0.05" :class="$style.widthSlider" :disabled="tool === 'eraser'"/>
				<span :class="$style.widthValue">{{ Math.round(opacity * 100) }}</span>
			</label>

			<label :class="$style.sliderField" title="手ぶれ補正">
				<i class="ti ti-wave-saw-tool" :class="$style.sliderIcon"></i>
				<input v-model.number="smoothing" type="range" min="0" max="20" step="1" :class="$style.widthSlider"/>
				<span :class="$style.widthValue">{{ smoothing }}</span>
			</label>

			<label :class="$style.sliderField" title="下描き透明度">
				<span :class="$style.toolLabel">下描き透明度</span>
				<input v-model.number="draftOpacity" type="range" min="0" max="1" step="0.05" :class="$style.widthSlider"/>
				<span :class="$style.widthValue">{{ Math.round(draftOpacity * 100) }}</span>
			</label>

			<div :class="$style.spacer"></div>

			<div :class="$style.toolGroup">
				<button class="_button" :class="$style.toolButton" :disabled="zoom <= MIN_ZOOM" title="縮小 (Ctrl+ホイール)" @click="zoomOut"><i class="ti ti-zoom-out"></i></button>
				<button class="_button" :class="[$style.toolButton, $style.zoomLabel]" title="表示をリセット (100% / 中央 / 回転0°)" @click="zoomReset">{{ Math.round(zoom * 100) }}%</button>
				<button class="_button" :class="$style.toolButton" :disabled="zoom >= MAX_ZOOM" title="拡大 (Ctrl+ホイール)" @click="zoomIn"><i class="ti ti-zoom-in"></i></button>
				<button class="_button" :class="$style.toolButton" :disabled="rotation === 0" title="回転リセット" @click="rotation = 0"><i class="ti ti-rotate-clockwise"></i></button>
				<button class="_button" :class="[$style.toolButton, mirrorView ? $style.toolActive : null]" title="左右反転ビュー（表示のみ）" @click="mirrorView = !mirrorView"><i class="ti ti-flip-horizontal"></i></button>
			</div>
		</div>

		<!-- Color wheel popover -->
		<div v-if="colorPopoverOpen" :class="$style.colorPopover" :style="colorPopoverStyle" @click.stop @mousedown.stop>
			<canvas
				ref="wheelCanvasEl"
				:class="$style.wheelCanvas"
				:width="WHEEL_SIZE"
				:height="WHEEL_SIZE"
				@pointerdown="onWheelPointerDown"
				@pointermove="onWheelPointerMove"
				@pointerup="onWheelPointerUp"
			></canvas>
			<div :class="$style.wheelSliderRow">
				<span :class="$style.toolLabel" style="width: 14px;">#</span>
				<input v-model="hexInput" type="text" maxlength="9" :class="$style.hexInput" @change="onHexInputCommit"/>
			</div>
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
				<div :class="$style.canvasWrap" :style="canvasWrapStyle">
					<canvas
						ref="canvasEl"
						:class="[
							$style.canvas,
							tool === 'hand' ? (panActive ? $style.canvasGrabbingCursor : $style.canvasGrabCursor) :
							(tool === 'fill' || tool === 'spoit') ? $style.canvasFillCursor :
							tool === 'text' ? $style.canvasTextCursor :
							$style.canvasBrushCursor,
							mirrorView ? $style.canvasMirrored : null,
						]"
						:width="CANVAS_W"
						:height="CANVAS_H"
						:style="canvasDisplayStyle"
						@pointerdown="onPointerDown"
						@pointermove="onCanvasPointerMove"
						@pointerup="onPointerUp"
						@pointerenter="onCanvasPointerEnter"
						@pointerleave="onCanvasPointerLeave"
						@pointercancel="onPointerUp"
						@selectstart.prevent
						@dragstart.prevent
						@dblclick.prevent
					></canvas>
					<textarea
						v-if="tool === 'text' && textCursor"
						ref="textBoxEl"
						v-model="textBoxValue"
						:class="[$style.textBoxOverlay, textLocked ? $style.textBoxLocked : null]"
						:style="textBoxStyle"
						spellcheck="false"
						@keydown="onTextKeydown"
						@pointerdown.stop
					></textarea>
				</div>
			</div>

			<!-- Circular brush cursor overlay — positioned against canvasArea so it stays fixed when scrolling -->
			<div
				v-show="cursorVisible && tool !== 'fill' && tool !== 'spoit' && tool !== 'text' && tool !== 'hand'"
				:class="$style.brushCursor"
				:style="cursorStyle"
			></div>

			<!-- Remote user cursors -->
			<div
				v-for="rc in visibleRemoteCursors"
				:key="rc.userId"
				:class="$style.remoteCursor"
				:style="rc.style"
			>
				<MkAvatar :user="rc.user" :class="$style.remoteCursorAvatar" :link="false" :preview="false"/>
				<span :class="$style.remoteCursorName">{{ rc.user.username }}</span>
			</div>
		</div>

		<div :class="$style.footer">
			<button class="_button" :class="$style.cancelButton" @click="close">
				{{ i18n.ts.cancel }}
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
import { onMounted, onBeforeUnmount, ref, computed, useTemplateRef, watch, nextTick } from 'vue';
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

// UI tools include client-only 'line' (commits as a 2-point pen stroke on pointer up)
// and 'spoit' (eyedropper — never commits a stroke, just sets color from the pixel picked).
const tool = ref<'pen' | 'eraser' | 'fill' | 'paint' | 'line' | 'spoit' | 'watercolor' | 'text' | 'hand'>('pen');

// View rotation in degrees, applied to canvasWrap (canvas + textarea overlay rotate as a
// unit). Drawing-tool inverse-mapping uses this in canvasPointToNormalized so strokes still
// land at correct pixel coords even when the user has rotated the view.
const rotation = ref<number>(0);

// Translation offset in CSS pixels applied to canvasWrap on top of its centered layout.
// Drives the hand tool's pan-with-drag — values can exceed the viewport so the canvas can
// freely scroll off-screen, and the cursor-focused zoom math also writes here to keep the
// hovered point fixed under the pointer.
const panX = ref<number>(0);
const panY = ref<number>(0);

// Text tool state. Two phases:
//   - follow: textarea is a ghost preview that tracks the pointer; pointer-events: none on
//     the element lets canvas receive the click that locks. textLocked = false.
//   - locked: textarea is anchored at the last click position, focused, and accepts input.
// textCursor null = nothing visible (e.g., pointer is off-canvas in follow phase).
const textCursor = ref<null | { x: number; y: number }>(null);
const textLocked = ref<boolean>(false);
const textBoxValue = ref<string>('');
const textBoxEl = useTemplateRef<HTMLTextAreaElement>('textBoxEl');

function refocusTextBox() {
	if (tool.value !== 'text') return;
	// nextTick covers the post-Vue-update reflow; a subsequent setTimeout(0) covers the
	// case where the browser shifts focus to <body> AFTER the current event dispatch (some
	// browsers fire that during the click → mouseup tail, after our nextTick). The guard
	// avoids stealing focus back if the user has intentionally moved to another input.
	const el = textBoxEl.value;
	if (!el) {
		void nextTick(() => textBoxEl.value?.focus());
		return;
	}
	void nextTick(() => textBoxEl.value?.focus());
	setTimeout(() => {
		if (tool.value !== 'text') return;
		const active = document.activeElement;
		if (active && active !== document.body && active !== el && active instanceof HTMLElement && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
			return;
		}
		textBoxEl.value?.focus();
	}, 0);
}

function cancelTextBox() {
	textBoxValue.value = '';
	textLocked.value = false;
	// Keep textCursor so the empty ghost stays visible at the same spot until the next
	// pointermove updates it (returns to follow mode).
}

function commitOpenTextBox() {
	if (!textCursor.value || !textLocked.value) return;
	const at = textCursor.value;
	commitTextAt(at.x, at.y);
	// Enter releases the anchor; the textarea returns to follow mode at the current
	// pointer location (next pointermove will reposition it).
	textLocked.value = false;
	textBoxValue.value = '';
}

function insertNewlineAtCaret() {
	const el = textBoxEl.value;
	if (!el) {
		textBoxValue.value += '\n';
		return;
	}
	const start = el.selectionStart ?? textBoxValue.value.length;
	const end = el.selectionEnd ?? textBoxValue.value.length;
	textBoxValue.value = textBoxValue.value.slice(0, start) + '\n' + textBoxValue.value.slice(end);
	void nextTick(() => {
		const e = textBoxEl.value;
		if (!e) return;
		const pos = start + 1;
		e.selectionStart = e.selectionEnd = pos;
	});
}

function onTextKeydown(ev: KeyboardEvent) {
	// Skip while IME composition is active so Enter doesn't commit mid-conversion.
	if (ev.isComposing) return;
	if (ev.key === 'Enter') {
		if (ev.ctrlKey || ev.metaKey) {
			ev.preventDefault();
			insertNewlineAtCaret();
		} else if (!ev.shiftKey && !ev.altKey) {
			ev.preventDefault();
			commitOpenTextBox();
		}
		return;
	}
	if (ev.key === 'Escape') {
		ev.preventDefault();
		cancelTextBox();
	}
}

watch(tool, (newT: string, oldT: string) => {
	if (newT === 'text') {
		// Fresh state on entry; cursor follow attaches once pointer enters the canvas.
		textBoxValue.value = '';
		textLocked.value = false;
	} else if (oldT === 'text') {
		// Discard pending text when leaving text mode; user must explicitly click to commit.
		textBoxValue.value = '';
		textLocked.value = false;
		textCursor.value = null;
	}
});
const currentLayer = ref<'main' | 'draft' | 'lineart'>('main');
const draftOpacity = ref(0.4);
const zoom = ref(1);
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;

const opacity = ref<number>(1);
// 0 = no smoothing. Higher = more latency, smoother curves. The pointer moves averaged over
// the last N samples; we trail by (smoothing) samples, then flush the rest on pointerup.
const smoothing = ref<number>(0);
const mirrorView = ref<boolean>(false);


// Layer-separated offscreen canvases. Strokes are drawn to the corresponding offscreen
// canvas (each starts fully transparent) and then composited onto the visible canvas.
// This keeps the main layer's eraser/pen from affecting draft pixels — the main canvas
// becomes transparent where erased, letting draft show through in the composite.
const mainCanvas = document.createElement('canvas');
const draftCanvas = document.createElement('canvas');
const lineartCanvas = document.createElement('canvas');
mainCanvas.width = draftCanvas.width = lineartCanvas.width = 0; // sized on first use
let mainCtx: CanvasRenderingContext2D | null = null;
let draftCtx: CanvasRenderingContext2D | null = null;
let lineartCtx: CanvasRenderingContext2D | null = null;

// Baseline (flattened) canvases hold the cumulative state for strokes[0..bakedCount-1].
// They let redrawAll skip re-replaying old strokes — instead we blit the baseline and
// only replay the recent window. Strokes that get baked lose their individual undo
// patch (no longer reachable from the undo stack).
const baselineMainCanvas = document.createElement('canvas');
const baselineDraftCanvas = document.createElement('canvas');
const baselineLineartCanvas = document.createElement('canvas');
baselineMainCanvas.width = baselineDraftCanvas.width = baselineLineartCanvas.width = 0;
let baselineMainCtx: CanvasRenderingContext2D | null = null;
let baselineDraftCtx: CanvasRenderingContext2D | null = null;
let baselineLineartCtx: CanvasRenderingContext2D | null = null;
let bakedCount = 0;
// Keep the undo window tight so only the last N of my own strokes need their
// per-stroke patch; everything older merges into the baseline.
const UNDO_WINDOW = 10;
const color = ref<string>('#222222');
const width = ref<number>(6);
// Eraser has its own width so switching between pen and eraser doesn't require resizing.
const eraserWidth = ref<number>(20);
// "Lineart clip" mode — when on, pen/paint/line strokes go to the lineart layer with
// `source-atop`, so they only recolor existing line pixels rather than painting new ones.
const lineartClipEnabled = ref<boolean>(false);
// Pen-tablet pressure sensitivity. Off forces every stroke to constant full pressure
// (uniform line width / opacity), useful when tablet drivers jitter or the user just
// wants even strokes.
const pressureSensitivity = ref<boolean>(true);

// Active brush width per tool. The toolbar "太さ" slider binds to this so each tool
// keeps its own last-set size.
const activeBrushWidth = computed<number>({
	get: () => tool.value === 'eraser' ? eraserWidth.value : width.value,
	set: (v: number) => {
		if (tool.value === 'eraser') eraserWidth.value = v;
		else width.value = v;
	},
});

// Which layer the next stroke lands on, honouring the lineart-clip override. Only pen/
// paint/line make sense to clip; other tools ignore the flag.
function effectiveLayerForNewStroke(): 'main' | 'draft' | 'lineart' {
	if (lineartClipEnabled.value && (tool.value === 'pen' || tool.value === 'paint' || tool.value === 'line')) return 'lineart';
	return currentLayer.value;
}

function effectiveClipForNewStroke(): boolean {
	return lineartClipEnabled.value && (tool.value === 'pen' || tool.value === 'paint' || tool.value === 'line');
}
const saving = ref(false);
const loading = ref(true);
const title = ref<string>('');

// Composed color = base hex (#RRGGBB) + alpha byte for `opacity`. Canvas' strokeStyle/fillStyle
// respects 8-hex notation, and the server sanitizer accepts it (/^#[0-9a-fA-F]{3,8}$/), so we
// transmit opacity via the color channel without extending the stroke schema.
const composedColor = computed(() => {
	const a = Math.round(Math.max(0, Math.min(1, opacity.value)) * 255).toString(16).padStart(2, '0');
	const hex = color.value.replace('#', '').slice(0, 6).padStart(6, '0');
	return `#${hex}${a}`;
});

// Recent colors (base hex, no alpha). Most-recently-used first, max 10.
const recentColors = ref<string[]>([]);
function recordRecentColor(hex: string) {
	const normalized = hex.toLowerCase();
	const idx = recentColors.value.indexOf(normalized);
	if (idx >= 0) recentColors.value.splice(idx, 1);
	recentColors.value.unshift(normalized);
	if (recentColors.value.length > 10) recentColors.value.length = 10;
}
function applyRecentColor(hex: string) {
	color.value = hex;
	const [h, s, v] = rgbToHsv(...hexToRgb(hex));
	hsvH.value = h;
	hsvS.value = s;
	hsvV.value = v;
	hexInput.value = composedColor.value;
}

// HSV color wheel state. H in [0, 1) (angle), S in [0, 1] (radius), V in [0, 1] (slider).
const hsvH = ref<number>(0);
const hsvS = ref<number>(0);
const hsvV = ref<number>(0.13);
const hexInput = ref<string>('#222222ff');
const colorPopoverOpen = ref<boolean>(false);
const colorSwatchEl = useTemplateRef('colorSwatchEl');
const wheelCanvasEl = useTemplateRef('wheelCanvasEl');
const WHEEL_SIZE = 200;
// Geometry for the hue-ring + SV-square picker.
const WHEEL_RING_OUTER = WHEEL_SIZE / 2 - 2;   // outermost radius of the hue ring
const WHEEL_RING_INNER = WHEEL_SIZE / 2 - 26;  // inner radius of the hue ring (ring thickness = 24px)
// Inscribed square inside the inner circle. side = inner_radius * √2, but shrink a hair
// so the square doesn't visually touch the ring.
const WHEEL_SQUARE_SIDE = Math.floor((WHEEL_RING_INNER - 4) * Math.SQRT2);
const colorPopoverStyle = ref<{ top: string; left: string }>({ top: '0px', left: '0px' });

function hexToRgb(hex: string): [number, number, number] {
	const s = hex.replace('#', '');
	if (s.length === 3) return [parseInt(s[0] + s[0], 16), parseInt(s[1] + s[1], 16), parseInt(s[2] + s[2], 16)];
	return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}
function rgbToHex(r: number, g: number, b: number): string {
	const to = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
	return `#${to(r)}${to(g)}${to(b)}`;
}
function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
	const rn = r / 255, gn = g / 255, bn = b / 255;
	const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
	const d = max - min;
	let h = 0;
	if (d !== 0) {
		if (max === rn) h = ((gn - bn) / d) % 6;
		else if (max === gn) h = (bn - rn) / d + 2;
		else h = (rn - gn) / d + 4;
		h = h / 6;
		if (h < 0) h += 1;
	}
	const s = max === 0 ? 0 : d / max;
	return [h, s, max];
}
function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
	const i = Math.floor(h * 6);
	const f = h * 6 - i;
	const p = v * (1 - s);
	const q = v * (1 - f * s);
	const t = v * (1 - (1 - f) * s);
	let r = 0, g = 0, b = 0;
	switch (i % 6) {
		case 0: r = v; g = t; b = p; break;
		case 1: r = q; g = v; b = p; break;
		case 2: r = p; g = v; b = t; break;
		case 3: r = p; g = q; b = v; break;
		case 4: r = t; g = p; b = v; break;
		case 5: r = v; g = p; b = q; break;
	}
	return [r * 255, g * 255, b * 255];
}

// Keep `color` and `hexInput` in sync whenever H/S/V changes (driven by the wheel or V slider).
watch([hsvH, hsvS, hsvV], () => {
	const [r, g, b] = hsvToRgb(hsvH.value, hsvS.value, hsvV.value);
	color.value = rgbToHex(r, g, b);
	hexInput.value = composedColor.value;
});
watch(opacity, () => { hexInput.value = composedColor.value; });

function onHexInputCommit() {
	const raw = hexInput.value.trim();
	const m = raw.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
	if (!m) { hexInput.value = composedColor.value; return; }
	const hex = m[1];
	if (hex.length === 3) {
		color.value = `#${hex[0] + hex[0]}${hex[1] + hex[1]}${hex[2] + hex[2]}`;
		opacity.value = 1;
	} else if (hex.length === 6) {
		color.value = `#${hex}`;
		opacity.value = 1;
	} else {
		color.value = `#${hex.slice(0, 6)}`;
		opacity.value = parseInt(hex.slice(6, 8), 16) / 255;
	}
	const [h, s, v] = rgbToHsv(...hexToRgb(color.value));
	hsvH.value = h; hsvS.value = s; hsvV.value = v;
}

// Illustration-software style picker: outer HUE RING (radial rainbow) + inner SV SQUARE
// (saturation horizontal, value vertical, at the currently-selected hue). Clicking the
// ring changes hue; the square's fill re-renders accordingly. Clicking the square picks
// saturation + value.
function drawWheel() {
	const cv = wheelCanvasEl.value;
	if (!cv) return;
	const wctx = cv.getContext('2d');
	if (!wctx) return;
	const size = WHEEL_SIZE;
	const cx = size / 2, cy = size / 2;
	const rOuter = WHEEL_RING_OUTER;
	const rInner = WHEEL_RING_INNER;
	const side = WHEEL_SQUARE_SIDE;
	const sqLeft = Math.floor(cx - side / 2);
	const sqTop = Math.floor(cy - side / 2);
	const sqRight = sqLeft + side;
	const sqBottom = sqTop + side;
	const img = wctx.createImageData(size, size);
	const data = img.data;
	const h = hsvH.value;

	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const idx = (y * size + x) * 4;
			const dx = x - cx;
			const dy = y - cy;
			const dist = Math.sqrt(dx * dx + dy * dy);
			// Hue ring: annulus between rInner+1 and rOuter.
			if (dist >= rInner && dist <= rOuter) {
				let angle = Math.atan2(dy, dx);
				if (angle < 0) angle += Math.PI * 2;
				const hue = angle / (Math.PI * 2);
				const [rr, gg, bb] = hsvToRgb(hue, 1, 1);
				data[idx] = rr | 0;
				data[idx + 1] = gg | 0;
				data[idx + 2] = bb | 0;
				// 1-px AA at both rims.
				const edgeOuter = rOuter - dist;
				const edgeInner = dist - rInner;
				const a = Math.min(1, Math.max(0, Math.min(edgeOuter, edgeInner)));
				data[idx + 3] = Math.round(255 * a);
				continue;
			}
			// SV square: saturation horizontal, value vertical (1 at top → 0 at bottom).
			if (x >= sqLeft && x < sqRight && y >= sqTop && y < sqBottom) {
				const s = (x - sqLeft) / (side - 1);
				const v = 1 - (y - sqTop) / (side - 1);
				const [rr, gg, bb] = hsvToRgb(h, s, v);
				data[idx] = rr | 0;
				data[idx + 1] = gg | 0;
				data[idx + 2] = bb | 0;
				data[idx + 3] = 255;
				continue;
			}
			data[idx + 3] = 0;
		}
	}
	wctx.putImageData(img, 0, 0);

	// Selection indicators — black outer ring + white inner ring for contrast on any colour.
	const drawMarker = (x: number, y: number, radius: number) => {
		wctx.save();
		wctx.strokeStyle = '#000';
		wctx.lineWidth = 2;
		wctx.beginPath();
		wctx.arc(x, y, radius, 0, Math.PI * 2);
		wctx.stroke();
		wctx.strokeStyle = '#fff';
		wctx.lineWidth = 1;
		wctx.beginPath();
		wctx.arc(x, y, radius, 0, Math.PI * 2);
		wctx.stroke();
		wctx.restore();
	};

	// Hue marker on the ring at the current H.
	const hueAngle = hsvH.value * Math.PI * 2;
	const midR = (rOuter + rInner) / 2;
	drawMarker(cx + Math.cos(hueAngle) * midR, cy + Math.sin(hueAngle) * midR, 6);

	// SV marker inside the square at the current S/V.
	const svX = sqLeft + hsvS.value * (side - 1);
	const svY = sqTop + (1 - hsvV.value) * (side - 1);
	drawMarker(svX, svY, 5);
}

// Repaint the wheel when V changes or when the popover opens (canvas starts blank).
watch([hsvV, hsvH, hsvS, colorPopoverOpen], () => {
	if (colorPopoverOpen.value) {
		// Wait a tick so the canvas is actually mounted when we draw.
		requestAnimationFrame(drawWheel);
	}
});

// Pointer dragging on the picker is locked into one of two modes from the initial press.
// Prevents dragging off the ring into the square (or vice versa) from changing what's
// being edited mid-drag — classic illustration-software behaviour.
let wheelDragMode: 'ring' | 'square' | null = null;

function hitTestWheel(ev: PointerEvent): 'ring' | 'square' | null {
	const cv = wheelCanvasEl.value;
	if (!cv) return null;
	const rect = cv.getBoundingClientRect();
	// Pointer may be at a CSS-scaled rect; normalise back to the intrinsic canvas coords.
	const scaleX = WHEEL_SIZE / rect.width;
	const scaleY = WHEEL_SIZE / rect.height;
	const px = (ev.clientX - rect.left) * scaleX;
	const py = (ev.clientY - rect.top) * scaleY;
	const cx = WHEEL_SIZE / 2;
	const cy = WHEEL_SIZE / 2;
	const dist = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
	if (dist >= WHEEL_RING_INNER && dist <= WHEEL_RING_OUTER) return 'ring';
	const side = WHEEL_SQUARE_SIDE;
	const sqLeft = Math.floor(cx - side / 2);
	const sqTop = Math.floor(cy - side / 2);
	if (px >= sqLeft && px < sqLeft + side && py >= sqTop && py < sqTop + side) return 'square';
	return null;
}

function applyWheelPick(ev: PointerEvent, mode: 'ring' | 'square') {
	const cv = wheelCanvasEl.value;
	if (!cv) return;
	const rect = cv.getBoundingClientRect();
	const scaleX = WHEEL_SIZE / rect.width;
	const scaleY = WHEEL_SIZE / rect.height;
	const px = (ev.clientX - rect.left) * scaleX;
	const py = (ev.clientY - rect.top) * scaleY;
	const cx = WHEEL_SIZE / 2;
	const cy = WHEEL_SIZE / 2;
	if (mode === 'ring') {
		let angle = Math.atan2(py - cy, px - cx);
		if (angle < 0) angle += Math.PI * 2;
		hsvH.value = angle / (Math.PI * 2);
	} else {
		const side = WHEEL_SQUARE_SIDE;
		const sqLeft = Math.floor(cx - side / 2);
		const sqTop = Math.floor(cy - side / 2);
		hsvS.value = Math.max(0, Math.min(1, (px - sqLeft) / (side - 1)));
		hsvV.value = Math.max(0, Math.min(1, 1 - (py - sqTop) / (side - 1)));
	}
}

function onWheelPointerDown(ev: PointerEvent) {
	const mode = hitTestWheel(ev);
	if (!mode) return;
	wheelDragMode = mode;
	wheelCanvasEl.value?.setPointerCapture(ev.pointerId);
	applyWheelPick(ev, mode);
}
function onWheelPointerMove(ev: PointerEvent) {
	if (!wheelDragMode) return;
	applyWheelPick(ev, wheelDragMode);
}
function onWheelPointerUp(ev: PointerEvent) {
	if (!wheelDragMode) return;
	wheelDragMode = null;
	try { wheelCanvasEl.value?.releasePointerCapture(ev.pointerId); } catch { /* noop */ }
}

function toggleColorPopover() {
	if (colorPopoverOpen.value) {
		colorPopoverOpen.value = false;
		return;
	}
	const btn = colorSwatchEl.value as unknown as HTMLElement | null;
	if (btn) {
		const rect = btn.getBoundingClientRect();
		colorPopoverStyle.value = {
			top: `${rect.bottom + 4}px`,
			left: `${Math.min(rect.left, window.innerWidth - 240)}px`,
		};
	}
	colorPopoverOpen.value = true;
	// Initialize HSV state from the current color
	const [h, s, v] = rgbToHsv(...hexToRgb(color.value));
	hsvH.value = h; hsvS.value = s; hsvV.value = v;
	hexInput.value = composedColor.value;
}

function closeColorPopoverOnOutside(ev: MouseEvent) {
	if (!colorPopoverOpen.value) return;
	const target = ev.target as Node;
	const btn = colorSwatchEl.value as unknown as HTMLElement | null;
	if (btn && btn.contains(target)) return;
	// Any click outside the wheel closes it (the popover itself stops propagation via @click.stop)
	colorPopoverOpen.value = false;
}

const strokes = ref<ChatDrawingStroke[]>([]);

// Per-session per-user undo/redo. Only my own strokes made in this session
// are undoable. Save (drawingUpdated) clears these stacks.
const myUndoStack = ref<string[]>([]);
const myRedoStack = ref<ChatDrawingStroke[]>([]);
const canUndo = computed(() => myUndoStack.value.length > 0);
const canRedo = computed(() => myRedoStack.value.length > 0);

// Pre-stroke patches keyed by stroke id. Used to restore the affected region on undo in
// O(bbox), skipping the O(strokes) redrawAll path. Evicted oldest-first past the cap.
type StrokePatch = {
	layer: 'main' | 'draft' | 'lineart';
	x: number;
	y: number;
	imageData: ImageData;
};
const strokePatches = new Map<string, StrokePatch>();
const MAX_UNDO_HISTORY = 10;

// Reusable full-layer snapshot grabbed at stroke start. We don't know the stroke's bbox
// until it finishes, so we snapshot the whole target layer up front and extract just the
// bbox region at commit time. The line tool also uses this snapshot to wipe its live
// preview between pointer moves, replacing the old `lineLayerSnapshot`.
let preStrokeLayerSnapshot: ImageData | null = null;
let preStrokeLayerTarget: 'main' | 'draft' | 'lineart' | null = null;

function grabPreStrokeSnapshot(layer: 'main' | 'draft' | 'lineart') {
	const ctx = getLayerCtx(layer);
	preStrokeLayerTarget = layer;
	preStrokeLayerSnapshot = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
}

function computeStrokeBbox(stroke: ChatDrawingStroke): { x: number; y: number; w: number; h: number } {
	if (stroke.tool === 'fill' || stroke.points.length === 0) {
		return { x: 0, y: 0, w: CANVAS_W, h: CANVAS_H };
	}
	if (stroke.tool === 'text') {
		// Text bbox = anchor + measured text size at the stored font px. Falls back to full
		// canvas if measurement context isn't available yet (rare — only before first layer init).
		const measureCtx = mainCtx ?? draftCtx ?? lineartCtx;
		if (!stroke.text || !measureCtx) return { x: 0, y: 0, w: CANVAS_W, h: CANVAS_H };
		const fontPx = Math.max(4, stroke.width * CANVAS_W);
		const lineHeight = fontPx * 1.4;
		const lines = stroke.text.split('\n');
		measureCtx.save();
		measureCtx.font = `${fontPx}px sans-serif`;
		let maxW = 0;
		for (const line of lines) {
			const m = measureCtx.measureText(line);
			if (m.width > maxW) maxW = m.width;
		}
		measureCtx.restore();
		const ax = stroke.points[0][0] * CANVAS_W;
		const ay = stroke.points[0][1] * CANVAS_H;
		const x = Math.max(0, Math.floor(ax - 2));
		const y = Math.max(0, Math.floor(ay - 2));
		const w = Math.min(CANVAS_W - x, Math.ceil(maxW + 6));
		const h = Math.min(CANVAS_H - y, Math.ceil(lines.length * lineHeight + 6));
		return { x, y, w: Math.max(1, w), h: Math.max(1, h) };
	}
	const widthPx = Math.max(1, stroke.width * CANVAS_W);
	const pad = Math.ceil(widthPx / 2 + 2);
	let minX = CANVAS_W, minY = CANVAS_H, maxX = 0, maxY = 0;
	for (const p of stroke.points) {
		const x = p[0] * CANVAS_W;
		const y = p[1] * CANVAS_H;
		if (x < minX) minX = x;
		if (y < minY) minY = y;
		if (x > maxX) maxX = x;
		if (y > maxY) maxY = y;
	}
	const x = Math.max(0, Math.floor(minX - pad));
	const y = Math.max(0, Math.floor(minY - pad));
	const x2 = Math.min(CANVAS_W, Math.ceil(maxX + pad));
	const y2 = Math.min(CANVAS_H, Math.ceil(maxY + pad));
	return { x, y, w: Math.max(1, x2 - x), h: Math.max(1, y2 - y) };
}

// Extract a sub-region of an ImageData without a round-trip through a canvas.
function extractImageDataRegion(src: ImageData, x: number, y: number, w: number, h: number): ImageData {
	const out = new ImageData(w, h);
	const srcW = src.width;
	for (let row = 0; row < h; row++) {
		const srcStart = ((y + row) * srcW + x) * 4;
		out.data.set(src.data.subarray(srcStart, srcStart + w * 4), row * w * 4);
	}
	return out;
}

function commitStrokePatch(stroke: ChatDrawingStroke) {
	if (!stroke.id || !preStrokeLayerSnapshot || !preStrokeLayerTarget) return;
	const bbox = computeStrokeBbox(stroke);
	strokePatches.set(stroke.id, {
		layer: preStrokeLayerTarget,
		x: bbox.x,
		y: bbox.y,
		imageData: extractImageDataRegion(preStrokeLayerSnapshot, bbox.x, bbox.y, bbox.w, bbox.h),
	});
	preStrokeLayerSnapshot = null;
	preStrokeLayerTarget = null;
	// Evict oldest patches past the cap. Their strokes remain undoable via the redrawAll
	// fallback, just without the O(bbox) fast path.
	while (myUndoStack.value.length > MAX_UNDO_HISTORY) {
		const evicted = myUndoStack.value.shift();
		if (evicted) strokePatches.delete(evicted);
	}
}

function clearStrokePatches() {
	strokePatches.clear();
	preStrokeLayerSnapshot = null;
	preStrokeLayerTarget = null;
}

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

// Remote cursor state. Entries expire 2s after the last update so they fade quickly
// when a peer stops moving (or leaves).
const REMOTE_CURSOR_TTL_MS = 2500;
const remoteCursors = ref<Map<string, { x: number; y: number; updatedAt: number }>>(new Map());
const visibleRemoteCursors = computed(() => {
	const out: { userId: string; user: Misskey.entities.UserLite; style: { left: string; top: string } }[] = [];
	if (!canvasEl.value || !canvasAreaEl.value) return out;
	const canvasRect = canvasEl.value.getBoundingClientRect();
	const areaRect = canvasAreaEl.value.getBoundingClientRect();
	for (const [userId, entry] of remoteCursors.value.entries()) {
		if (entry.updatedAt + REMOTE_CURSOR_TTL_MS < now.value) continue;
		const p = participants.value.get(userId);
		if (!p) continue;
		let x = entry.x;
		// The mirror view only flips what I see locally, so other users' cursors stay in
		// the original coordinate space; compensate here if my view is mirrored.
		if (mirrorView.value) x = 1 - x;
		const px = canvasRect.left - areaRect.left + x * canvasRect.width;
		const py = canvasRect.top - areaRect.top + entry.y * canvasRect.height;
		out.push({
			userId,
			user: p.user,
			style: { left: `${px}px`, top: `${py}px` },
		});
	}
	return out;
});

// Throttle outgoing cursor broadcasts — ~30Hz is smooth enough visually and keeps WS traffic low.
const CURSOR_SEND_INTERVAL_MS = 33;
let lastCursorSentAt = 0;
let lastCursorSentPos: { x: number; y: number } | null = null;
function sendCursor(x: number, y: number) {
	const t = performance.now();
	if (t - lastCursorSentAt < CURSOR_SEND_INTERVAL_MS) return;
	if (lastCursorSentPos && Math.abs(lastCursorSentPos.x - x) < 0.001 && Math.abs(lastCursorSentPos.y - y) < 0.001) return;
	lastCursorSentAt = t;
	lastCursorSentPos = { x, y };
	props.connection.send('drawingCursor', { drawingId: props.drawingId, x, y });
}

let ctx: CanvasRenderingContext2D | null = null;
let isDrawingStroke = false;
let activePointerId: number | null = null;
// Remote events (drawingUpdated / drawUndo) that arrive mid-stroke would otherwise
// call redrawAll() and blit the baseline over the live canvas, wiping out the
// user's uncommitted partial stroke pixels. We defer the redraw until pointerUp.
let pendingRemoteRedraw = false;
let pendingRefetchDrawingId: string | null = null;
// currentPoints: committed, already drawn (stabilized) trailing path
let currentPoints: [number, number, number][] = [];
// rawBuffer: recent raw pointer samples used to compute the moving-average "smoothed" head
let rawBuffer: [number, number, number][] = [];
// Line tool working state. The preview wipe-to-pre-state uses preStrokeLayerSnapshot
// (grabbed at onPointerDown) — no separate snapshot is needed.
let lineStart: [number, number, number] | null = null;

function pressureFromEvent(ev: PointerEvent): number {
	// Only honour actual pen-tablet pressure. Mouse reports a constant 0.5 while the
	// button is down, and touch input is inconsistent across devices — treat both as full pressure.
	// Can be globally disabled via the toolbar toggle to force constant full pressure
	// (helps when tablet drivers report noisy pressure or the user just wants even strokes).
	if (pressureSensitivity.value && ev.pointerType === 'pen') {
		return Math.max(0, Math.min(1, ev.pressure || 0));
	}
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
	if (lineartCanvas.width !== CANVAS_W || lineartCanvas.height !== CANVAS_H) {
		lineartCanvas.width = CANVAS_W;
		lineartCanvas.height = CANVAS_H;
		lineartCtx = lineartCanvas.getContext('2d', { willReadFrequently: true });
	}
}

function ensureBaselineCanvases() {
	if (baselineMainCanvas.width !== CANVAS_W || baselineMainCanvas.height !== CANVAS_H) {
		baselineMainCanvas.width = CANVAS_W;
		baselineMainCanvas.height = CANVAS_H;
		baselineMainCtx = baselineMainCanvas.getContext('2d', { willReadFrequently: true });
	}
	if (baselineDraftCanvas.width !== CANVAS_W || baselineDraftCanvas.height !== CANVAS_H) {
		baselineDraftCanvas.width = CANVAS_W;
		baselineDraftCanvas.height = CANVAS_H;
		baselineDraftCtx = baselineDraftCanvas.getContext('2d', { willReadFrequently: true });
	}
	if (baselineLineartCanvas.width !== CANVAS_W || baselineLineartCanvas.height !== CANVAS_H) {
		baselineLineartCanvas.width = CANVAS_W;
		baselineLineartCanvas.height = CANVAS_H;
		baselineLineartCtx = baselineLineartCanvas.getContext('2d', { willReadFrequently: true });
	}
}

function getBaselineLayerCtx(layer: 'main' | 'draft' | 'lineart'): CanvasRenderingContext2D {
	ensureBaselineCanvases();
	if (layer === 'draft') return baselineDraftCtx!;
	if (layer === 'lineart') return baselineLineartCtx!;
	return baselineMainCtx!;
}

function resetBaseline() {
	ensureBaselineCanvases();
	for (const ctx of [baselineMainCtx!, baselineDraftCtx!, baselineLineartCtx!]) {
		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
		ctx.restore();
	}
	bakedCount = 0;
}

// Snapshot the current live layer canvases into the baseline canvases. Used right after
// the initial full redraw on load so subsequent redrawAll can start from a flat bitmap
// instead of replaying the entire stored stroke history again.
function snapshotBaselineFromLive() {
	ensureBaselineCanvases();
	ensureLayerCanvases();
	for (const [dst, src] of [
		[baselineMainCtx!, mainCanvas] as const,
		[baselineDraftCtx!, draftCanvas] as const,
		[baselineLineartCtx!, lineartCanvas] as const,
	]) {
		dst.save();
		dst.setTransform(1, 0, 0, 1, 0, 0);
		dst.globalCompositeOperation = 'copy';
		dst.drawImage(src, 0, 0);
		dst.restore();
	}
	bakedCount = strokes.value.length;
}

// Apply the next un-baked stroke to the baseline canvases. The stroke is dropped from
// the undo stack + patch map since it can no longer be individually undone.
function bakeOneStroke() {
	if (bakedCount >= strokes.value.length) return;
	ensureBaselineCanvases();
	const stroke = strokes.value[bakedCount];
	const layer = resolveStrokeLayer(stroke);
	renderStrokeToCtx(getBaselineLayerCtx(layer), stroke, {
		main: baselineMainCanvas,
		draft: baselineDraftCanvas,
		lineart: baselineLineartCanvas,
	});
	if (stroke.id) {
		const i = myUndoStack.value.indexOf(stroke.id);
		if (i >= 0) myUndoStack.value.splice(i, 1);
		strokePatches.delete(stroke.id);
	}
	bakedCount++;
}

function maybeBakeOverflow() {
	while (strokes.value.length - bakedCount > UNDO_WINDOW) {
		bakeOneStroke();
	}
}

function getLayerCtx(layer: 'main' | 'draft' | 'lineart'): CanvasRenderingContext2D {
	ensureLayerCanvases();
	if (layer === 'draft') return draftCtx!;
	if (layer === 'lineart') return lineartCtx!;
	return mainCtx!;
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
	// Lineart layer always sits on top of main so colour fills never obscure line work.
	c.drawImage(lineartCanvas, 0, 0);
	c.restore();
}

function clearCanvas() {
	ensureLayerCanvases();
	for (const lc of [mainCtx!, draftCtx!, lineartCtx!]) {
		lc.save();
		lc.setTransform(1, 0, 0, 1, 0, 0);
		lc.clearRect(0, 0, CANVAS_W, CANVAS_H);
		lc.restore();
	}
	recompositeDisplay();
}

function hexToRgba(hex: string): [number, number, number, number] {
	const s = hex.replace('#', '');
	if (s.length === 3) return [parseInt(s[0] + s[0], 16), parseInt(s[1] + s[1], 16), parseInt(s[2] + s[2], 16), 255];
	if (s.length === 6) return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16), 255];
	if (s.length === 8) return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16), parseInt(s.slice(6, 8), 16)];
	return [0, 0, 0, 255];
}

// Tolerance + gap-tolerant propagation.
//  - FLOOD_RGB_TOLERANCE: for OPAQUE seeds, how much RGB channel drift is still "inside".
//    Generous so anti-aliased colored edges get swallowed without leaving a halo.
//  - FLOOD_ALPHA_TOLERANCE: stricter independent alpha threshold. Pen-tablet pressure-
//    sensitive strokes can land pixels with alpha as low as ~15 at the core when pressure
//    is light; without a tight alpha gate the fill walks right through them. 16 means any
//    pixel with >6% opacity counts as barrier.
//  - GAP_CLOSE_RADIUS: morphological closing fills gaps in the (now sparser) barrier so
//    tablet-thin pens still form a continuous enclosure.
//  - RIM_TOLERANCE: secondary pass softly blends barrier pixels adjacent to filled ones
//    so the transition from fill color to pen color is smooth rather than stepped.
const FLOOD_RGB_TOLERANCE = 140;
const FLOOD_ALPHA_TOLERANCE = 16;
const RIM_TOLERANCE = 230;
const GAP_CLOSE_RADIUS = 3;
// Fills are on a separate layer from the outline, so we can overshoot by a couple of
// pixels into the outline's anti-alias to eliminate the white halo without damaging
// the line work itself.
const FILL_DILATE_ITERATIONS = 2;

// Scratch Uint8Array pool for flood-fill. Previously each fill allocated ~6 full-canvas
// masks (~5MB) that immediately became GC garbage. Slot convention:
//   0: dilate/erode horizontal-pass temp   3: dilation frontier "next"
//   1: visited                              4: rim-processed
//   2: dilation frontier                    (barrier still fresh-allocated per fill)
const scratchPool: (Uint8Array | null)[] = [null, null, null, null, null];
function getScratch(slot: number, n: number): Uint8Array {
	let buf = scratchPool[slot];
	if (!buf || buf.length < n) { buf = new Uint8Array(n); scratchPool[slot] = buf; }
	else buf.fill(0);
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

// Build a composite ImageData of the given layers (z-ordered, no bg). Used as the fill's
// sample source so lineart strokes drawn on a separate layer still act as barriers for
// fills on main (and vice versa).
// Shared sample canvas reused across every fill — creating a fresh 1024×768 canvas per
// fill was the biggest allocation cost during save/resume replay.
const fillSampleCanvas = document.createElement('canvas');
let fillSampleCtx: CanvasRenderingContext2D | null = null;
// Optional `sources` lets callers substitute alternate canvases per layer — used during
// baking so fills read the baseline state rather than the full live state.
function compositeLayerData(
	layers: ('main' | 'draft' | 'lineart')[],
	sources?: { main?: HTMLCanvasElement; draft?: HTMLCanvasElement; lineart?: HTMLCanvasElement },
): Uint8ClampedArray {
	ensureLayerCanvases();
	if (fillSampleCanvas.width !== CANVAS_W || fillSampleCanvas.height !== CANVAS_H) {
		fillSampleCanvas.width = CANVAS_W;
		fillSampleCanvas.height = CANVAS_H;
		fillSampleCtx = fillSampleCanvas.getContext('2d', { willReadFrequently: true });
	}
	const sctx = fillSampleCtx!;
	sctx.save();
	sctx.setTransform(1, 0, 0, 1, 0, 0);
	sctx.globalCompositeOperation = 'source-over';
	sctx.globalAlpha = 1;
	sctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
	for (const layer of layers) {
		const fallback = layer === 'draft' ? draftCanvas : layer === 'lineart' ? lineartCanvas : mainCanvas;
		sctx.drawImage(sources?.[layer] ?? fallback, 0, 0);
	}
	sctx.restore();
	return sctx.getImageData(0, 0, CANVAS_W, CANVAS_H).data;
}

// `sampleLayers` is the layer set used for seed/barrier detection (what the user sees as
// "the line"); `c` is the target layer the fill writes to. Defaults to sampling the
// target layer alone for backward compat.
function floodFillOnContext(
	c: CanvasRenderingContext2D,
	sx: number, sy: number, hexColor: string,
	sampleLayers?: ('main' | 'draft' | 'lineart')[],
	sources?: { main?: HTMLCanvasElement; draft?: HTMLCanvasElement; lineart?: HTMLCanvasElement },
) {
	sx = Math.max(0, Math.min(CANVAS_W - 1, Math.floor(sx)));
	sy = Math.max(0, Math.min(CANVAS_H - 1, Math.floor(sy)));
	const imageData = c.getImageData(0, 0, CANVAS_W, CANVAS_H);
	const data = imageData.data;
	const w = CANVAS_W;
	const h = CANVAS_H;
	// Source for seed + barrier: composite of the requested layers (or the target alone).
	const sampleData = sampleLayers && sampleLayers.length > 0
		? compositeLayerData(sampleLayers, sources)
		: data;
	const startPos = (sy * w + sx) * 4;
	const tR = sampleData[startPos], tG = sampleData[startPos + 1], tB = sampleData[startPos + 2], tA = sampleData[startPos + 3];
	const [fR, fG, fB, fA] = hexToRgba(hexColor);
	if (sampleData === data && tR === fR && tG === fG && tB === fB && tA === fA) return;

	const barrier = buildClosedBarrier(sampleData, w, h, tR, tG, tB, tA, GAP_CLOSE_RADIUS);
	barrier[sy * w + sx] = 0;

	const visited = getScratch(1, w * h);
	// Distance from seed in the sample composite (what the user sees).
	const sampleDiff = (pos: number) => Math.max(
		Math.abs(sampleData[pos] - tR),
		Math.abs(sampleData[pos + 1] - tG),
		Math.abs(sampleData[pos + 2] - tB),
		Math.abs(sampleData[pos + 3] - tA),
	);
	// Visited pixels are fully replaced on the TARGET layer — inside the fill region, so
	// partial blending would leave a lighter halo. Boundary softness is handled by the rim pass.
	const blendAt = (pos: number) => {
		data[pos] = fR;
		data[pos + 1] = fG;
		data[pos + 2] = fB;
		data[pos + 3] = fA;
	};
	// For barrier pixels close to the seed in the sample composite, blend the fill color
	// into the target pixel proportionally so the outline fades smoothly to the fill colour.
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
			const pos = nIdx * 4;
			const rgbD = Math.max(
				Math.abs(sampleData[pos] - tR),
				Math.abs(sampleData[pos + 1] - tG),
				Math.abs(sampleData[pos + 2] - tB),
			);
			const alphaD = Math.abs(sampleData[pos + 3] - tA);
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

	// Dilation pass: overshoot the fill into the outline's anti-alias zone. Extends visited
	// by growing one pixel per iteration into adjacent BARRIER pixels (i.e. the outline
	// itself) with full fill colour. Safe because target layer and outline layer are
	// separate — we're not touching the line work, only colouring the target side.
	// Constrained to barrier AND sampleDiff < RIM_TOLERANCE so we can never cross a deep
	// outline or spill into a different region.
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

	// Rim pass: one more layer of partial-alpha blend against anything still adjacent to
	// visited but outside the dilation limit. Eliminates any residual hairline where the
	// dilation stopped before the outline's true edge.
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

	c.putImageData(imageData, 0, 0);
}

function renderStrokeToCtx(
	c: CanvasRenderingContext2D,
	stroke: ChatDrawingStroke,
	sources?: { main?: HTMLCanvasElement; draft?: HTMLCanvasElement; lineart?: HTMLCanvasElement },
) {
	if (stroke.points.length === 0) return;

	if (stroke.tool === 'fill') {
		const p0 = stroke.points[0];
		// Fills on main or lineart use the combined main+lineart composite so a lineart
		// outline drawn on a separate layer still blocks fills on main (and vice versa).
		// Fills on draft stay layer-local — draft is the sketch/underlay and its shapes
		// shouldn't be influenced by final line work.
		const strokeLayer = stroke.layer === 'draft' ? 'draft' : stroke.layer === 'lineart' ? 'lineart' : 'main';
		const sampleLayers: ('main' | 'draft' | 'lineart')[] =
			strokeLayer === 'draft' ? ['draft'] : ['main', 'lineart'];
		floodFillOnContext(c, p0[0] * CANVAS_W, p0[1] * CANVAS_H, stroke.color, sampleLayers, sources);
		return;
	}

	if (stroke.tool === 'text') {
		if (!stroke.text) return;
		const fontPx = Math.max(4, stroke.width * CANVAS_W);
		const lineHeight = fontPx * 1.4;
		const lines = stroke.text.split('\n');
		const x = stroke.points[0][0] * CANVAS_W;
		const y = stroke.points[0][1] * CANVAS_H;
		c.save();
		c.font = `${fontPx}px sans-serif`;
		c.textBaseline = 'top';
		c.fillStyle = stroke.color;
		for (let i = 0; i < lines.length; i++) {
			c.fillText(lines[i], x, y + i * lineHeight);
		}
		c.restore();
		return;
	}

	c.save();
	c.lineCap = 'round';
	c.lineJoin = 'round';
	const isPaint = stroke.tool === 'paint';
	const isEraser = stroke.tool === 'eraser';
	const isWatercolor = stroke.tool === 'watercolor';
	if (isEraser) {
		// Clear pixels on the layer (alpha → 0). The composite will show whatever layer is
		// beneath (or the white background), so it reads as "erased".
		c.globalCompositeOperation = 'destination-out';
		c.strokeStyle = '#000';
		c.globalAlpha = 1;
	} else if (isWatercolor) {
		// Watercolor: shadowBlur gives the bleeding feathered edge; per-segment alpha is low
		// so retracing / overlapping segments build up depth like layered pigment. clip is
		// ignored (source-over keeps the halo visible on transparent layers).
		c.globalCompositeOperation = 'source-over';
		c.strokeStyle = stroke.color;
		c.shadowColor = stroke.color;
		c.shadowOffsetX = 0;
		c.shadowOffsetY = 0;
	} else if (stroke.clip) {
		// Lineart clip: paint only where the target already has pixels (source-atop).
		c.globalCompositeOperation = 'source-atop';
		c.strokeStyle = stroke.color;
	} else {
		c.strokeStyle = stroke.color;
	}
	const baseWidth = Math.max(1, stroke.width * CANVAS_W);

	const p0 = stroke.points[0];
	if (stroke.points.length === 1) {
		const pr = p0.length >= 3 ? (p0[2] as number) : 1;
		if (isWatercolor) {
			c.lineWidth = Math.max(0.5, baseWidth * (0.4 + 0.6 * pr));
			c.shadowBlur = baseWidth * 0.7;
			c.globalAlpha = 0.10 + 0.10 * pr;
		} else {
			c.lineWidth = Math.max(0.5, baseWidth * pr);
			if (!isEraser) c.globalAlpha = isPaint ? 0.25 + 0.55 * pr : 1;
		}
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
			if (isWatercolor) {
				c.lineWidth = Math.max(0.5, baseWidth * (0.4 + 0.6 * avg));
				c.shadowBlur = baseWidth * 0.7;
				c.globalAlpha = 0.10 + 0.10 * avg;
			} else {
				c.lineWidth = Math.max(0.5, baseWidth * avg);
				if (!isEraser) c.globalAlpha = isPaint ? 0.25 + 0.55 * avg : 1;
			}
			c.beginPath();
			c.moveTo(a[0] * CANVAS_W, a[1] * CANVAS_H);
			c.lineTo(b[0] * CANVAS_W, b[1] * CANVAS_H);
			c.stroke();
		}
	}
	c.restore();
}

function resolveStrokeLayer(stroke: ChatDrawingStroke): 'main' | 'draft' | 'lineart' {
	if (stroke.layer === 'draft') return 'draft';
	if (stroke.layer === 'lineart') return 'lineart';
	return 'main';
}

function renderStroke(stroke: ChatDrawingStroke) {
	renderStrokeToCtx(getLayerCtx(resolveStrokeLayer(stroke)), stroke);
	recompositeDisplay();
}

// Each redrawAll gets a fresh epoch; in-flight chunked replays check it on every frame
// and bail out if a newer redraw has been kicked off. Prevents overlapping renders from
// clobbering each other's partial output.
let redrawEpoch = 0;

function redrawAll(): Promise<void> {
	const myEpoch = ++redrawEpoch;
	ensureLayerCanvases();
	ensureBaselineCanvases();
	// Reset live layers to baseline (flattened state for strokes[0..bakedCount-1]) so
	// redraw only replays the recent un-baked window. For fresh drawings baseline is
	// empty and this behaves like the old clear-and-full-replay.
	for (const [dst, src] of [
		[mainCtx!, baselineMainCanvas] as const,
		[draftCtx!, baselineDraftCanvas] as const,
		[lineartCtx!, baselineLineartCanvas] as const,
	]) {
		dst.save();
		dst.setTransform(1, 0, 0, 1, 0, 0);
		dst.globalCompositeOperation = 'copy';
		dst.drawImage(src, 0, 0);
		dst.restore();
	}
	// Snapshot the strokes so new ones arriving via WebSocket while we're chunked-
	// rendering don't get inserted into the iteration mid-stream (they'll be rendered
	// live by onRemoteStroke instead).
	const snapshot = strokes.value.slice(bakedCount);
	const total = snapshot.length;
	if (total === 0) {
		recompositeDisplay();
		return Promise.resolve();
	}
	const CHUNK = 12;
	return new Promise(resolve => {
		let i = 0;
		const step = () => {
			if (myEpoch !== redrawEpoch) { resolve(); return; }
			const end = Math.min(i + CHUNK, total);
			for (; i < end; i++) {
				renderStrokeToCtx(getLayerCtx(resolveStrokeLayer(snapshot[i])), snapshot[i]);
			}
			recompositeDisplay();
			if (i < total) {
				requestAnimationFrame(step);
			} else {
				resolve();
			}
		};
		step();
	});
}

function canvasPointToNormalized(ev: PointerEvent): [number, number, number] {
	const el = canvasEl.value;
	if (!el) return [0, 0, pressureFromEvent(ev)];
	const rect = el.getBoundingClientRect();
	// Cursor delta from the canvas centre. Rotation pivots at canvasWrap centre, which
	// equals canvas centre because flex centres the canvas in the wrap, and rotation
	// preserves the AABB centre — so rect's centre is still the canvas centre on screen.
	const cx = (rect.left + rect.right) / 2;
	const cy = (rect.top + rect.bottom) / 2;
	let dx = ev.clientX - cx;
	let dy = ev.clientY - cy;
	// Inverse-rotate to recover the un-rotated canvas frame so strokes land at correct
	// pixel coords regardless of the view rotation.
	if (rotation.value !== 0) {
		const r = -rotation.value * Math.PI / 180;
		const cos = Math.cos(r);
		const sin = Math.sin(r);
		const rx = dx * cos - dy * sin;
		const ry = dx * sin + dy * cos;
		dx = rx;
		dy = ry;
	}
	// Un-rotated CSS dimensions of the canvas. rect.width/height reflects the rotated AABB
	// so we recompute from the layout formula.
	const cw = containerSize.value.w;
	const ch = containerSize.value.h;
	const ratio = CANVAS_W / CANVAS_H;
	const baseW = Math.min(cw, ch * ratio);
	const baseH = baseW / ratio;
	const elemW = baseW * zoom.value;
	const elemH = baseH * zoom.value;
	if (elemW <= 0 || elemH <= 0) return [0, 0, pressureFromEvent(ev)];
	let x = (dx + elemW / 2) / elemW;
	// Mirror view (scaleX(-1) on canvas) inverts hit-space along x; flip back into stored
	// canvas-pixel space so strokes/peer sync stay mirror-independent.
	if (mirrorView.value) x = 1 - x;
	const y = (dy + elemH / 2) / elemH;
	return [
		Math.max(0, Math.min(1, x)),
		Math.max(0, Math.min(1, y)),
		pressureFromEvent(ev),
	];
}

// Container-size tracking for zoom-aware canvas display sizing.
const containerSize = ref({ w: 0, h: 0 });
let resizeObserver: ResizeObserver | null = null;

// canvasWrap is absolutely positioned at the container centre (left/top: 50%) and offset by
// translate(-50%, -50%) in its base transform so the canvas natural-rests in the middle.
// The user-driven pan/rotate transforms are appended after — pan applies in screen-space
// (no rotation of the delta) so the canvas tracks the pointer 1:1 even when rotated.
const canvasWrapStyle = computed(() => {
	const transforms = ['translate(-50%, -50%)'];
	if (panX.value !== 0 || panY.value !== 0) transforms.push(`translate(${panX.value}px, ${panY.value}px)`);
	if (rotation.value !== 0) transforms.push(`rotate(${rotation.value}deg)`);
	return { transform: transforms.join(' ') };
});

// Tracks whether the hand tool is mid-drag so the cursor flips to "grabbing".
const panActive = ref<boolean>(false);

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

// Position + sizing for the floating text-tool overlay <textarea>. Lives as a sibling of the
// canvas inside canvasWrap, which centers the canvas via flex when smaller than the scroll
// viewport. We mirror the X anchor when mirrorView is on (the canvas itself is CSS-flipped,
// the textarea isn't) and offset by canvasWrap's flex centering padding so the editor lands
// directly under the cursor. Font size is bound live to activeBrushWidth so the wheel/slider
// resize affects the in-flight preview too. The width/height are measured from the buffer
// content via canvas measureText so the box auto-expands as the user types and shrinks back
// when text is deleted; an empty buffer falls back to a small minimum.
const TEXT_BOX_MIN_WIDTH_PX = 28;
const TEXT_BOX_PAD_X = 10;
const TEXT_BOX_PAD_Y = 4;

const textBoxStyle = computed(() => {
	if (!textCursor.value) return null;
	const cw = containerSize.value.w;
	const ch = containerSize.value.h;
	if (cw === 0 || ch === 0) return null;
	const ratio = CANVAS_W / CANVAS_H;
	const baseW = Math.min(cw, ch * ratio);
	const baseH = baseW / ratio;
	const w = baseW * zoom.value;
	const h = baseH * zoom.value;
	// canvasWrap is now exactly canvas-sized (absolutely centred + transformed), so the
	// textarea is positioned in pure canvas-local CSS coords with no extra wrap padding.
	const displayScale = w / CANVAS_W;
	const px = (mirrorView.value ? (1 - textCursor.value.x) : textCursor.value.x) * w;
	const py = textCursor.value.y * h;
	const fontPxCanvas = activeBrushWidth.value;
	const fontPxCSS = fontPxCanvas * displayScale;
	const lineHeightCSS = fontPxCSS * 1.4;

	// Measure widest line in the buffer using the same font we'll commit with, so the
	// textarea matches the eventual rendered stroke width.
	let widthCSS = TEXT_BOX_MIN_WIDTH_PX;
	let lineCount = 1;
	if (mainCtx) {
		const text = textBoxValue.value;
		const lines = text.length > 0 ? text.split('\n') : [''];
		lineCount = lines.length;
		mainCtx.save();
		mainCtx.font = `${fontPxCanvas}px sans-serif`;
		let maxW = 0;
		for (const line of lines) {
			const m = mainCtx.measureText(line);
			if (m.width > maxW) maxW = m.width;
		}
		mainCtx.restore();
		widthCSS = Math.max(TEXT_BOX_MIN_WIDTH_PX, Math.ceil(maxW * displayScale + TEXT_BOX_PAD_X));
	}
	const heightCSS = Math.ceil(lineCount * lineHeightCSS + TEXT_BOX_PAD_Y);

	return {
		left: `${px}px`,
		top: `${py}px`,
		fontSize: `${fontPxCSS}px`,
		color: composedColor.value,
		width: `${widthCSS}px`,
		height: `${heightCSS}px`,
	};
});

function updateBrushCursor(ev: PointerEvent) {
	if (!canvasEl.value || !canvasAreaEl.value) return;
	const canvasRect = canvasEl.value.getBoundingClientRect();
	const areaRect = canvasAreaEl.value.getBoundingClientRect();
	const displayScale = canvasRect.width / CANVAS_W;
	const size = Math.max(4, activeBrushWidth.value * displayScale);
	// Cursor lives in canvasArea (non-scrolling), so viewport delta is all we need.
	cursorStyle.value = {
		left: (ev.clientX - areaRect.left) + 'px',
		top: (ev.clientY - areaRect.top) + 'px',
		width: size + 'px',
		height: size + 'px',
	};
}

function onCanvasPointerMove(ev: PointerEvent) {
	if (panState) {
		updateHandDrag(ev);
		return;
	}
	updateBrushCursor(ev);
	const p = canvasPointToNormalized(ev);
	sendCursor(p[0], p[1]);
	// Follow phase: the ghost text box tracks the pointer until the user clicks to anchor.
	if (tool.value === 'text' && !textLocked.value) {
		textCursor.value = { x: p[0], y: p[1] };
	}
	onPointerMove(ev);
}

function onCanvasPointerEnter(ev: PointerEvent) {
	cursorVisible.value = true;
	updateBrushCursor(ev);
	if (tool.value === 'text') {
		if (!textLocked.value) {
			const p = canvasPointToNormalized(ev);
			textCursor.value = { x: p[0], y: p[1] };
		} else if (textCursor.value) {
			// Toolbar interactions blur the locked textarea — restore focus when the
			// pointer returns to the canvas so keystrokes resume routing.
			refocusTextBox();
		}
	}
}

function onCanvasPointerLeave(ev: PointerEvent) {
	cursorVisible.value = false;
	if (tool.value === 'text' && !textLocked.value) {
		// Hide the ghost preview when off-canvas; the locked textarea stays put.
		textCursor.value = null;
	}
	onPointerUp(ev);
}

// Stabilizer — average the last (smoothing+1) raw samples to produce the committed point.
// Returns null if we don't yet have enough samples to emit.
function consumeStabilized(): [number, number, number] | null {
	const n = smoothing.value + 1;
	if (rawBuffer.length < n) return null;
	const window = rawBuffer.slice(-n);
	let sx = 0, sy = 0, sp = 0;
	for (const [x, y, p] of window) { sx += x; sy += y; sp += p; }
	return [sx / n, sy / n, sp / n];
}

// Flush remaining raw samples as progressively-narrowing windows so the stroke ends at the
// user's last real pointer position instead of trailing behind.
function flushStabilizerTail(): [number, number, number][] {
	const out: [number, number, number][] = [];
	let n = smoothing.value + 1;
	while (n > 1 && rawBuffer.length > 0) {
		n--;
		if (rawBuffer.length < n) continue;
		const window = rawBuffer.slice(-n);
		let sx = 0, sy = 0, sp = 0;
		for (const [x, y, p] of window) { sx += x; sy += y; sp += p; }
		out.push([sx / n, sy / n, sp / n]);
	}
	if (rawBuffer.length > 0) out.push(rawBuffer[rawBuffer.length - 1]);
	return out;
}

// Stamp the current text buffer at the given normalized canvas position. Called from the
// canvas pointerdown handler when text tool is active; the buffer persists afterwards so
// the same text can be stamped multiple times. Caller is responsible for refocusing the
// textarea — the canvas pointerdown blurs it and we want focus restored regardless of
// whether anything was actually committed (empty-buffer clicks are no-ops).
function commitTextAt(x: number, y: number) {
	const text = textBoxValue.value;
	if (!text.trim()) return;
	const layerForStroke = effectiveLayerForNewStroke();
	grabPreStrokeSnapshot(layerForStroke);
	const stroke: ChatDrawingStroke = {
		id: newStrokeId(),
		points: [[x, y]],
		color: composedColor.value,
		width: activeBrushWidth.value / CANVAS_W,
		tool: 'text',
		layer: layerForStroke,
		text,
	};
	strokes.value.push(stroke);
	renderStroke(stroke);
	props.connection.send('drawStroke', { drawingId: props.drawingId, stroke });
	myUndoStack.value.push(stroke.id!);
	myRedoStack.value = [];
	commitStrokePatch(stroke);
	maybeBakeOverflow();
	recordRecentColor(color.value);
	textBoxValue.value = '';
}

// Read a single pixel from the composited display canvas and return its hex color.
function pickColorAt(nx: number, ny: number): string | null {
	const c = getContext();
	const x = Math.max(0, Math.min(CANVAS_W - 1, Math.floor(nx * CANVAS_W)));
	const y = Math.max(0, Math.min(CANVAS_H - 1, Math.floor(ny * CANVAS_H)));
	try {
		const d = c.getImageData(x, y, 1, 1).data;
		return rgbToHex(d[0], d[1], d[2]);
	} catch {
		return null;
	}
}

// Hand-tool drag session. mode = 'pan' (default) or 'rotate' (held-shift at start). The
// mode is captured at pointerdown so releasing/pressing shift mid-drag doesn't switch.
let panState: null | {
	pointerId: number;
	mode: 'pan' | 'rotate';
	startClientX: number;
	startClientY: number;
	startPanX: number;
	startPanY: number;
	startRotation: number;
	pivotX: number;
	pivotY: number;
	startAngle: number;
} = null;

function startHandDrag(ev: PointerEvent) {
	const c = canvasEl.value;
	if (!c) return;
	const rect = c.getBoundingClientRect();
	const pivotX = (rect.left + rect.right) / 2;
	const pivotY = (rect.top + rect.bottom) / 2;
	panState = {
		pointerId: ev.pointerId,
		mode: ev.shiftKey ? 'rotate' : 'pan',
		startClientX: ev.clientX,
		startClientY: ev.clientY,
		startPanX: panX.value,
		startPanY: panY.value,
		startRotation: rotation.value,
		pivotX,
		pivotY,
		startAngle: Math.atan2(ev.clientY - pivotY, ev.clientX - pivotX),
	};
	panActive.value = true;
	c.setPointerCapture(ev.pointerId);
}

function updateHandDrag(ev: PointerEvent) {
	if (!panState || ev.pointerId !== panState.pointerId) return;
	if (panState.mode === 'rotate') {
		const ang = Math.atan2(ev.clientY - panState.pivotY, ev.clientX - panState.pivotX);
		const deltaDeg = (ang - panState.startAngle) * 180 / Math.PI;
		rotation.value = panState.startRotation + deltaDeg;
		return;
	}
	// Pan: drag delta is applied 1:1 in screen-space — the canvas tracks the pointer
	// regardless of rotation, and there's no clamping so it can go off-viewport.
	panX.value = panState.startPanX + (ev.clientX - panState.startClientX);
	panY.value = panState.startPanY + (ev.clientY - panState.startClientY);
}

function endHandDrag(ev: PointerEvent) {
	if (!panState || ev.pointerId !== panState.pointerId) return;
	try { canvasEl.value?.releasePointerCapture(ev.pointerId); } catch { /* noop */ }
	panState = null;
	panActive.value = false;
}

function onPointerDown(ev: PointerEvent) {
	if (isDrawingStroke || loading.value) return;
	ev.preventDefault();
	// iPadOS may have started a system selection (rectangle/loupe) on a prior double-tap;
	// clear it so it doesn't linger over the canvas while drawing.
	window.getSelection()?.removeAllRanges();

	if (tool.value === 'hand') {
		startHandDrag(ev);
		return;
	}

	const point = canvasPointToNormalized(ev);

	// Alt+click on any tool acts as a spoit for one shot.
	if (tool.value === 'spoit' || ev.altKey) {
		const picked = pickColorAt(point[0], point[1]);
		if (picked) applyRecentColor(picked);
		return;
	}

	if (tool.value === 'fill') {
		grabPreStrokeSnapshot(currentLayer.value);
		const stroke: ChatDrawingStroke = {
			id: newStrokeId(),
			points: [[point[0], point[1]]],
			color: composedColor.value,
			width: 0,
			tool: 'fill',
			layer: currentLayer.value,
		};
		strokes.value.push(stroke);
		renderStroke(stroke);
		props.connection.send('drawStroke', { drawingId: props.drawingId, stroke });
		myUndoStack.value.push(stroke.id!);
		myRedoStack.value = [];
		commitStrokePatch(stroke);
		maybeBakeOverflow();
		recordRecentColor(color.value);
		return;
	}

	if (tool.value === 'text') {
		// If the previous click anchored a box and the user typed into it, commit at the
		// FIXED locked position before re-anchoring at the new click point.
		if (textLocked.value && textCursor.value && textBoxValue.value.trim()) {
			commitTextAt(textCursor.value.x, textCursor.value.y);
		}
		textBoxValue.value = '';
		textCursor.value = { x: point[0], y: point[1] };
		textLocked.value = true;
		// Canvas pointerdown blurs the textarea (preventDefault doesn't reliably preserve
		// focus across browsers); restore it so the user keeps typing right after the click.
		refocusTextBox();
		return;
	}

	canvasEl.value?.setPointerCapture(ev.pointerId);
	isDrawingStroke = true;
	activePointerId = ev.pointerId;
	// Snapshot the target layer before the first pixel is touched so undo can restore it
	// with one putImageData on the stroke's bbox at commit time.
	const layerForStroke = effectiveLayerForNewStroke();
	grabPreStrokeSnapshot(layerForStroke);

	if (tool.value === 'line') {
		lineStart = point;
		return;
	}

	rawBuffer = [point];
	currentPoints = [point];
	// Paint a single dot immediately so a tap/click leaves a mark even without a move.
	// By this point tool.value has been narrowed to pen/eraser/paint — fill/spoit/line
	// all return earlier in this function.
	renderStroke({
		points: [point],
		color: composedColor.value,
		width: activeBrushWidth.value / CANVAS_W,
		tool: tool.value,
		layer: layerForStroke,
		...(effectiveClipForNewStroke() ? { clip: true } : {}),
	});
}

function drawLinePreview(start: [number, number, number], end: [number, number, number]) {
	if (!preStrokeLayerSnapshot) return;
	// Target the same layer we snapshotted (honours lineart-clip routing from onPointerDown).
	const c = getLayerCtx(preStrokeLayerTarget ?? currentLayer.value);
	c.putImageData(preStrokeLayerSnapshot, 0, 0);
	c.save();
	c.lineCap = 'round';
	c.lineJoin = 'round';
	if (tool.value === 'eraser') {
		c.globalCompositeOperation = 'destination-out';
		c.strokeStyle = '#000';
		c.globalAlpha = 1;
	} else if (effectiveClipForNewStroke()) {
		c.globalCompositeOperation = 'source-atop';
		c.strokeStyle = composedColor.value;
		c.globalAlpha = 1;
	} else {
		c.strokeStyle = composedColor.value;
		c.globalAlpha = 1;
	}
	c.lineWidth = Math.max(0.5, activeBrushWidth.value);
	c.beginPath();
	c.moveTo(start[0] * CANVAS_W, start[1] * CANVAS_H);
	c.lineTo(end[0] * CANVAS_W, end[1] * CANVAS_H);
	c.stroke();
	c.restore();
	recompositeDisplay();
}

function onPointerMove(ev: PointerEvent) {
	if (!isDrawingStroke || ev.pointerId !== activePointerId) return;
	const p = canvasPointToNormalized(ev);

	if (tool.value === 'line' && lineStart) {
		// Shift-constrains to 0/45/90°
		let end = p;
		if (ev.shiftKey) {
			const dx = p[0] - lineStart[0];
			const dy = p[1] - lineStart[1];
			const ang = Math.atan2(dy, dx);
			const step = Math.PI / 4;
			const snapped = Math.round(ang / step) * step;
			const dist = Math.sqrt(dx * dx + dy * dy);
			end = [lineStart[0] + Math.cos(snapped) * dist, lineStart[1] + Math.sin(snapped) * dist, p[2]];
		}
		drawLinePreview(lineStart, end);
		return;
	}

	rawBuffer.push(p);
	const next = consumeStabilized();
	if (!next) return;

	const last = currentPoints[currentPoints.length - 1];
	const dx = (next[0] - last[0]) * CANVAS_W;
	const dy = (next[1] - last[1]) * CANVAS_H;
	if (dx * dx + dy * dy < 1) return;

	const avgP = (last[2] + next[2]) / 2;
	const c = getLayerCtx(preStrokeLayerTarget ?? currentLayer.value);
	c.save();
	c.lineCap = 'round';
	c.lineJoin = 'round';
	if (tool.value === 'eraser') {
		c.globalCompositeOperation = 'destination-out';
		c.strokeStyle = '#000';
		c.globalAlpha = 1;
		c.lineWidth = Math.max(0.5, activeBrushWidth.value * avgP);
	} else if (tool.value === 'watercolor') {
		// Match renderStrokeToCtx watercolor branch so live preview matches the committed render.
		c.globalCompositeOperation = 'source-over';
		c.strokeStyle = composedColor.value;
		c.shadowColor = composedColor.value;
		c.shadowOffsetX = 0;
		c.shadowOffsetY = 0;
		c.shadowBlur = activeBrushWidth.value * 0.7;
		c.globalAlpha = 0.10 + 0.10 * avgP;
		c.lineWidth = Math.max(0.5, activeBrushWidth.value * (0.4 + 0.6 * avgP));
	} else if (effectiveClipForNewStroke()) {
		c.globalCompositeOperation = 'source-atop';
		c.strokeStyle = composedColor.value;
		c.globalAlpha = tool.value === 'paint' ? 0.25 + 0.55 * avgP : 1;
		c.lineWidth = Math.max(0.5, activeBrushWidth.value * avgP);
	} else {
		c.strokeStyle = composedColor.value;
		c.globalAlpha = tool.value === 'paint' ? 0.25 + 0.55 * avgP : 1;
		c.lineWidth = Math.max(0.5, activeBrushWidth.value * avgP);
	}
	c.beginPath();
	c.moveTo(last[0] * CANVAS_W, last[1] * CANVAS_H);
	c.lineTo(next[0] * CANVAS_W, next[1] * CANVAS_H);
	c.stroke();
	c.restore();
	recompositeDisplay();

	currentPoints.push(next);
}

function onPointerUp(ev: PointerEvent) {
	if (panState && ev.pointerId === panState.pointerId) {
		endHandDrag(ev);
		return;
	}
	if (!isDrawingStroke || ev.pointerId !== activePointerId) return;
	isDrawingStroke = false;
	activePointerId = null;
	try { canvasEl.value?.releasePointerCapture(ev.pointerId); } catch { /* noop */ }

	if (tool.value === 'line' && lineStart) {
		const end = canvasPointToNormalized(ev);
		let finalEnd = end;
		if (ev.shiftKey) {
			const dx = end[0] - lineStart[0];
			const dy = end[1] - lineStart[1];
			const ang = Math.atan2(dy, dx);
			const step = Math.PI / 4;
			const snapped = Math.round(ang / step) * step;
			const dist = Math.sqrt(dx * dx + dy * dy);
			finalEnd = [lineStart[0] + Math.cos(snapped) * dist, lineStart[1] + Math.sin(snapped) * dist, end[2]];
		}
		// Restore snapshot then commit through the normal stroke path so remote peers render identically.
		const lineLayer = preStrokeLayerTarget ?? currentLayer.value;
		const lineClip = effectiveClipForNewStroke();
		if (preStrokeLayerSnapshot) {
			const c = getLayerCtx(lineLayer);
			c.putImageData(preStrokeLayerSnapshot, 0, 0);
			recompositeDisplay();
		}
		const stroke: ChatDrawingStroke = {
			id: newStrokeId(),
			points: [
				[lineStart[0], lineStart[1], 1],
				[finalEnd[0], finalEnd[1], 1],
			],
			color: composedColor.value,
			width: activeBrushWidth.value / CANVAS_W,
			tool: 'pen', // line is committed as a 2-point pen stroke
			layer: lineLayer,
			...(lineClip ? { clip: true } : {}),
		};
		strokes.value.push(stroke);
		renderStroke(stroke);
		props.connection.send('drawStroke', { drawingId: props.drawingId, stroke });
		myUndoStack.value.push(stroke.id!);
		myRedoStack.value = [];
		commitStrokePatch(stroke);
		maybeBakeOverflow();
		recordRecentColor(color.value);
		lineStart = null;
		if (pendingRemoteRedraw) void flushPendingRedraw();
		return;
	}

	// Flush any un-averaged tail so the visible stroke lands on the actual pointer end.
	const tail = flushStabilizerTail();
	for (const next of tail) {
		const last = currentPoints[currentPoints.length - 1];
		if (!last) { currentPoints.push(next); continue; }
		const dx = (next[0] - last[0]) * CANVAS_W;
		const dy = (next[1] - last[1]) * CANVAS_H;
		if (dx * dx + dy * dy < 1) continue;
		const avgP = (last[2] + next[2]) / 2;
		const c = getLayerCtx(preStrokeLayerTarget ?? currentLayer.value);
		c.save();
		c.lineCap = 'round';
		c.lineJoin = 'round';
		if (tool.value === 'eraser') {
			c.globalCompositeOperation = 'destination-out';
			c.strokeStyle = '#000';
			c.globalAlpha = 1;
			c.lineWidth = Math.max(0.5, activeBrushWidth.value * avgP);
		} else if (tool.value === 'watercolor') {
			c.globalCompositeOperation = 'source-over';
			c.strokeStyle = composedColor.value;
			c.shadowColor = composedColor.value;
			c.shadowOffsetX = 0;
			c.shadowOffsetY = 0;
			c.shadowBlur = activeBrushWidth.value * 0.7;
			c.globalAlpha = 0.10 + 0.10 * avgP;
			c.lineWidth = Math.max(0.5, activeBrushWidth.value * (0.4 + 0.6 * avgP));
		} else if (effectiveClipForNewStroke()) {
			c.globalCompositeOperation = 'source-atop';
			c.strokeStyle = composedColor.value;
			c.globalAlpha = tool.value === 'paint' ? 0.25 + 0.55 * avgP : 1;
			c.lineWidth = Math.max(0.5, activeBrushWidth.value * avgP);
		} else {
			c.strokeStyle = composedColor.value;
			c.globalAlpha = tool.value === 'paint' ? 0.25 + 0.55 * avgP : 1;
			c.lineWidth = Math.max(0.5, activeBrushWidth.value * avgP);
		}
		c.beginPath();
		c.moveTo(last[0] * CANVAS_W, last[1] * CANVAS_H);
		c.lineTo(next[0] * CANVAS_W, next[1] * CANVAS_H);
		c.stroke();
		c.restore();
		currentPoints.push(next);
	}
	recompositeDisplay();
	rawBuffer = [];

	if (currentPoints.length === 0) {
		if (pendingRemoteRedraw) void flushPendingRedraw();
		return;
	}

	// tool.value is a ref so TS doesn't narrow across the earlier branches that return
	// for line/fill/spoit — explicitly coerce to the committable tool set.
	const commitTool: 'pen' | 'eraser' | 'paint' | 'watercolor' =
		tool.value === 'eraser' ? 'eraser' :
		tool.value === 'paint' ? 'paint' :
		tool.value === 'watercolor' ? 'watercolor' :
		'pen';
	const commitLayer = preStrokeLayerTarget ?? currentLayer.value;
	const commitClip = effectiveClipForNewStroke() && commitTool !== 'eraser';
	const stroke: ChatDrawingStroke = {
		id: newStrokeId(),
		points: currentPoints,
		color: composedColor.value,
		width: activeBrushWidth.value / CANVAS_W,
		tool: commitTool,
		layer: commitLayer,
		...(commitClip ? { clip: true } : {}),
	};
	currentPoints = [];

	strokes.value.push(stroke);
	props.connection.send('drawStroke', { drawingId: props.drawingId, stroke });
	myUndoStack.value.push(stroke.id!);
	myRedoStack.value = [];
	commitStrokePatch(stroke);
	maybeBakeOverflow();
	if (tool.value !== 'eraser') recordRecentColor(color.value);

	// If remote events (drawingUpdated / drawUndo) arrived mid-stroke, their
	// redraws were deferred so they wouldn't wipe our live pixels. Apply now.
	if (pendingRemoteRedraw) void flushPendingRedraw();
}

function onRemoteStroke(payload: { userId: string; drawingId: string; stroke: ChatDrawingStroke }) {
	if (payload.drawingId !== props.drawingId) return;
	if (payload.userId === $i.id) return;
	strokes.value.push(payload.stroke);
	renderStroke(payload.stroke);
	maybeBakeOverflow();
}

function onRemoteClear(payload: { userId: string; drawingId: string }) {
	if (payload.drawingId !== props.drawingId) return;
	strokes.value = [];
	resetBaseline();
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

async function applyRemoteDrawingUpdate(drawingId: string) {
	try {
		const fresh = await apiChatDrawingShow(drawingId);
		strokes.value = fresh.strokes;
		// someone committed — our in-memory undo/redo history no longer matches the canonical state.
		myUndoStack.value = [];
		myRedoStack.value = [];
		clearStrokePatches();
		resetBaseline();
		await redrawAll();
		// Flatten the replayed state into the baseline so subsequent redraws are cheap.
		snapshotBaselineFromLive();
	} catch (err) {
		console.error('failed to reload drawing', err);
	}
}

async function onRemoteDrawingUpdated(payload: { drawingId: string; imageAccessKey: string; updatedAt: string; lastEditedById: string }) {
	if (payload.drawingId !== props.drawingId) return;
	if (payload.lastEditedById === $i.id) return;
	if (isDrawingStroke) {
		// Defer until pointerUp so the in-flight stroke's live-canvas pixels aren't wiped.
		pendingRemoteRedraw = true;
		pendingRefetchDrawingId = payload.drawingId;
		return;
	}
	await applyRemoteDrawingUpdate(payload.drawingId);
}

async function flushPendingRedraw() {
	if (!pendingRemoteRedraw) return;
	pendingRemoteRedraw = false;
	const refetchId = pendingRefetchDrawingId;
	pendingRefetchDrawingId = null;
	if (refetchId) {
		await applyRemoteDrawingUpdate(refetchId);
	} else {
		await redrawAll();
	}
}

function clearAll() {
	strokes.value = [];
	resetBaseline();
	clearCanvas();
	myUndoStack.value = [];
	myRedoStack.value = [];
	clearStrokePatches();
	props.connection.send('drawClear', { drawingId: props.drawingId });
}

const currentLayerLabel = computed(() => {
	if (currentLayer.value === 'draft') return '下描きレイヤー';
	if (currentLayer.value === 'lineart') return '線画レイヤー';
	return '塗りレイヤー';
});

function toggleLayer() {
	// main → 下描き → 線画 → main
	if (currentLayer.value === 'main') currentLayer.value = 'draft';
	else if (currentLayer.value === 'draft') currentLayer.value = 'lineart';
	else currentLayer.value = 'main';
}

// Re-composite whenever the draft opacity slider moves so the user sees the change live.
watch(draftOpacity, () => recompositeDisplay());

function clampZoom(z: number): number {
	return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
}

function zoomIn() { zoom.value = clampZoom(zoom.value * 1.25); }
function zoomOut() { zoom.value = clampZoom(zoom.value / 1.25); }
// Treat the % label as a "reset view" — also recentre and unrotate so a user who got lost
// (panned far off-screen) has one click to return to a sane state.
function zoomReset() {
	zoom.value = 1;
	panX.value = 0;
	panY.value = 0;
	rotation.value = 0;
}

// Wheel-event throttle. Trackpads and high-precision wheels emit many small deltaY events
// per physical notch, which would step the brush size dozens of pixels per scroll. We
// accumulate deltaY into a quantum and only step when the accumulator crosses ±BRUSH_WHEEL_STEP.
const BRUSH_WHEEL_STEP = 40;
let brushWheelAccum = 0;

// Adjust zoom + pan so the canvas point currently under (clientX, clientY) keeps the same
// screen-space position after zoom. Works regardless of rotation because the math operates
// on the canvas centre's screen position (rotation preserves the AABB centre, which equals
// the wrap centre by construction).
//
// Derivation: let cursor_offset_old = cursor - canvasCentre_old. After scaling by `factor`,
// the same canvas-pixel point's screen offset becomes factor * cursor_offset_old. To keep
// the cursor over the same pixel we move the canvas centre to (cursor - factor * offset_old).
// Since canvasCentre = containerCentre + (panX, panY) and rotation leaves the centre fixed,
// the new pan reduces to: pan_new = factor * pan_old + (1 - factor) * (cursor - containerCentre).
function zoomAtCursor(clientX: number, clientY: number, factor: number) {
	const oldZoom = zoom.value;
	const newZoom = clampZoom(oldZoom * factor);
	if (newZoom === oldZoom) return;
	const cont = canvasContainerEl.value;
	if (!cont) {
		zoom.value = newZoom;
		return;
	}
	const contRect = cont.getBoundingClientRect();
	const containerCx = (contRect.left + contRect.right) / 2;
	const containerCy = (contRect.top + contRect.bottom) / 2;
	const realFactor = newZoom / oldZoom;
	panX.value = realFactor * panX.value + (1 - realFactor) * (clientX - containerCx);
	panY.value = realFactor * panY.value + (1 - realFactor) * (clientY - containerCy);
	zoom.value = newZoom;
}

function onWheel(ev: WheelEvent) {
	if (tool.value === 'hand') {
		// Hand tool: plain wheel zooms focused on the cursor.
		ev.preventDefault();
		const factor = ev.deltaY < 0 ? 1.1 : 1 / 1.1;
		zoomAtCursor(ev.clientX, ev.clientY, factor);
		return;
	}
	if (ev.ctrlKey || ev.metaKey) {
		ev.preventDefault();
		const factor = ev.deltaY < 0 ? 1.1 : 1 / 1.1;
		zoomAtCursor(ev.clientX, ev.clientY, factor);
		return;
	}
	// Shift+wheel keeps default browser behavior (horizontal scroll).
	if (ev.shiftKey) return;
	// Plain wheel: adjust brush/text size. Sign convention: scroll up = bigger.
	ev.preventDefault();
	brushWheelAccum += ev.deltaY;
	let steps = 0;
	while (brushWheelAccum >= BRUSH_WHEEL_STEP) { brushWheelAccum -= BRUSH_WHEEL_STEP; steps -= 1; }
	while (brushWheelAccum <= -BRUSH_WHEEL_STEP) { brushWheelAccum += BRUSH_WHEEL_STEP; steps += 1; }
	if (steps === 0) return;
	const next = Math.max(1, Math.min(60, activeBrushWidth.value + steps));
	if (next === activeBrushWidth.value) return;
	activeBrushWidth.value = next;
	// Resize the live brush cursor in place so the visual size matches the new value
	// without waiting for the next pointermove.
	if (cursorVisible.value && canvasEl.value) {
		const canvasRect = canvasEl.value.getBoundingClientRect();
		const displayScale = canvasRect.width / CANVAS_W;
		const size = Math.max(4, next * displayScale);
		cursorStyle.value = { ...cursorStyle.value, width: `${size}px`, height: `${size}px` };
	}
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
	const idx = strokes.value.findIndex(s => s.id === id);
	const removed = idx >= 0 ? strokes.value[idx] : null;
	const patch = strokePatches.get(id);
	if (patch && removed) {
		// Fast path: restore just the stroke's bbox from the pre-stroke snapshot.
		// O(bbox) instead of O(strokes) — no full redraw.
		getLayerCtx(patch.layer).putImageData(patch.imageData, patch.x, patch.y);
		strokes.value.splice(idx, 1);
		strokePatches.delete(id);
		recompositeDisplay();
		myRedoStack.value.push(removed);
	} else {
		// Fallback: no patch recorded (evicted past cap or remote-originated) — full redraw.
		const rm = removeStrokeById(id);
		if (rm) myRedoStack.value.push(rm);
	}
	props.connection.send('drawUndo', { drawingId: props.drawingId, strokeId: id });
}

function redo() {
	const stroke = myRedoStack.value.pop();
	if (!stroke || !stroke.id) return;
	// Capture the pre-state before re-applying, so the next undo can use the fast path too.
	grabPreStrokeSnapshot(resolveStrokeLayer(stroke));
	strokes.value.push(stroke);
	renderStroke(stroke);
	myUndoStack.value.push(stroke.id);
	commitStrokePatch(stroke);
	maybeBakeOverflow();
	props.connection.send('drawStroke', { drawingId: props.drawingId, stroke });
}

function onRemoteUndo(payload: { userId: string; drawingId: string; strokeId: string }) {
	if (payload.drawingId !== props.drawingId) return;
	if (payload.userId === $i.id) return;
	if (isDrawingStroke) {
		// Remove from the canonical array now, but defer the canvas redraw until pointerUp
		// so the in-flight stroke's live-canvas pixels aren't wiped by a baseline blit.
		const idx = strokes.value.findIndex((s: ChatDrawingStroke) => s.id === payload.strokeId);
		if (idx >= 0) strokes.value.splice(idx, 1);
		pendingRemoteRedraw = true;
		return;
	}
	removeStrokeById(payload.strokeId);
}

function onRemoteCursor(payload: { drawingId: string; userId: string; x: number; y: number }) {
	if (payload.drawingId !== props.drawingId) return;
	if (payload.userId === $i.id) return;
	remoteCursors.value.set(payload.userId, { x: payload.x, y: payload.y, updatedAt: Date.now() });
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

// Render the published composite (white bg + main + lineart, no draft) to a fresh
// offscreen canvas and return it as a base64-encoded PNG. Used on save to hand the
// bit-exact image to the server so it can skip the heavy stroke replay.
async function bakeCompositePngBase64(): Promise<string | null> {
	ensureLayerCanvases();
	const out = document.createElement('canvas');
	out.width = CANVAS_W;
	out.height = CANVAS_H;
	const octx = out.getContext('2d');
	if (!octx) return null;
	octx.fillStyle = '#ffffff';
	octx.fillRect(0, 0, CANVAS_W, CANVAS_H);
	octx.drawImage(mainCanvas, 0, 0);
	octx.drawImage(lineartCanvas, 0, 0);
	return await new Promise<string | null>(resolve => {
		out.toBlob(async b => {
			if (!b) { resolve(null); return; }
			const buf = await b.arrayBuffer();
			const bytes = new Uint8Array(buf);
			let binary = '';
			const CHUNK = 0x8000;
			for (let i = 0; i < bytes.length; i += CHUNK) {
				binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
			}
			resolve(btoa(binary));
		}, 'image/png');
	});
}

async function saveAndClose() {
	if (saving.value) return;
	// Flush any pending text-tool buffer at the last known cursor position so a typed-but-
	// unstamped text doesn't disappear when the user hits save.
	if (tool.value === 'text' && textCursor.value && textBoxValue.value.trim()) {
		commitTextAt(textCursor.value.x, textCursor.value.y);
	}
	saving.value = true;
	try {
		const imageBase64 = await bakeCompositePngBase64();
		await apiChatDrawingUpdate({
			drawingId: props.drawingId,
			strokes: strokes.value,
			...(imageBase64 ? { imageBase64 } : {}),
		});
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
	props.connection.on('drawingCursor', onRemoteCursor);
	window.addEventListener('keydown', onKeyDown);
	window.addEventListener('mousedown', closeColorPopoverOnOutside);

	try {
		const fresh = await apiChatDrawingShow(props.drawingId);
		title.value = fresh.title ?? '';
		strokes.value = fresh.strokes;
		resetBaseline();
		await redrawAll();
		// Flatten the loaded state into the baseline so any subsequent redraw is O(recent)
		// instead of re-replaying every stored stroke.
		snapshotBaselineFromLive();
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
	props.connection.off('drawingCursor', onRemoteCursor);
	window.removeEventListener('keydown', onKeyDown);
	window.removeEventListener('mousedown', closeColorPopoverOnOutside);
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
	// Block iOS/iPadOS rubber-band selection, callout, and browser drag on the whole
	// drawing surface. Text inputs inside (color hex field, etc.) re-enable selection
	// locally.
	user-select: none;
	-webkit-user-select: none;
	-webkit-touch-callout: none;
	-webkit-tap-highlight-color: transparent;
	-webkit-user-drag: none;
}

.root input[type="text"],
.root input[type="number"] {
	user-select: text;
	-webkit-user-select: text;
}

.toolbar {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	align-items: center;
	padding: 6px 12px;
	background: var(--MI_THEME-panel);
	border-bottom: solid 1px var(--MI_THEME-divider);
	flex: 0 0 auto;
}

.toolbarSecondary {
	padding-top: 4px;
	background: color-mix(in srgb, var(--MI_THEME-panel) 92%, transparent);
}

.toolGroup {
	display: flex;
	align-items: center;
	gap: 4px;
}

.sliderField {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	padding: 2px 6px;
	border-radius: 6px;
	background: color-mix(in srgb, var(--MI_THEME-bg) 55%, transparent);
}

.sliderIcon {
	font-size: 0.95em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.separator {
	width: 1px;
	height: 22px;
	background: var(--MI_THEME-divider);
	opacity: 0.6;
}

.toolLabel {
	font-size: 0.82em;
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

.layerToggle {
	height: 36px;
	padding: 0 12px;
	border-radius: 6px;
	display: inline-flex;
	align-items: center;
	gap: 6px;
	white-space: nowrap;

	&:hover:not(:disabled) {
		background: var(--MI_THEME-accentedBg);
	}
}

.layerToggleLabel {
	font-size: 0.88em;
	font-weight: 500;
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

.colorSwatch {
	width: 36px;
	height: 28px;
	border: 1px solid var(--MI_THEME-divider);
	border-radius: 6px;
	padding: 2px;
	background: conic-gradient(#f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00);
	cursor: pointer;

	&:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
}

.colorSwatchInner {
	display: block;
	width: 100%;
	height: 100%;
	border-radius: 4px;
	background-image:
		linear-gradient(45deg, #ccc 25%, transparent 25%),
		linear-gradient(-45deg, #ccc 25%, transparent 25%),
		linear-gradient(45deg, transparent 75%, #ccc 75%),
		linear-gradient(-45deg, transparent 75%, #ccc 75%);
	background-size: 8px 8px;
	background-position: 0 0, 0 4px, 4px -4px, -4px 0px;
}

.recentColors {
	display: flex;
	gap: 3px;
	align-items: center;
	max-width: 180px;
	overflow: hidden;
}

.recentColorChip {
	width: 18px;
	height: 18px;
	border-radius: 4px;
	border: 1px solid var(--MI_THEME-divider);
	cursor: pointer;

	&:hover:not(:disabled) {
		transform: scale(1.15);
	}

	&:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
}

.colorPopover {
	position: fixed;
	z-index: 30;
	background: var(--MI_THEME-panel);
	border: 1px solid var(--MI_THEME-divider);
	border-radius: 8px;
	padding: 10px;
	box-shadow: 0 4px 18px rgba(0, 0, 0, 0.25);
	display: flex;
	flex-direction: column;
	gap: 8px;
	width: 210px;
}

.wheelCanvas {
	width: 200px;
	height: 200px;
	touch-action: none;
	align-self: center;
	user-select: none;
	-webkit-user-select: none;
	-webkit-touch-callout: none;
}

.wheelSliderRow {
	display: flex;
	align-items: center;
	gap: 6px;
}

.wheelSlider {
	flex: 1;
}

.hexInput {
	flex: 1;
	min-width: 0;
	padding: 4px 6px;
	border: 1px solid var(--MI_THEME-divider);
	border-radius: 4px;
	background: var(--MI_THEME-bg);
	color: var(--MI_THEME-fg);
	font-family: ui-monospace, monospace;
	font-size: 0.85em;
}

.widthSlider {
	width: 96px;
}

.widthValue {
	min-width: 22px;
	text-align: right;
	font-variant-numeric: tabular-nums;
	font-size: 0.8em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.spacer {
	flex: 1;
}

.canvasArea {
	flex: 1 1 auto;
	min-height: 0;
	background: var(--MI_THEME-bg);
	position: relative;
	// Prevent iOS Safari (iPad) from triggering text-selection / callout / highlight on
	// long press or drag over the canvas area.
	user-select: none;
	-webkit-user-select: none;
	-webkit-touch-callout: none;
	-webkit-tap-highlight-color: transparent;
}

.canvasScroll {
	position: absolute;
	inset: 0;
	overflow: hidden;
	box-sizing: border-box;
}

.canvasWrap {
	position: absolute;
	left: 50%;
	top: 50%;
	width: fit-content;
	height: fit-content;
	transform-origin: center center;
	will-change: transform;
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
	user-select: none;
	-webkit-user-select: none;
	-webkit-touch-callout: none;
	-webkit-tap-highlight-color: transparent;
	-webkit-user-drag: none;
}

.canvasBrushCursor {
	cursor: none; // replaced by the circular overlay
}

.canvasFillCursor {
	cursor: crosshair;
}

.canvasTextCursor {
	cursor: text;
}

.canvasGrabCursor {
	cursor: grab;
}

.canvasGrabbingCursor {
	cursor: grabbing;
}

.textBoxOverlay {
	position: absolute;
	margin: 0;
	padding: 0;
	border: 1px dashed rgba(0, 0, 0, 0.6);
	background: rgba(255, 255, 255, 0.55);
	font-family: sans-serif;
	line-height: 1.4;
	resize: none;
	overflow: hidden;
	box-sizing: content-box;
	white-space: pre;
	z-index: 25;
	outline: none;
	caret-color: currentColor;
	// Follow phase: ghost preview, clicks pass through to canvas to set the anchor.
	pointer-events: none;
}

.textBoxLocked {
	// Locked phase: textarea accepts focus, caret, in-element clicks for caret positioning.
	pointer-events: auto;
}

.canvasMirrored {
	transform: scaleX(-1);
}

.remoteCursor {
	position: absolute;
	pointer-events: none;
	z-index: 15;
	transform: translate(-6px, -6px);
	display: flex;
	align-items: center;
	gap: 4px;
	transition: left 0.05s linear, top 0.05s linear;
}

.remoteCursorAvatar {
	width: 22px;
	height: 22px;
	display: block;
	border-radius: 50%;
	border: 2px solid #fff;
	box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
}

.remoteCursorName {
	background: rgba(0, 0, 0, 0.6);
	color: #fff;
	font-size: 0.75em;
	padding: 1px 6px;
	border-radius: 10px;
	white-space: nowrap;
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
