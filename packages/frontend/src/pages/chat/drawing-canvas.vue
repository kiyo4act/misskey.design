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

	<div ref="rootEl" :class="$style.root" @contextmenu.prevent>
		<!-- Workspace: left tool strip | canvas | right param panel.
		     Layout follows CLIP STUDIO / SAI / Photoshop conventions: tool selection
		     on the left, contextual parameter panels on the right, the canvas takes
		     all remaining space in the middle. The slim bottom bar holds view /
		     history / destructive controls so the workspace doesn't crowd them. -->
		<div :class="$style.workspace">
			<!-- LEFT: vertical tool strip — tools sub-grouped by function. -->
			<aside :class="$style.toolStrip">
				<!-- Pigment brushes — hard edge → soft edge progression. -->
				<button class="_button" :class="[$style.toolButton, tool === 'pen' ? $style.toolActive : null]" title="ペン" @click="tool = 'pen'"><i class="ti ti-pencil"></i></button>
				<button class="_button" :class="[$style.toolButton, tool === 'marker' ? $style.toolActive : null, !rasterToolsVisible ? $style.invisible : null]" :disabled="!rasterToolsVisible" title="マーカー (塗りレイヤー専用 / 乗算ブレンド)" @click="tool = 'marker'"><i class="ti ti-highlight"></i></button>
				<button class="_button" :class="[$style.toolButton, tool === 'watercolor' ? $style.toolActive : null, !rasterToolsVisible ? $style.invisible : null]" :disabled="!rasterToolsVisible" title="水彩 (塗りレイヤー専用 / 重ね塗りで濃くなる)" @click="tool = 'watercolor'"><i class="ti ti-droplet"></i></button>
				<button class="_button" :class="[$style.toolButton, tool === 'airbrush' ? $style.toolActive : null, !rasterToolsVisible ? $style.invisible : null]" :disabled="!rasterToolsVisible" title="エアブラシ (塗りレイヤー専用)" @click="tool = 'airbrush'"><i class="ti ti-spray"></i></button>

				<div :class="[$style.toolStripDivider, !rasterToolsVisible ? $style.invisible : null]"></div>

				<!-- Modifier brushes — only on main layer. -->
				<button class="_button" :class="[$style.toolButton, tool === 'mixer' ? $style.toolActive : null, !rasterToolsVisible ? $style.invisible : null]" :disabled="!rasterToolsVisible" title="指先 (塗りレイヤー専用 / 既存ピクセルをぼかす)" @click="tool = 'mixer'"><i class="ti ti-hand-finger"></i></button>
				<button class="_button" :class="[$style.toolButton, tool === 'dodge' ? $style.toolActive : null, !rasterToolsVisible ? $style.invisible : null]" :disabled="!rasterToolsVisible" title="覆い焼き (塗りレイヤー専用 / 加算ブレンドで明るくする)" @click="tool = 'dodge'"><i class="ti ti-flare"></i></button>

				<div :class="$style.toolStripDivider"></div>

				<!-- Helpers — selection, shape, fill, eraser, text, eyedropper. -->
				<button class="_button" :class="[$style.toolButton, tool === 'lasso' ? $style.toolActive : null]" title="投げ縄選択（全レイヤー貫通・ドラッグで移動 / 角ハンドルで拡縮 / 上ハンドルで回転 / Delete で削除 / Enter で確定 / Esc でキャンセル）" @click="tool = 'lasso'"><i class="ti ti-lasso"></i></button>
				<button class="_button" :class="[$style.toolButton, tool === 'line' ? $style.toolActive : null]" title="直線" @click="tool = 'line'"><i class="ti ti-line"></i></button>
				<button class="_button" :class="[$style.toolButton, tool === 'fill' ? $style.toolActive : null, !rasterToolsVisible ? $style.invisible : null]" :disabled="!rasterToolsVisible" title="塗りつぶし (塗りレイヤー専用)" @click="tool = 'fill'"><i class="ti ti-paint"></i></button>
				<button class="_button" :class="[$style.toolButton, tool === 'eraser' ? $style.toolActive : null]" title="消しゴム" @click="tool = 'eraser'"><i class="ti ti-eraser"></i></button>
				<button class="_button" :class="[$style.toolButton, tool === 'text' ? $style.toolActive : null]" title="テキスト" @click="tool = 'text'"><i class="ti ti-typography"></i></button>
				<button class="_button" :class="[$style.toolButton, tool === 'spoit' ? $style.toolActive : null]" title="スポイト (Alt+クリック)" @click="tool = 'spoit'"><i class="ti ti-color-picker"></i></button>

				<div :class="$style.toolStripDivider"></div>

				<!-- Stroke modifiers — clip routing. Restricts pen / 直線 strokes to
				     pixels that already exist on the named layer (recolour-only). -->
				<button
					class="_button"
					:class="[$style.toolButton, clipMode === 'lineart' ? $style.toolActive : null]"
					title="線画クリップ: ペン/直線を線画レイヤーの既存ピクセルのみに重ねる"
					@click="clipMode = clipMode === 'lineart' ? 'none' : 'lineart'"
				>
					<i class="ti ti-link"></i>
				</button>
				<button
					class="_button"
					:class="[$style.toolButton, clipMode === 'main' ? $style.toolActive : null]"
					title="塗りクリップ: ペン/直線をメインレイヤーの既存ピクセルのみに重ねる"
					@click="clipMode = clipMode === 'main' ? 'none' : 'main'"
				>
					<i class="ti ti-paint-filled"></i>
				</button>
			</aside>

			<!-- CENTER: canvas area. -->
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

				<!-- Rotation handle — only visible while the hand tool is active. Drag the dial
				     around its centre to rotate the canvas; double-click to reset to 0°. -->
				<div
					v-if="tool === 'hand'"
					:class="$style.rotateHandle"
					title="ドラッグで回転 / ダブルクリックで0°にリセット"
					@pointerdown="onRotateHandlePointerDown"
					@pointermove="onRotateHandlePointerMove"
					@pointerup="onRotateHandlePointerUp"
					@pointercancel="onRotateHandlePointerUp"
					@dblclick.stop.prevent="rotation = 0"
				>
					<div :class="$style.rotateHandleDial" :style="{ transform: `rotate(${rotation}deg)` }">
						<i class="ti ti-arrow-up" :class="$style.rotateHandleArrow"></i>
					</div>
					<span :class="$style.rotateHandleLabel">{{ Math.round(rotation) }}°</span>
				</div>

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

			<!-- RIGHT: stacked parameter panels. Each section is independently
			     scrollable when the window is short. -->
			<aside :class="$style.paramPanel">
				<!-- 色 (Color) — wheel always visible in the panel, plus a swatch
				     showing the active colour and the recent-colours strip. -->
				<section :class="$style.panelSection">
					<h3 :class="$style.panelTitle">色</h3>
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
						<div
							:class="$style.colorSwatch"
							:style="{ background: composedColor, cursor: 'default' }"
							:title="`現在の色: ${composedColor}`"
						>
							<span :class="$style.colorSwatchInner" :style="{ background: composedColor }"></span>
						</div>
						<span :class="$style.toolLabel" style="width: 10px;">#</span>
						<input v-model="hexInput" type="text" maxlength="9" :class="$style.hexInput" @change="onHexInputCommit"/>
					</div>
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
				</section>

				<!-- ブラシ (Common brush params) -->
				<section :class="$style.panelSection">
					<h3 :class="$style.panelTitle">ブラシ</h3>
					<label :class="[$style.sliderField, $style.sliderFieldStacked]" :title="tool === 'eraser' ? '消しゴムの太さ' : tool === 'text' ? '文字サイズ' : '太さ'">
						<span :class="$style.toolLabel">{{ tool === 'text' ? 'サイズ' : '太さ' }}</span>
						<input v-model.number="activeBrushWidth" type="range" min="1" max="60" step="1" :class="$style.widthSlider"/>
						<span :class="$style.widthValue">{{ activeBrushWidth }}</span>
					</label>
					<label :class="[$style.sliderField, $style.sliderFieldStacked]" title="不透明度" :style="tool === 'eraser' ? 'opacity: 0.4;' : ''">
						<span :class="$style.toolLabel">不透明度</span>
						<input v-model.number="opacity" type="range" min="0.05" max="1" step="0.05" :class="$style.widthSlider" :disabled="tool === 'eraser'"/>
						<span :class="$style.widthValue">{{ Math.round(opacity * 100) }}</span>
					</label>
					<label :class="[$style.sliderField, $style.sliderFieldStacked]" title="手ぶれ補正">
						<span :class="$style.toolLabel">手ぶれ補正</span>
						<input v-model.number="smoothing" type="range" min="0" max="20" step="1" :class="$style.widthSlider"/>
						<span :class="$style.widthValue">{{ smoothing }}</span>
					</label>
					<button
						class="_button"
						:class="[$style.panelToggle, pressureSensitivity ? $style.toolActive : null]"
						:title="pressureSensitivity ? '筆圧検知: ON（クリックで OFF）' : '筆圧検知: OFF（クリックで ON）'"
						@click="pressureSensitivity = !pressureSensitivity"
					>
						<i :class="['ti', pressureSensitivity ? 'ti-writing' : 'ti-writing-off']"></i>
						<span>筆圧検知{{ pressureSensitivity ? ' ON' : ' OFF' }}</span>
					</button>
				</section>

				<!-- ツール固有 — only when the active tool has its own params. -->
				<section v-if="hasToolParams" :class="$style.panelSection">
					<h3 :class="$style.panelTitle">{{ toolNameLabel }}</h3>
					<template v-if="tool === 'airbrush'">
						<label :class="[$style.sliderField, $style.sliderFieldStacked]" title="エアブラシの硬さ (低=ふわふわ広い / 高=シャープ寄り)">
							<span :class="$style.toolLabel">硬さ</span>
							<input v-model.number="airbrushHardness" type="range" min="0" max="1" step="0.05" :class="$style.widthSlider"/>
							<span :class="$style.widthValue">{{ Math.round(airbrushHardness * 100) }}</span>
						</label>
						<button class="_button" :class="[$style.panelToggle, airbrushShowCore ? $style.toolActive : null]" title="コア線（エアブラシの芯を表示）" @click="airbrushShowCore = !airbrushShowCore">
							<i class="ti ti-line"></i>
							<span>コア線{{ airbrushShowCore ? ' ON' : ' OFF' }}</span>
						</button>
					</template>
					<template v-else-if="tool === 'watercolor'">
						<label :class="[$style.sliderField, $style.sliderFieldStacked]" title="水彩のにじみ (低=シャープ / 高=ふんわり)">
							<span :class="$style.toolLabel">にじみ</span>
							<input v-model.number="watercolorBleed" type="range" min="0" max="2" step="0.05" :class="$style.widthSlider"/>
							<span :class="$style.widthValue">{{ Math.round(watercolorBleed * 100) }}</span>
						</label>
						<label :class="[$style.sliderField, $style.sliderFieldStacked]" title="水彩の濃度 (低=薄塗り重ね / 高=一塗りで濃い)">
							<span :class="$style.toolLabel">濃度</span>
							<input v-model.number="watercolorDensity" type="range" min="0.05" max="1" step="0.05" :class="$style.widthSlider"/>
							<span :class="$style.widthValue">{{ Math.round(watercolorDensity * 100) }}</span>
						</label>
					</template>
					<template v-else-if="tool === 'marker'">
						<label :class="[$style.sliderField, $style.sliderFieldStacked]" title="マーカーの濃さ (乗算ブレンド時の不透明度)">
							<span :class="$style.toolLabel">濃さ</span>
							<input v-model.number="markerIntensity" type="range" min="0.1" max="1" step="0.05" :class="$style.widthSlider"/>
							<span :class="$style.widthValue">{{ Math.round(markerIntensity * 100) }}</span>
						</label>
					</template>
					<template v-else-if="tool === 'mixer'">
						<label :class="[$style.sliderField, $style.sliderFieldStacked]" title="指先の強さ (低=じわっと / 高=一気にぼかす)">
							<span :class="$style.toolLabel">強さ</span>
							<input v-model.number="mixerStrength" type="range" min="0.05" max="1" step="0.05" :class="$style.widthSlider"/>
							<span :class="$style.widthValue">{{ Math.round(mixerStrength * 100) }}</span>
						</label>
					</template>
					<template v-else-if="tool === 'dodge'">
						<label :class="[$style.sliderField, $style.sliderFieldStacked]" title="覆い焼きの強さ (低=ほんのり / 高=一気に明るく)">
							<span :class="$style.toolLabel">強さ</span>
							<input v-model.number="dodgeIntensity" type="range" min="0.05" max="1" step="0.05" :class="$style.widthSlider"/>
							<span :class="$style.widthValue">{{ Math.round(dodgeIntensity * 100) }}</span>
						</label>
					</template>
				</section>

				<!-- レイヤー (Layer) — show all 3 layers as a stacked list (Photoshop /
				     CLIP STUDIO style). Active row is highlighted with the accent
				     colour AND a leading bar so it's unambiguous which layer
				     receives the next stroke. -->
				<section :class="$style.panelSection">
					<h3 :class="$style.panelTitle">レイヤー</h3>
					<div :class="$style.layerList">
						<button
							v-for="opt in layerOptions"
							:key="opt.value"
							class="_button"
							:class="[$style.layerRow, currentLayer === opt.value ? $style.layerRowActive : null]"
							:disabled="layerToggleDisabled && opt.value !== 'main'"
							:title="layerToggleDisabled && opt.value !== 'main' ? '選択中のツールは塗りレイヤー専用' : `${opt.label}レイヤーに切替`"
							@click="currentLayer = opt.value"
						>
							<span :class="$style.layerRowMarker"></span>
							<i :class="['ti', opt.icon, $style.layerRowIcon]"></i>
							<span :class="$style.layerRowLabel">{{ opt.label }}</span>
							<i v-if="currentLayer === opt.value" class="ti ti-check" :class="$style.layerRowCheck"></i>
						</button>
					</div>
					<label :class="[$style.sliderField, $style.sliderFieldStacked]" title="下描きレイヤーの表示透明度">
						<span :class="$style.toolLabel">下描き透明度</span>
						<input v-model.number="draftOpacity" type="range" min="0" max="1" step="0.05" :class="$style.widthSlider"/>
						<span :class="$style.widthValue">{{ Math.round(draftOpacity * 100) }}</span>
					</label>
				</section>
			</aside>
		</div>

		<!-- BOTTOM bar: history / view / clear. Slim status-bar style. -->
		<div :class="$style.bottomBar">
			<div :class="$style.toolGroup">
				<button class="_button" :class="$style.toolButton" :disabled="!canUndo" title="元に戻す (Ctrl+Z)" @click="undo"><i class="ti ti-arrow-back-up"></i></button>
				<button class="_button" :class="$style.toolButton" :disabled="!canRedo" title="やり直し (Ctrl+Y)" @click="redo"><i class="ti ti-arrow-forward-up"></i></button>
			</div>
			<div :class="$style.separator"></div>
			<div :class="$style.toolGroup">
				<button class="_button" :class="$style.toolButton" :disabled="rotation === 0" title="回転リセット" @click="rotation = 0"><i class="ti ti-rotate-clockwise"></i></button>
				<button class="_button" :class="[$style.toolButton, tool === 'hand' ? $style.toolActive : null]" title="手のひら (ドラッグ=移動 / 2本指=ピンチでズーム&回転 / Shift+ドラッグ=回転)" @click="tool = 'hand'"><i class="ti ti-hand-stop"></i></button>
				<button class="_button" :class="$style.toolButton" :disabled="zoom <= MIN_ZOOM" title="ズームアウト" @click="zoomStep(1 / 1.25)"><i class="ti ti-zoom-out"></i></button>
				<button class="_button" :class="[$style.toolButton, $style.zoomLabel]" title="表示をリセット (100% / 中央 / 回転0°)" @click="zoomReset">{{ Math.round(zoom * 100) }}%</button>
				<button class="_button" :class="$style.toolButton" :disabled="zoom >= MAX_ZOOM" title="ズームイン" @click="zoomStep(1.25)"><i class="ti ti-zoom-in"></i></button>
				<button class="_button" :class="[$style.toolButton, mirrorView ? $style.toolActive : null]" title="左右反転ビュー（表示のみ）" @click="mirrorView = !mirrorView"><i class="ti ti-flip-horizontal"></i></button>
			</div>
			<div :class="$style.spacer"></div>
			<button class="_button" :class="[$style.toolButton, $style.dangerButton]" title="全消し（取り消せません）" @click="clearAll"><i class="ti ti-trash"></i></button>
		</div>

		<div :class="$style.footer">
			<button class="_button" :class="$style.cancelButton" @click="closeWindow">
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
import type { ChatDrawingStroke, ChatDrawingTilePatch } from '@/utility/chat-drawing-api.js';
import MkWindow from '@/components/MkWindow.vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { ensureSignin } from '@/i.js';
import {
	apiChatDrawingUpdate,
	apiChatDrawingShow,
	
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
const rootEl = useTemplateRef('rootEl');
const canvasEl = useTemplateRef('canvasEl');
const canvasContainerEl = useTemplateRef('canvasContainerEl');
const canvasAreaEl = useTemplateRef('canvasAreaEl');

// Brush cursor overlay state (tracks pointer in container-local coords, sized by brush width)
const cursorVisible = ref(false);
const cursorStyle = ref<{ left: string; top: string; width: string; height: string }>({ left: '0px', top: '0px', width: '0px', height: '0px' });

// UI tools include client-only 'line' (commits as a 2-point pen stroke on pointer up)
// and 'spoit' (eyedropper — never commits a stroke, just sets color from the pixel picked).
// Tool union, including raster-only brushes that always paint to the main raster
// layer (watercolor / marker / mixer / dodge). These are rendered live to mainCanvas
// and broadcast as raster tile patches; their strokes never enter `strokes[]`.
//
// `lasso` is a layer-spanning selection tool — it captures pixels from main and
// splits/lifts vector strokes from lineart/draft, then exposes scale/rotate/move
// handles on the floating selection.
const tool = ref<'pen' | 'eraser' | 'fill' | 'line' | 'spoit' | 'text' | 'hand' | 'airbrush' | 'watercolor' | 'marker' | 'mixer' | 'dodge' | 'lasso'>('pen');

// Airbrush adjustables. Hardness 0..1 maps to shadow blur ratio (low = wide & soft, high
// = tight & sharp). Core toggles whether the source line is visible — off (default) renders
// only the blurred halo via the off-canvas shadow trick.
const airbrushHardness = ref<number>(0.3);
const airbrushShowCore = ref<boolean>(false);

// Per-tool adjustables for the other raster brushes. Each is exposed as a 0..1
// slider in the toolbar when the matching tool is selected, and read directly by
// the tool's render path.
//   watercolorBleed: shadowBlur ratio for the soft edge (lower = sharper)
//   watercolorDensity: per-stroke alpha multiplier (lower = more passes to build up)
//   markerIntensity: per-stroke alpha multiplier; multiply blend keeps overlaps darkening
//   mixerStrength: blur convergence per dab (lower = subtler smudge)
//   dodgeIntensity: per-stroke alpha multiplier on the additive (lighter) composite
const watercolorBleed = ref<number>(0.7);
const watercolorDensity = ref<number>(0.6);
const markerIntensity = ref<number>(1.0);
const mixerStrength = ref<number>(0.55);
const dodgeIntensity = ref<number>(0.5);

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
	globalThis.setTimeout(() => {
		if (tool.value !== 'text') return;
		const active = globalThis.document.activeElement;
		if (active && active !== globalThis.document.body && active !== el && active instanceof HTMLElement && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
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
	const start = el.selectionStart;
	const end = el.selectionEnd;
	textBoxValue.value = textBoxValue.value.slice(0, start) + '\n' + textBoxValue.value.slice(end);
	void nextTick(() => {
		const target = textBoxEl.value;
		if (!target) return;
		const pos = start + 1;
		target.selectionStart = target.selectionEnd = pos;
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
	// Leaving the lasso tool while a selection is floating — auto-commit it
	// so the user doesn't end up with a stuck floating selection they can't
	// finish. If they were just drawing the polygon, drop the in-progress
	// polygon entirely.
	if (oldT === 'lasso' && newT !== 'lasso') {
		if (lassoSelection.value) commitLassoSelection();
		if (lassoDrawingPolygon.value) {
			lassoDrawingPolygon.value = null;
			recompositeDisplay();
		}
	}
	// Main-only tools (fill / airbrush) always paint to main; surface that in the UI by
	// flipping the active layer over so the layer label and any layer-aware controls
	// (eraser preview, clip mode visibility) match where the next stroke will land.
	if (MAIN_ONLY_TOOLS.has(newT)) {
		currentLayer.value = 'main';
	}
});
const currentLayer = ref<'main' | 'draft' | 'lineart'>('draft');
const draftOpacity = ref(0.4);
const zoom = ref(1);
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;

const opacity = ref<number>(1);
// 0 = no smoothing. Higher = more latency, smoother curves. The pointer moves averaged over
// the last N samples; we trail by (smoothing) samples, then flush the rest on pointerup.
const smoothing = ref<number>(2);
const mirrorView = ref<boolean>(false);

// Layer-separated offscreen canvases. Strokes are drawn to the corresponding offscreen
// canvas (each starts fully transparent) and then composited onto the visible canvas.
// This keeps the main layer's eraser/pen from affecting draft pixels — the main canvas
// becomes transparent where erased, letting draft show through in the composite.
function get2dCtx(canvas: HTMLCanvasElement, opts?: CanvasRenderingContext2DSettings): CanvasRenderingContext2D {
	const c = canvas.getContext('2d', opts);
	if (!c) throw new Error('Failed to acquire 2D context');
	return c;
}

const mainCanvas = globalThis.document.createElement('canvas');
const draftCanvas = globalThis.document.createElement('canvas');
const lineartCanvas = globalThis.document.createElement('canvas');
mainCanvas.width = draftCanvas.width = lineartCanvas.width = 0; // sized on first use
let mainCtx: CanvasRenderingContext2D = get2dCtx(mainCanvas, { willReadFrequently: true });
let draftCtx: CanvasRenderingContext2D = get2dCtx(draftCanvas, { willReadFrequently: true });
let lineartCtx: CanvasRenderingContext2D = get2dCtx(lineartCanvas, { willReadFrequently: true });

// Baseline (flattened) canvases hold the cumulative state for strokes[0..bakedCount-1].
// They let redrawAll skip re-replaying old strokes — instead we blit the baseline and
// only replay the recent window. Strokes that get baked lose their individual undo
// patch (no longer reachable from the undo stack).
const baselineMainCanvas = globalThis.document.createElement('canvas');
const baselineDraftCanvas = globalThis.document.createElement('canvas');
const baselineLineartCanvas = globalThis.document.createElement('canvas');
baselineMainCanvas.width = baselineDraftCanvas.width = baselineLineartCanvas.width = 0;
let baselineMainCtx: CanvasRenderingContext2D = get2dCtx(baselineMainCanvas, { willReadFrequently: true });
let baselineDraftCtx: CanvasRenderingContext2D = get2dCtx(baselineDraftCanvas, { willReadFrequently: true });
let baselineLineartCtx: CanvasRenderingContext2D = get2dCtx(baselineLineartCanvas, { willReadFrequently: true });
let bakedCount = 0;
// Keep the undo window tight so only the last N of my own strokes need their
// per-stroke patch; everything older merges into the baseline.
const UNDO_WINDOW = 10;
// Default colour: 濃い水色 (~#2a8dab). HSV ≈ (0.539, 0.754, 0.671) — kept in sync
// with the hsvH/S/V refs below so the wheel picker opens at the matching position.
const color = ref<string>('#2a8dab');
const width = ref<number>(6);
// Eraser has its own width so switching between pen and eraser doesn't require resizing.
const eraserWidth = ref<number>(20);
// "Lineart clip" mode — when on, pen/paint/line strokes go to the lineart layer with
// `source-atop`, so they only recolor existing line pixels rather than painting new ones.
// Clip mode: 'none' (default), 'lineart' (paint only on lineart layer pixels), or 'main'
// (paint only on main-layer fill pixels). The two clip modes are mutually exclusive.
const clipMode = ref<'none' | 'lineart' | 'main'>('none');
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

// Tools whose strokes can be clipped to an existing layer's content. fill/eraser/spoit/text
// don't make sense for clip routing; line commits as a 2-point pen stroke so it follows
// pen rules. Airbrush is intentionally excluded — it's a main-only tool.
const CLIP_ELIGIBLE_TOOLS = new Set(['pen', 'line']);

// Tools that always land on the main (fill / raster) layer regardless of the active
// layer or clip-mode toggles. The user wanted "fill" and "airbrush" to behave as
// dedicated paint-layer tools — switching the active layer to draft or lineart and
// then picking fill should still paint to main, not the underlay.
// All raster-only brushes belong here. They paint directly to the main raster
// canvas, broadcast as tile-patch PNGs, and never enter `strokes[]`.
const MAIN_ONLY_TOOLS = new Set(['fill', 'airbrush', 'watercolor', 'marker', 'mixer', 'dodge']);

function effectiveLayerForNewStroke(): 'main' | 'draft' | 'lineart' {
	if (MAIN_ONLY_TOOLS.has(tool.value)) return 'main';
	if (clipMode.value === 'lineart' && CLIP_ELIGIBLE_TOOLS.has(tool.value)) return 'lineart';
	if (clipMode.value === 'main' && CLIP_ELIGIBLE_TOOLS.has(tool.value)) return 'main';
	return currentLayer.value;
}

function effectiveClipForNewStroke(): boolean {
	if (MAIN_ONLY_TOOLS.has(tool.value)) return false;
	return clipMode.value !== 'none' && CLIP_ELIGIBLE_TOOLS.has(tool.value);
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
// Initial values match the default `color` (濃い水色) so the wheel and swatch agree
// from the first render — anything else would briefly show a mismatched picker.
const hsvH = ref<number>(0.539);
const hsvS = ref<number>(0.754);
const hsvV = ref<number>(0.671);
const hexInput = ref<string>('#2a8dabff');
const wheelCanvasEl = useTemplateRef('wheelCanvasEl');
const WHEEL_SIZE = 200;
// Geometry for the hue-ring + SV-square picker.
const WHEEL_RING_OUTER = WHEEL_SIZE / 2 - 2; // outermost radius of the hue ring
const WHEEL_RING_INNER = WHEEL_SIZE / 2 - 26; // inner radius of the hue ring (ring thickness = 24px)
// Inscribed square inside the inner circle. side = inner_radius * √2, but shrink a hair
// so the square doesn't visually touch the ring.
const WHEEL_SQUARE_SIDE = Math.floor((WHEEL_RING_INNER - 4) * Math.SQRT2);

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

// Repaint the wheel whenever H/S/V changes. The wheel is now always mounted
// in the right panel, so we don't need a popover-open gate any more.
watch([hsvV, hsvH, hsvS], () => {
	requestAnimationFrame(drawWheel);
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
		// Text bbox = anchor + measured text size at the stored font px.
		const measureCtx = mainCtx;
		if (!stroke.text) return { x: 0, y: 0, w: CANVAS_W, h: CANVAS_H };
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
	// Watercolor and airbrush use shadowBlur for soft edges. The halo extends well past
	// the line radius — if undo only restores up to the line's own radius, the bleed
	// stays visible outside the patched rect and undo looks like a square hole. Pad
	// generously enough to cover the full blur extent.
	const pad = (stroke.tool === 'watercolor' || stroke.tool === 'airbrush')
		? Math.ceil(widthPx * 1.6 + 4)
		: Math.ceil(widthPx / 2 + 2);
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

// Raster-history support for the main (fill) layer. The main layer no longer lives in
// `strokes[]` — instead each completed stroke is baked into mainCanvas and the dirty
// rect is broadcast as a `drawTilePatch` PNG. To keep undo/redo working we capture
// before/after ImageData of the dirty rect for each main-layer stroke we authored, keyed
// by the stroke id we'd otherwise have stored. Undo paints `before` back; redo paints
// `after` and rebroadcasts the patch.
type MainRasterPatch = {
	x: number;
	y: number;
	before: ImageData;
	after: ImageData;
	composite: 'source-over' | 'destination-out' | 'source-atop';
};
const mainRasterPatchHistory = new Map<string, MainRasterPatch>();

function clearMainRasterPatches() {
	mainRasterPatchHistory.clear();
}

// Encode an ImageData rect to a PNG base64 string by drawing through a throwaway canvas.
async function imageDataToBase64Png(img: ImageData): Promise<string | null> {
	const tmp = globalThis.document.createElement('canvas');
	tmp.width = img.width;
	tmp.height = img.height;
	const tctx = tmp.getContext('2d');
	if (!tctx) return null;
	tctx.putImageData(img, 0, 0);
	return await new Promise<string | null>(resolve => {
		tmp.toBlob(async b => {
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

// Decode a base64 PNG into an HTMLImageElement that's ready to drawImage().
function base64PngToImage(b64: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = err => reject(err);
		img.src = `data:image/png;base64,${b64}`;
	});
}

// Bake a just-finished main-layer stroke: snapshot the dirty rect, broadcast it as a
// raster patch, and record before/after into the undo history. Replaces the path that
// would have appended a vector stroke + sent `drawStroke` for the main layer.
//
// `preStrokeLayerSnapshot` must still be the pre-stroke snapshot of the main layer at
// call time (taken at pointerDown via grabPreStrokeSnapshot).
async function commitMainRasterStroke(strokeId: string, bbox: { x: number; y: number; w: number; h: number }, composite: 'source-over' | 'destination-out' | 'source-atop' = 'source-over') {
	if (!preStrokeLayerSnapshot || preStrokeLayerTarget !== 'main') return;
	const before = extractImageDataRegion(preStrokeLayerSnapshot, bbox.x, bbox.y, bbox.w, bbox.h);
	const mainCtxLocal = getLayerCtx('main');
	const after = mainCtxLocal.getImageData(bbox.x, bbox.y, bbox.w, bbox.h);
	mainRasterPatchHistory.set(strokeId, {
		x: bbox.x,
		y: bbox.y,
		before,
		after,
		composite,
	});
	myUndoStack.value.push(strokeId);
	myRedoStack.value = [];
	// Evict oldest history past the cap, mirroring the vector path's behaviour. Past
	// the cap, undo will fall back to "no-op" for that stroke since we don't store the
	// before-state any more.
	while (myUndoStack.value.length > MAX_UNDO_HISTORY) {
		const evicted = myUndoStack.value.shift();
		if (evicted) {
			strokePatches.delete(evicted);
			mainRasterPatchHistory.delete(evicted);
		}
	}
	preStrokeLayerSnapshot = null;
	preStrokeLayerTarget = null;
	const dataBase64 = await imageDataToBase64Png(after);
	if (!dataBase64) return;
	const patch: ChatDrawingTilePatch = {
		id: strokeId,
		x: bbox.x,
		y: bbox.y,
		width: bbox.w,
		height: bbox.h,
		dataBase64,
		composite,
	};
	props.connection.send('drawTilePatch', { drawingId: props.drawingId, patch });
}

// Apply a remote (or replayed local) tile patch to the main canvas.
//
// Invariant: the patch carries the AUTHOR's post-stroke pixel state of the dirty rect,
// padded enough to cover any soft-edge bleed. Receiver replaces the rect verbatim:
// clearRect the destination, then draw the patch image at (x, y) source-over. This
// reproduces the author's exact pixels regardless of whether the stroke was additive,
// erasive, or composite-clipped, at the cost of clobbering any concurrent peer edits
// inside the same rect (last-write-wins, which matches the existing collab semantics).
//
// `patch.composite` is preserved on the wire for forward-compat — future clients may
// honour additive-only patches — but this implementation always uses replace semantics.
async function applyTilePatch(patch: ChatDrawingTilePatch) {
	let img: HTMLImageElement;
	try {
		img = await base64PngToImage(patch.dataBase64);
	} catch {
		return;
	}
	const c = getLayerCtx('main');
	c.save();
	c.setTransform(1, 0, 0, 1, 0, 0);
	c.clearRect(patch.x, patch.y, patch.width, patch.height);
	c.globalCompositeOperation = 'source-over';
	c.globalAlpha = 1;
	c.drawImage(img, patch.x, patch.y);
	c.restore();
	recompositeDisplay();
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
// ストローク開始からの累積パス長 (canvas 内座標, px)。pen 入りの taper を
// 「最初の TAPER_IN_LEN px」のあいだ徐々にランプアップさせるために使用。
// 窓 MA に合成 0 を混ぜる旧方式は、0 が窓から落ちるタイミング (= サンプル数
// が窓長を超えた瞬間) で平均が離散的にジャンプして「描き始めから急に太くなる」
// 段差を生んでいた。距離ベースの taper はサンプルレートに依存せず連続。
let strokePathLength = 0;
// 筆圧専用の固定窓移動平均。ペンタブの生筆圧は高周波ノイズが乗っているため、
// そのまま線幅に使うとドット単位で太さがガタつく。EMA だと一度入った突発値が
// 長く尾を引くので、ここでは固定長 N サンプルの算術平均にして、突発ノイズの
// 寄与を 1/N に固定する (= より一貫した滑らかさ)。
// 位置スタビライザ (smoothing スライダ) とは独立。窓長は短すぎると効かず、
// 長すぎると遅延が目立つので 8 サンプル前後 (≈ 60–70ms@120Hz) に置く。
const PRESSURE_WINDOW_SIZE = 8;
let pressureWindow: number[] = [];
let pressureWindowSum = 0;

function resetPressureSmoothing() {
	pressureWindow = [];
	pressureWindowSum = 0;
}

function pushPressureSample(p: number) {
	pressureWindow.push(p);
	pressureWindowSum += p;
	if (pressureWindow.length > PRESSURE_WINDOW_SIZE) {
		pressureWindowSum -= pressureWindow.shift() as number;
	}
}

function currentSmoothedPressure(): number {
	return pressureWindow.length > 0 ? pressureWindowSum / pressureWindow.length : 0;
}

// 終端速度計算用の最近サンプル (canvas 座標 + timestamp)。pointerdown でリセット、
// 各ポインタサンプル毎に push、pointerup で末尾→先頭の総距離 / 経過時間から
// px/sec を求める。これで「払い」(harai) の長さを終端の勢いで決められる。
type RecentSample = { x: number; y: number; t: number };
const RECENT_SAMPLES_MAX = 6;
let recentSamples: RecentSample[] = [];

function resetRecentSamples() {
	recentSamples = [];
}

function pushRecentSample(nx: number, ny: number) {
	recentSamples.push({ x: nx * CANVAS_W, y: ny * CANVAS_H, t: performance.now() });
	if (recentSamples.length > RECENT_SAMPLES_MAX) {
		recentSamples.shift();
	}
}

function computeEndVelocity(): number {
	if (recentSamples.length < 2) return 0;
	const first = recentSamples[0];
	const last = recentSamples[recentSamples.length - 1];
	const dt = (last.t - first.t) / 1000;
	if (dt <= 0) return 0;
	let totalDist = 0;
	for (let i = 1; i < recentSamples.length; i++) {
		const prev = recentSamples[i - 1];
		const curr = recentSamples[i];
		totalDist += Math.sqrt((curr.x - prev.x) ** 2 + (curr.y - prev.y) ** 2);
	}
	return totalDist / dt;
}

// 終端からの累積パス長 < taperLen の点の筆圧を線形に 0 までスケールする。
// 末尾を細く払う「習字の払い」効果。長さは終端速度から決まるので、勢いよく
// 描き終えた線ほど長く細くなる。
function applyHaraiTaper(points: [number, number, number][], taperLen: number) {
	if (points.length < 2 || taperLen <= 0) return;
	const lengthsFromEnd: number[] = new Array(points.length);
	lengthsFromEnd[points.length - 1] = 0;
	for (let i = points.length - 2; i >= 0; i--) {
		const dx = (points[i + 1][0] - points[i][0]) * CANVAS_W;
		const dy = (points[i + 1][1] - points[i][1]) * CANVAS_H;
		lengthsFromEnd[i] = lengthsFromEnd[i + 1] + Math.sqrt(dx * dx + dy * dy);
	}
	for (let i = 0; i < points.length; i++) {
		const dist = lengthsFromEnd[i];
		if (dist < taperLen) {
			// smoothstep で 0 → 1 (= 細く → 太く向きで 0 が末尾)
			const u = dist / taperLen;
			const f = u * u * (3 - 2 * u);
			points[i] = [points[i][0], points[i][1], points[i][2] * f];
		}
	}
}

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
		const el = canvasEl.value;
		if (!el) throw new Error('canvasEl not yet mounted');
		ctx = get2dCtx(el, { willReadFrequently: false });
	}
	return ctx;
}

function ensureLayerCanvases() {
	if (mainCanvas.width !== CANVAS_W || mainCanvas.height !== CANVAS_H) {
		mainCanvas.width = CANVAS_W;
		mainCanvas.height = CANVAS_H;
	}
	if (draftCanvas.width !== CANVAS_W || draftCanvas.height !== CANVAS_H) {
		draftCanvas.width = CANVAS_W;
		draftCanvas.height = CANVAS_H;
	}
	if (lineartCanvas.width !== CANVAS_W || lineartCanvas.height !== CANVAS_H) {
		lineartCanvas.width = CANVAS_W;
		lineartCanvas.height = CANVAS_H;
	}
}

function ensureBaselineCanvases() {
	if (baselineMainCanvas.width !== CANVAS_W || baselineMainCanvas.height !== CANVAS_H) {
		baselineMainCanvas.width = CANVAS_W;
		baselineMainCanvas.height = CANVAS_H;
	}
	if (baselineDraftCanvas.width !== CANVAS_W || baselineDraftCanvas.height !== CANVAS_H) {
		baselineDraftCanvas.width = CANVAS_W;
		baselineDraftCanvas.height = CANVAS_H;
	}
	if (baselineLineartCanvas.width !== CANVAS_W || baselineLineartCanvas.height !== CANVAS_H) {
		baselineLineartCanvas.width = CANVAS_W;
		baselineLineartCanvas.height = CANVAS_H;
	}
}

function getBaselineLayerCtx(layer: 'main' | 'draft' | 'lineart'): CanvasRenderingContext2D {
	ensureBaselineCanvases();
	if (layer === 'draft') return baselineDraftCtx;
	if (layer === 'lineart') return baselineLineartCtx;
	return baselineMainCtx;
}

function resetBaseline() {
	ensureBaselineCanvases();
	for (const layerCtx of [baselineMainCtx, baselineDraftCtx, baselineLineartCtx]) {
		layerCtx.save();
		layerCtx.setTransform(1, 0, 0, 1, 0, 0);
		layerCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
		layerCtx.restore();
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
		[baselineMainCtx, mainCanvas] as const,
		[baselineDraftCtx, draftCanvas] as const,
		[baselineLineartCtx, lineartCanvas] as const,
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
	// Skip baking main strokes when the raster supersedes them (legacy carry-overs).
	if (!(mainRasterLoaded && layer === 'main')) {
		renderStrokeToCtx(getBaselineLayerCtx(layer), stroke, {
			main: baselineMainCanvas,
			draft: baselineDraftCanvas,
			lineart: baselineLineartCanvas,
		});
	}
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
	if (layer === 'draft') return draftCtx;
	if (layer === 'lineart') return lineartCtx;
	return mainCtx;
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

	// Lasso overlay — drawn last so it stays above all painted content.
	drawLassoOverlay(c);

	c.restore();
}

// Render the in-progress polygon, the floating selection preview, the
// bounding box and the transform handles. Drawn into the same display canvas
// (`canvasEl`) used for the layer composite, so it inherits the view rotation.
function drawLassoOverlay(c: CanvasRenderingContext2D) {
	const drawing = lassoDrawingPolygon.value;
	if (drawing && drawing.length >= 2) {
		c.save();
		c.lineWidth = 1.5;
		c.setLineDash([6, 4]);
		c.strokeStyle = 'rgba(0, 0, 0, 0.85)';
		c.beginPath();
		c.moveTo(drawing[0][0], drawing[0][1]);
		for (let i = 1; i < drawing.length; i++) c.lineTo(drawing[i][0], drawing[i][1]);
		c.stroke();
		c.restore();
	}

	const sel = lassoSelection.value;
	if (!sel) return;
	const cx = sel.bboxX + sel.bboxW / 2;
	const cy = sel.bboxY + sel.bboxH / 2;
	const halfW = sel.bboxW / 2;
	const halfH = sel.bboxH / 2;

	c.save();
	// Apply the floating selection's transform to everything we draw below.
	c.translate(cx + sel.tx, cy + sel.ty);
	c.rotate(sel.rotation);
	c.scale(sel.scale, sel.scale);

	// Floating raster preview on top of the (already-cut) main layer.
	if (sel.rasterCanvas) c.drawImage(sel.rasterCanvas, -halfW, -halfH);

	// Floating vector strokes — rendered to per-layer offscreen canvases so we
	// can apply the same `draftOpacity` to draft strokes that recompositeDisplay
	// applies to the live draft layer. Without this split, draft strokes lifted
	// into the lasso would render at full alpha during the move, losing the
	// see-through guide-layer feel users set up with the draft slider.
	if (sel.vectorStrokes.length > 0) {
		const draftOverlay = globalThis.document.createElement('canvas');
		const lineartOverlay = globalThis.document.createElement('canvas');
		draftOverlay.width = lineartOverlay.width = CANVAS_W;
		draftOverlay.height = lineartOverlay.height = CANVAS_H;
		const draftCtx2 = get2dCtx(draftOverlay);
		const lineartCtx2 = get2dCtx(lineartOverlay);
		let hasDraft = false, hasLineart = false;
		for (const s of sel.vectorStrokes) {
			if (s.layer === 'draft') {
				renderStrokeToCtx(draftCtx2, s);
				hasDraft = true;
			} else {
				renderStrokeToCtx(lineartCtx2, s);
				hasLineart = true;
			}
		}
		// Draft first (under), at the live draftOpacity. Lineart on top at full alpha.
		if (hasDraft) {
			c.save();
			c.globalAlpha = draftOpacity.value;
			c.drawImage(draftOverlay, -cx, -cy);
			c.restore();
		}
		if (hasLineart) c.drawImage(lineartOverlay, -cx, -cy);
	}

	// Bounding box outline + handles — drawn at the un-scaled stroke width so
	// they remain visible at any zoom/scale. We undo the scale temporarily for
	// stroke widths and handle sizes.
	c.lineWidth = 1.5 / sel.scale;
	c.setLineDash([5 / sel.scale, 4 / sel.scale]);
	c.strokeStyle = 'rgba(40, 120, 220, 0.9)';
	c.strokeRect(-halfW, -halfH, sel.bboxW, sel.bboxH);
	c.setLineDash([]);

	// Rotate handle: small filled circle above the top edge, connected by a
	// short line so users see what it controls.
	const rotateOffset = 30 / sel.scale;
	c.beginPath();
	c.moveTo(0, -halfH);
	c.lineTo(0, -halfH - rotateOffset);
	c.stroke();
	const handleR = 6 / sel.scale;
	c.fillStyle = '#fff';
	c.beginPath();
	c.arc(0, -halfH - rotateOffset, handleR, 0, Math.PI * 2);
	c.fill();
	c.stroke();

	// Corner handles: small filled squares on each bbox corner for scaling.
	const sqHalf = 5 / sel.scale;
	for (const [hx, hy] of [
		[-halfW, -halfH], [halfW, -halfH], [-halfW, halfH], [halfW, halfH],
	]) {
		c.fillStyle = '#fff';
		c.fillRect(hx - sqHalf, hy - sqHalf, sqHalf * 2, sqHalf * 2);
		c.strokeRect(hx - sqHalf, hy - sqHalf, sqHalf * 2, sqHalf * 2);
	}

	c.restore();
}

function clearCanvas() {
	ensureLayerCanvases();
	for (const lc of [mainCtx, draftCtx, lineartCtx]) {
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
const fillSampleCanvas = globalThis.document.createElement('canvas');
const fillSampleCtx: CanvasRenderingContext2D = get2dCtx(fillSampleCanvas, { willReadFrequently: true });

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
	}
	const sctx = fillSampleCtx;
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
	rawSx: number, rawSy: number, hexColor: string,
	sampleLayers?: ('main' | 'draft' | 'lineart')[],
	sources?: { main?: HTMLCanvasElement; draft?: HTMLCanvasElement; lineart?: HTMLCanvasElement },
) {
	const sx = Math.max(0, Math.min(CANVAS_W - 1, Math.floor(rawSx)));
	const sy = Math.max(0, Math.min(CANVAS_H - 1, Math.floor(rawSy)));
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

// Parse hex color (#RGB / #RRGGBB / #RRGGBBAA) to [r, g, b, a] each in 0..255.
function parseColorRGBA(hex: string): [number, number, number, number] {
	const s = hex.replace('#', '');
	if (s.length === 3) return [parseInt(s[0] + s[0], 16), parseInt(s[1] + s[1], 16), parseInt(s[2] + s[2], 16), 255];
	if (s.length === 6) return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16), 255];
	if (s.length === 8) return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16), parseInt(s.slice(6, 8), 16)];
	return [0, 0, 0, 255];
}

// Reusable offscreen buffer for the "paint" tool. Paint segments accumulate here at full
// alpha, then composite onto the live layer with the stroke's alpha in one pass — that
// avoids the alpha-overlap bead artefact where adjacent round-cap endpoints would otherwise
// double their alpha and look like a string of dots when the user draws fast.
const paintBuffer = globalThis.document.createElement('canvas');
paintBuffer.width = paintBuffer.height = 0;
const paintBufferCtx: CanvasRenderingContext2D = get2dCtx(paintBuffer);

function ensurePaintBuffer(): CanvasRenderingContext2D {
	if (paintBuffer.width !== CANVAS_W || paintBuffer.height !== CANVAS_H) {
		paintBuffer.width = CANVAS_W;
		paintBuffer.height = CANVAS_H;
	}
	return paintBufferCtx;
}

// Snapshot of the active layer at the start of the current paint stroke, used for fast
// drawImage-based restore on every pointermove (cheaper than putImageData of an ImageData).
const paintBaselineCanvas = globalThis.document.createElement('canvas');
paintBaselineCanvas.width = paintBaselineCanvas.height = 0;
const paintBaselineCtx: CanvasRenderingContext2D = get2dCtx(paintBaselineCanvas);

function ensurePaintBaseline(): CanvasRenderingContext2D {
	if (paintBaselineCanvas.width !== CANVAS_W || paintBaselineCanvas.height !== CANVAS_H) {
		paintBaselineCanvas.width = CANVAS_W;
		paintBaselineCanvas.height = CANVAS_H;
	}
	return paintBaselineCtx;
}

let paintLiveLayer: 'main' | 'draft' | 'lineart' | null = null;

// Snapshot the layer about to be painted, clear the paint buffer — call once at stroke start.
function startPaintLive(layer: 'main' | 'draft' | 'lineart') {
	const baseCtx = ensurePaintBaseline();
	const layerCanvas = layer === 'main' ? mainCanvas : layer === 'draft' ? draftCanvas : lineartCanvas;
	baseCtx.save();
	baseCtx.setTransform(1, 0, 0, 1, 0, 0);
	baseCtx.globalCompositeOperation = 'copy';
	baseCtx.drawImage(layerCanvas, 0, 0);
	baseCtx.restore();
	const bufCtx = ensurePaintBuffer();
	bufCtx.save();
	bufCtx.setTransform(1, 0, 0, 1, 0, 0);
	bufCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
	bufCtx.restore();
	paintLiveLayer = layer;
}

// Stamp a segment onto the live brush buffer at full alpha, then re-render the active
// layer = baseline + (buffer composited at strokeAlpha). Used by all brush-style tools
// (pen / paint / watercolor / mixer) — overlapping segments at alpha 1 are idempotent
// inside the buffer, so the bead artefact at endpoints is gone. Optional `shadow` enables
// the watercolor-style soft-edge bleed.
// Composite modes the buffer→layer step understands. 'source-over' is the default
// pen/airbrush behaviour. 'multiply' darkens overlapping pixels (markers / felt-tip).
// 'lighter' adds (dodge / glow). 'screen' brightens softly (alt for dodge).
type LayerComposite = 'source-over' | 'multiply' | 'lighter' | 'screen';

function paintLiveDrawSegment(
	fromX: number, fromY: number,
	toX: number, toY: number,
	lineWidth: number,
	colorOpaque: string,
	strokeAlpha: number,
	clip: boolean,
	shadow?: { color: string; blur: number; offsetX?: number; offsetY?: number },
	layerComposite: LayerComposite = 'source-over',
) {
	const bufCtx = ensurePaintBuffer();
	bufCtx.save();
	bufCtx.lineCap = 'round';
	bufCtx.lineJoin = 'round';
	bufCtx.globalCompositeOperation = 'source-over';
	bufCtx.globalAlpha = 1;
	bufCtx.strokeStyle = colorOpaque;
	bufCtx.lineWidth = lineWidth;
	if (shadow) {
		bufCtx.shadowColor = shadow.color;
		bufCtx.shadowOffsetX = shadow.offsetX ?? 0;
		bufCtx.shadowOffsetY = shadow.offsetY ?? 0;
		bufCtx.shadowBlur = shadow.blur;
	}
	bufCtx.beginPath();
	bufCtx.moveTo(fromX, fromY);
	bufCtx.lineTo(toX, toY);
	bufCtx.stroke();
	bufCtx.restore();
	if (!paintLiveLayer) return;
	const layerCtx = getLayerCtx(paintLiveLayer);
	layerCtx.save();
	layerCtx.setTransform(1, 0, 0, 1, 0, 0);
	layerCtx.globalCompositeOperation = 'copy';
	layerCtx.drawImage(paintBaselineCanvas, 0, 0);
	layerCtx.globalCompositeOperation = clip ? 'source-atop' : layerComposite;
	layerCtx.globalAlpha = strokeAlpha;
	layerCtx.drawImage(paintBuffer, 0, 0);
	layerCtx.globalAlpha = 1;
	layerCtx.restore();
}

// エアブラシ用のソフト円形スタンプ。色×硬さの組ごとに 1 枚キャッシュし、
// 描画時には drawImage で目的サイズに拡縮して使う。
// segment-shadowBlur 方式は隣接セグメントの halo が source-over で重なり
// alpha が累積するため、ストロークに沿って粒立った筋（ノイズ感）が出やすい。
// 高密度な radial-gradient スタンプは中心の不透明コアが上書きで支配的になる
// ため、ストローク中央付近の不要な濃淡変動が出にくく、外周だけが滑らかに
// フェードする = 自然なエアブラシのグラデーションになる。
const AIRBRUSH_STAMP_SIZE = 256;
let airbrushStampCanvas: HTMLCanvasElement | null = null;
let airbrushStampKey = '';

function ensureAirbrushStamp(opaqueColor: string, hardness: number): HTMLCanvasElement {
	const key = `${opaqueColor}|${hardness.toFixed(3)}`;
	if (airbrushStampCanvas && airbrushStampKey === key) return airbrushStampCanvas;
	const c = airbrushStampCanvas ?? globalThis.document.createElement('canvas');
	c.width = AIRBRUSH_STAMP_SIZE;
	c.height = AIRBRUSH_STAMP_SIZE;
	const sctx = c.getContext('2d');
	if (!sctx) throw new Error('Failed to acquire 2D context for airbrush stamp');
	sctx.clearRect(0, 0, AIRBRUSH_STAMP_SIZE, AIRBRUSH_STAMP_SIZE);
	const cx = AIRBRUSH_STAMP_SIZE / 2;
	const cy = AIRBRUSH_STAMP_SIZE / 2;
	const r = AIRBRUSH_STAMP_SIZE / 2;
	const m = /^rgb\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)\)$/i.exec(opaqueColor);
	const [rr, gg, bb] = m ? [+m[1], +m[2], +m[3]] : [0, 0, 0];
	const colorAt = (a: number) => `rgba(${rr},${gg},${bb},${a})`;
	// 中心ピーク alpha を低めに抑え、密に重ねて中央が自然に飽和へ向かう設計。
	// dab 中心同士が重なる中央付近は急速に高 alpha に達する一方、外周は
	// 緩やかなグラデーションになり、エッジが滑らかに溶ける。
	const peak = 0.45;
	// 硬さで内側プラトーの幅を変える: 0=尖った釣鐘、1=広いコア + 細いフェード。
	const plateau = hardness * 0.55;
	const grad = sctx.createRadialGradient(cx, cy, 0, cx, cy, r);
	grad.addColorStop(0, colorAt(peak));
	if (plateau > 0) grad.addColorStop(plateau, colorAt(peak));
	grad.addColorStop(plateau + (1 - plateau) * 0.45, colorAt(peak * 0.5));
	grad.addColorStop(plateau + (1 - plateau) * 0.8, colorAt(peak * 0.15));
	grad.addColorStop(1, colorAt(0));
	sctx.fillStyle = grad;
	sctx.fillRect(0, 0, AIRBRUSH_STAMP_SIZE, AIRBRUSH_STAMP_SIZE);
	airbrushStampCanvas = c;
	airbrushStampKey = key;
	return c;
}

// Stamp-based airbrush: deposits soft circular dabs along the segment, then
// composites the live buffer onto the active layer at strokeAlpha (mirrors
// `paintLiveDrawSegment`'s buffer→layer step).
function airbrushPaintSegment(
	ax: number, ay: number, bx: number, by: number,
	pressureAvg: number,
	opaqueColor: string,
	strokeAlpha: number,
	clip: boolean,
) {
	const hardness = airbrushHardness.value;
	const showCore = airbrushShowCore.value;
	// 直径は硬さで広さを変える: 硬さ低=広い halo、硬さ高=細く絞る。
	// 筆圧は 0.5..1.0 にマップして、最低でも一定の広がりを保つ。
	const diameter = Math.max(2,
		activeBrushWidth.value * (1 + 2.3 * (1 - hardness)) * (0.5 + 0.5 * pressureAvg),
	);
	const r = diameter / 2;
	const stamp = ensureAirbrushStamp(opaqueColor, hardness);
	const bufCtx = ensurePaintBuffer();
	bufCtx.save();
	bufCtx.globalAlpha = 1;
	bufCtx.globalCompositeOperation = 'source-over';
	const dx = bx - ax;
	const dy = by - ay;
	const dist = Math.sqrt(dx * dx + dy * dy);
	// dab spacing = diameter / 14: 中心同士が十分重なる程度に詰めて、累積で
	// 中央 alpha が飽和する密度。これより粗いと「ぽつぽつ」した模様が見える。
	const spacing = Math.max(0.5, diameter / 14);
	const n = Math.max(1, Math.ceil(dist / spacing));
	// 始点に 1 発、以後 spacing おきに dab を置く。連続呼び出しでは前 segment の
	// 終点が次の始点になるため重複は最小限。
	bufCtx.drawImage(stamp, ax - r, ay - r, diameter, diameter);
	for (let i = 1; i <= n; i++) {
		const t = i / n;
		const x = ax + dx * t;
		const y = ay + dy * t;
		bufCtx.drawImage(stamp, x - r, y - r, diameter, diameter);
	}
	if (showCore) {
		const coreW = Math.max(0.5,
			activeBrushWidth.value * (0.3 + 0.4 * hardness) * (0.5 + 0.5 * pressureAvg),
		);
		bufCtx.lineCap = 'round';
		bufCtx.lineJoin = 'round';
		bufCtx.strokeStyle = opaqueColor;
		bufCtx.lineWidth = coreW;
		bufCtx.beginPath();
		bufCtx.moveTo(ax, ay);
		bufCtx.lineTo(bx, by);
		bufCtx.stroke();
	}
	bufCtx.restore();
	if (!paintLiveLayer) return;
	const layerCtx = getLayerCtx(paintLiveLayer);
	layerCtx.save();
	layerCtx.setTransform(1, 0, 0, 1, 0, 0);
	layerCtx.globalCompositeOperation = 'copy';
	layerCtx.drawImage(paintBaselineCanvas, 0, 0);
	layerCtx.globalCompositeOperation = clip ? 'source-atop' : 'source-over';
	layerCtx.globalAlpha = strokeAlpha;
	layerCtx.drawImage(paintBuffer, 0, 0);
	layerCtx.globalAlpha = 1;
	layerCtx.restore();
}

// 直線 segment を ~1px ごとの sub-segment に分割し、線形補間した lineWidth で
// 各 sub-segment を stroke() する。stroke の入りと抜き (中点との境) で使用。
function penDrawLineSubdividedToCtx(
	dctx: CanvasRenderingContext2D,
	ax: number, ay: number, bx: number, by: number,
	pA: number, pB: number,
	baseWidth: number,
	opaqueColor: string,
) {
	const dx = bx - ax;
	const dy = by - ay;
	const dist = Math.sqrt(dx * dx + dy * dy);
	const k = Math.min(64, Math.max(1, Math.ceil(dist)));
	dctx.save();
	dctx.lineCap = 'round';
	dctx.lineJoin = 'round';
	dctx.strokeStyle = opaqueColor;
	for (let i = 0; i < k; i++) {
		const t0 = i / k;
		const t1 = (i + 1) / k;
		const sx = ax + dx * t0;
		const sy = ay + dy * t0;
		const ex = ax + dx * t1;
		const ey = ay + dy * t1;
		const subP = pA + (pB - pA) * (t0 + t1) / 2;
		dctx.lineWidth = Math.max(0.5, baseWidth * subP);
		dctx.beginPath();
		dctx.moveTo(sx, sy);
		dctx.lineTo(ex, ey);
		dctx.stroke();
	}
	dctx.restore();
}

// 二次ベジエを ~1px ごとに sub-divide して stroke() する。中心線が C1 連続な
// 滑らかカーブとして描かれる + lineWidth も二次補間で連続的に変化する。
// polyline 描画にあった「角」と「太さ段差」を同時に解消する。
function penDrawQuadraticToCtx(
	dctx: CanvasRenderingContext2D,
	p0x: number, p0y: number, p0p: number,
	cx: number, cy: number, cp: number,
	p1x: number, p1y: number, p1p: number,
	baseWidth: number,
	opaqueColor: string,
) {
	const d1 = Math.sqrt((cx - p0x) * (cx - p0x) + (cy - p0y) * (cy - p0y));
	const d2 = Math.sqrt((p1x - cx) * (p1x - cx) + (p1y - cy) * (p1y - cy));
	const k = Math.min(96, Math.max(1, Math.ceil(d1 + d2)));
	dctx.save();
	dctx.lineCap = 'round';
	dctx.lineJoin = 'round';
	dctx.strokeStyle = opaqueColor;
	let prevX = p0x;
	let prevY = p0y;
	for (let i = 1; i <= k; i++) {
		const t = i / k;
		const omt = 1 - t;
		const x = omt * omt * p0x + 2 * omt * t * cx + t * t * p1x;
		const y = omt * omt * p0y + 2 * omt * t * cy + t * t * p1y;
		const tMid = (i - 0.5) / k;
		const omtMid = 1 - tMid;
		const w = omtMid * omtMid * p0p + 2 * omtMid * tMid * cp + tMid * tMid * p1p;
		dctx.lineWidth = Math.max(0.5, baseWidth * w);
		dctx.beginPath();
		dctx.moveTo(prevX, prevY);
		dctx.lineTo(x, y);
		dctx.stroke();
		prevX = x;
		prevY = y;
	}
	dctx.restore();
}

// pen のカーブ平滑化状態。直前の中点と直前の入力点を保持して、新しい入力点が
// 来たら「前中点 → 直前点 (制御点) → 新中点」の二次ベジエを描画する。
// pointerdown でリセット、pointerup の最後で「最後の中点 → 最後の入力点」を
// 直線で締める。
let penCurveLastMidX = 0;
let penCurveLastMidY = 0;
let penCurveLastMidP = 0;
let penCurveHasLastMid = false;
let penCurveLastEndX = 0;
let penCurveLastEndY = 0;
let penCurveLastEndP = 0;

function resetPenCurve() {
	penCurveHasLastMid = false;
}

// Live ペンの筆走り。bufCtx に curve を積み上げ、毎回 baseline + buffer を
// strokeAlpha で合成し直す (paintLiveDrawSegment と同じビーズ抑止パターン)。
function penPaintLive(
	ax: number, ay: number, bx: number, by: number,
	pA: number, pB: number,
	opaqueColor: string,
	strokeAlpha: number,
	clip: boolean,
) {
	const mx = (ax + bx) / 2;
	const my = (ay + by) / 2;
	const mp = (pA + pB) / 2;
	const bufCtx = ensurePaintBuffer();
	bufCtx.save();
	bufCtx.globalCompositeOperation = 'source-over';
	bufCtx.globalAlpha = 1;
	if (!penCurveHasLastMid) {
		// First segment in stroke: 始点から中点までを直線で結ぶ (= 始端の半分)。
		penDrawLineSubdividedToCtx(bufCtx, ax, ay, mx, my, pA, mp, activeBrushWidth.value, opaqueColor);
	} else {
		// 前の中点 → (ax, ay) を制御点 → 現在の中点 を二次ベジエで結ぶ。
		penDrawQuadraticToCtx(bufCtx,
			penCurveLastMidX, penCurveLastMidY, penCurveLastMidP,
			ax, ay, pA,
			mx, my, mp,
			activeBrushWidth.value, opaqueColor,
		);
	}
	bufCtx.restore();
	penCurveLastMidX = mx;
	penCurveLastMidY = my;
	penCurveLastMidP = mp;
	penCurveLastEndX = bx;
	penCurveLastEndY = by;
	penCurveLastEndP = pB;
	penCurveHasLastMid = true;
	if (!paintLiveLayer) return;
	const layerCtx = getLayerCtx(paintLiveLayer);
	layerCtx.save();
	layerCtx.setTransform(1, 0, 0, 1, 0, 0);
	layerCtx.globalCompositeOperation = 'copy';
	layerCtx.drawImage(paintBaselineCanvas, 0, 0);
	layerCtx.globalCompositeOperation = clip ? 'source-atop' : 'source-over';
	layerCtx.globalAlpha = strokeAlpha;
	layerCtx.drawImage(paintBuffer, 0, 0);
	layerCtx.globalAlpha = 1;
	layerCtx.restore();
}

// pointerup の tail flush 後に呼び出して、最後の中点から最後の入力点までを
// 直線で締める (= 終端の半分)。これで stroke の見た目が完全になる。
function finishPenCurve(opaqueColor: string, strokeAlpha: number, clip: boolean) {
	if (!penCurveHasLastMid) return;
	const bufCtx = ensurePaintBuffer();
	bufCtx.save();
	bufCtx.globalCompositeOperation = 'source-over';
	bufCtx.globalAlpha = 1;
	penDrawLineSubdividedToCtx(bufCtx,
		penCurveLastMidX, penCurveLastMidY,
		penCurveLastEndX, penCurveLastEndY,
		penCurveLastMidP, penCurveLastEndP,
		activeBrushWidth.value, opaqueColor,
	);
	bufCtx.restore();
	if (!paintLiveLayer) return;
	const layerCtx = getLayerCtx(paintLiveLayer);
	layerCtx.save();
	layerCtx.setTransform(1, 0, 0, 1, 0, 0);
	layerCtx.globalCompositeOperation = 'copy';
	layerCtx.drawImage(paintBaselineCanvas, 0, 0);
	layerCtx.globalCompositeOperation = clip ? 'source-atop' : 'source-over';
	layerCtx.globalAlpha = strokeAlpha;
	layerCtx.drawImage(paintBuffer, 0, 0);
	layerCtx.globalAlpha = 1;
	layerCtx.restore();
}

// Per-brush parameters for the buffer-based live-draw flow. Each segment of the
// active stroke routes through `paintLiveDrawSegment` with the right shadow / blend
// for the selected tool. The buffer's contents accumulate at full alpha while the
// final composite onto the layer applies tool-specific transparency or blend mode,
// which avoids the alpha-doubling bead artefact at segment endpoints.
function brushBufferStamp(
	ax: number, ay: number, bx: number, by: number,
	pA: number, pB: number,
	opaque: string,
	alpha: number,
	clip: boolean,
) {
	const pAvg = (pA + pB) / 2;
	const baseW = Math.max(0.5, activeBrushWidth.value * pAvg);
	if (tool.value === 'airbrush') {
		airbrushPaintSegment(ax, ay, bx, by, pAvg, opaque, alpha, clip);
		return;
	}
	if (tool.value === 'watercolor') {
		// Soft-edge with shadowBlur, lower effective alpha so repeated passes build up
		// density gradually — closer to real watercolor than a flat opacity stroke.
		const blur = activeBrushWidth.value * watercolorBleed.value;
		const lw = Math.max(0.5, activeBrushWidth.value * (0.4 + 0.6 * pAvg));
		paintLiveDrawSegment(ax, ay, bx, by, lw, opaque, alpha * watercolorDensity.value, clip, { color: opaque, blur });
		return;
	}
	if (tool.value === 'marker') {
		// Hard-edged, multiply blend so overlapping passes darken (felt-tip / copic feel).
		paintLiveDrawSegment(ax, ay, bx, by, baseW, opaque, alpha * markerIntensity.value, clip, undefined, 'multiply');
		return;
	}
	if (tool.value === 'dodge') {
		// Additive ('lighter') for highlight/glow buildup. The intensity slider keeps
		// a single pass from instantly blowing out to white.
		paintLiveDrawSegment(ax, ay, bx, by, baseW, opaque, alpha * dodgeIntensity.value, clip, undefined, 'lighter');
		return;
	}
	// Default: pen — sub-divided stroke で太さ変化を sub-pixel 刻みに
	penPaintLive(ax, ay, bx, by, pA, pB, opaque, alpha, clip);
}

// Mixer (smudge / 指先) — implemented as a true per-pixel blur. Each dab reads
// the pixels under the brush footprint, computes the local mean (alpha-weighted
// RGB so transparent pixels don't pull colour to black; alpha-density mean so
// boundary pixels know how much to fade), and writes each pixel back as a lerp
// toward that mean. Crucially we mutate ImageData directly rather than painting
// with source-over, so alpha can DECREASE — without that, colour at the edge
// of a stroke can never fade and the brush effectively just stamps colour
// forever (the "色が残る" symptom).
//
// dab spacing as a fraction of the brush diameter; smaller = smoother
const MIXER_DAB_SPACING = 0.25;

function blurAtPosition(cx: number, cy: number, radius: number) {
	const c = getLayerCtx('main');
	const r = Math.ceil(radius);
	const left = Math.max(0, Math.floor(cx - r));
	const top = Math.max(0, Math.floor(cy - r));
	const right = Math.min(CANVAS_W, Math.ceil(cx + r) + 1);
	const bottom = Math.min(CANVAS_H, Math.ceil(cy + r) + 1);
	const w = right - left;
	const h = bottom - top;
	if (w <= 0 || h <= 0) return;
	let imgData: ImageData;
	try {
		imgData = c.getImageData(left, top, w, h);
	} catch {
		return;
	}
	const data = imgData.data;
	const r2sq = radius * radius;

	// Pass 1: collect alpha-weighted RGB and alpha-density mean for pixels inside
	// the brush circle. Alpha density includes fully-transparent neighbours so
	// boundary pixels' alpha gets pulled down — that's how edges fade out.
	let weightedR = 0, weightedG = 0, weightedB = 0;
	let alphaSum = 0;
	let count = 0;
	for (let py = 0; py < h; py++) {
		const dyp = (top + py + 0.5) - cy;
		const row = py * w;
		for (let px = 0; px < w; px++) {
			const dxp = (left + px + 0.5) - cx;
			if (dxp * dxp + dyp * dyp > r2sq) continue;
			const off = (row + px) * 4;
			const a = data[off + 3];
			weightedR += data[off] * a;
			weightedG += data[off + 1] * a;
			weightedB += data[off + 2] * a;
			alphaSum += a;
			count++;
		}
	}
	if (count === 0 || alphaSum === 0) return;
	const meanR = weightedR / alphaSum;
	const meanG = weightedG / alphaSum;
	const meanB = weightedB / alphaSum;
	const meanA = alphaSum / count;

	// Pass 2: lerp each in-circle pixel toward the mean. Falloff softens the dab
	// so the centre converges fastest and the edge barely changes — without it,
	// the dab looks like a hard-edged blur disc instead of a soft spot.
	const baseStrength = mixerStrength.value;
	for (let py = 0; py < h; py++) {
		const dyp = (top + py + 0.5) - cy;
		const row = py * w;
		for (let px = 0; px < w; px++) {
			const dxp = (left + px + 0.5) - cx;
			const d2 = dxp * dxp + dyp * dyp;
			if (d2 > r2sq) continue;
			const falloff = 1 - Math.sqrt(d2) / radius;
			const k = baseStrength * falloff;
			if (k <= 0) continue;
			const off = (row + px) * 4;
			data[off] = data[off] * (1 - k) + meanR * k;
			data[off + 1] = data[off + 1] * (1 - k) + meanG * k;
			data[off + 2] = data[off + 2] * (1 - k) + meanB * k;
			data[off + 3] = data[off + 3] * (1 - k) + meanA * k;
		}
	}
	c.putImageData(imgData, left, top);
}

function mixerDrawSegment(ax: number, ay: number, bx: number, by: number, pressureAvg: number) {
	const baseW = Math.max(0.5, activeBrushWidth.value * pressureAvg);
	const radius = baseW / 2;
	const dx = bx - ax;
	const dy = by - ay;
	const dist = Math.sqrt(dx * dx + dy * dy);
	const step = Math.max(1, baseW * MIXER_DAB_SPACING);
	const n = Math.max(1, Math.ceil(dist / step));
	for (let i = 1; i <= n; i++) {
		const t = i / n;
		blurAtPosition(ax + dx * t, ay + dy * t, radius);
	}
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

	// ペンは中点を通る二次ベジエ列で再描画 (Live と同じ平滑化アルゴリズム)。
	// polyline の角と segment 境界の太さ段差を同時に解消する。
	if (stroke.tool === 'pen') {
		const tmp = globalThis.document.createElement('canvas');
		tmp.width = CANVAS_W;
		tmp.height = CANVAS_H;
		const tctx = tmp.getContext('2d');
		if (!tctx) return;
		const [r, g, b, alphaByte] = parseColorRGBA(stroke.color);
		const opaqueColor = `rgb(${r},${g},${b})`;
		const baseWidth = Math.max(1, stroke.width * CANVAS_W);
		const np = stroke.points.length;
		const getP = (idx: number): [number, number, number] => {
			const pt = stroke.points[idx];
			const pp = pt.length >= 3 ? (pt[2] as number) : 1;
			return [pt[0] * CANVAS_W, pt[1] * CANVAS_H, pp];
		};
		if (np === 1) {
			const [x, y, pp] = getP(0);
			penDrawLineSubdividedToCtx(tctx, x, y, x + 0.01, y, pp, pp, baseWidth, opaqueColor);
		} else if (np === 2) {
			const [x0, y0, p0p] = getP(0);
			const [x1, y1, p1p] = getP(1);
			penDrawLineSubdividedToCtx(tctx, x0, y0, x1, y1, p0p, p1p, baseWidth, opaqueColor);
		} else {
			// 3 点以上は中点を通る二次ベジエ列で繋ぐ。先頭は P_0→M_01 の直線、
			// 続く P_i ごとに M_{i-1,i}→P_i (制御)→M_{i,i+1} の二次ベジエ、
			// 末尾は M_{n-2,n-1}→P_{n-1} の直線で締める。
			const [x0, y0, p0p] = getP(0);
			const [x1, y1, p1p] = getP(1);
			let prevMidX = (x0 + x1) / 2;
			let prevMidY = (y0 + y1) / 2;
			let prevMidP = (p0p + p1p) / 2;
			penDrawLineSubdividedToCtx(tctx, x0, y0, prevMidX, prevMidY, p0p, prevMidP, baseWidth, opaqueColor);
			for (let i = 1; i < np - 1; i++) {
				const [cx, cy, cp] = getP(i);
				const [nx, ny, npp] = getP(i + 1);
				const midX = (cx + nx) / 2;
				const midY = (cy + ny) / 2;
				const midP = (cp + npp) / 2;
				penDrawQuadraticToCtx(tctx,
					prevMidX, prevMidY, prevMidP,
					cx, cy, cp,
					midX, midY, midP,
					baseWidth, opaqueColor,
				);
				prevMidX = midX;
				prevMidY = midY;
				prevMidP = midP;
			}
			const [lx, ly, lp] = getP(np - 1);
			penDrawLineSubdividedToCtx(tctx, prevMidX, prevMidY, lx, ly, prevMidP, lp, baseWidth, opaqueColor);
		}
		c.save();
		c.globalCompositeOperation = stroke.clip ? 'source-atop' : 'source-over';
		c.globalAlpha = alphaByte / 255;
		c.drawImage(tmp, 0, 0);
		c.restore();
		return;
	}

	// Paint / watercolor / mixer / airbrush は旧来の segment-stroke 方式。
	// (airbrush は main-only で実際にはこのパスを通らないが、形だけ残す)
	if (stroke.tool === 'paint' || stroke.tool === 'watercolor' || stroke.tool === 'mixer' || stroke.tool === 'airbrush') {
		const tmp = globalThis.document.createElement('canvas');
		tmp.width = CANVAS_W;
		tmp.height = CANVAS_H;
		const tctx = tmp.getContext('2d');
		if (!tctx) return;
		const [r, g, b, alphaByte] = parseColorRGBA(stroke.color);
		const opaqueColor = `rgb(${r},${g},${b})`;
		tctx.lineCap = 'round';
		tctx.lineJoin = 'round';
		tctx.globalAlpha = 1;
		tctx.globalCompositeOperation = 'source-over';
		if (stroke.tool === 'watercolor' || stroke.tool === 'airbrush') {
			tctx.shadowColor = opaqueColor;
			tctx.shadowOffsetX = 0;
			tctx.shadowOffsetY = 0;
		}
		const baseWidth = Math.max(1, stroke.width * CANVAS_W);
		// Airbrush uses the shadow-trick (when core off): source line is rendered off-canvas
		// (-shadowDist on x) and shadowOffsetX brings the blurred shadow back into view, so
		// only the soft halo is visible. With core on, the line draws at the original spot
		// alongside its shadow halo. Hardness 0 = soft (large blur, thin core); hardness 1
		// = sharp (no blur, full width).
		const SHADOW_TRICK_DIST = CANVAS_W * 2;
		const abHardness = stroke.tool === 'airbrush' ? Math.max(0, Math.min(1, stroke.hardness ?? 0.3)) : 0;
		const abCore = stroke.tool === 'airbrush' && stroke.core === true;
		const abBlurFactor = (1 - abHardness) * 1.5;
		const abLineFactor = 0.3 + 0.7 * abHardness;
		const drawOne = (ax: number, ay: number, bx: number, by: number, avg: number) => {
			let drawAx = ax, drawBx = bx;
			if (stroke.tool === 'airbrush') {
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
			} else if (stroke.tool === 'watercolor') {
				tctx.shadowOffsetX = 0;
				tctx.shadowOffsetY = 0;
				tctx.shadowBlur = baseWidth * 0.7;
				tctx.lineWidth = Math.max(0.5, baseWidth * (0.4 + 0.6 * avg));
			} else {
				tctx.lineWidth = Math.max(0.5, baseWidth * avg);
			}
			if (stroke.tool === 'mixer') {
				const mx = Math.max(0, Math.min(CANVAS_W - 1, Math.round((ax + bx) / 2)));
				const my = Math.max(0, Math.min(CANVAS_H - 1, Math.round((ay + by) / 2)));
				let mr = r, mg = g, mb = b;
				try {
					const data = c.getImageData(mx, my, 1, 1).data;
					const w = 0.5 * (data[3] / 255);
					mr = Math.round(r * (1 - w) + data[0] * w);
					mg = Math.round(g * (1 - w) + data[1] * w);
					mb = Math.round(b * (1 - w) + data[2] * w);
				} catch { /* tainted canvas — fall back to brush colour */ }
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
			drawOne(p0[0] * CANVAS_W, p0[1] * CANVAS_H, p0[0] * CANVAS_W + 0.01, p0[1] * CANVAS_H + 0.01, pr);
		} else {
			for (let i = 1; i < stroke.points.length; i++) {
				const a = stroke.points[i - 1];
				const b2 = stroke.points[i];
				const pa = a.length >= 3 ? (a[2] as number) : 1;
				const pb = b2.length >= 3 ? (b2[2] as number) : 1;
				const avg = (pa + pb) / 2;
				drawOne(a[0] * CANVAS_W, a[1] * CANVAS_H, b2[0] * CANVAS_W, b2[1] * CANVAS_H, avg);
			}
		}
		c.save();
		c.globalCompositeOperation = stroke.clip ? 'source-atop' : 'source-over';
		c.globalAlpha = alphaByte / 255;
		c.drawImage(tmp, 0, 0);
		c.restore();
		return;
	}

	// Eraser is the only remaining tool here. Punches alpha → 0 on the target layer so
	// underlying layers show through. Single-pass with destination-out at full alpha — no
	// bead artefact possible because alpha 1 erasure overwrites consistently.
	c.save();
	c.lineCap = 'round';
	c.lineJoin = 'round';
	c.globalCompositeOperation = 'destination-out';
	c.strokeStyle = '#000';
	c.globalAlpha = 1;
	const baseWidth = Math.max(1, stroke.width * CANVAS_W);
	const p0 = stroke.points[0];
	if (stroke.points.length === 1) {
		const pr = p0.length >= 3 ? (p0[2] as number) : 1;
		c.lineWidth = Math.max(0.5, baseWidth * pr);
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

// ────────────────────────────────────────────────────────────────────────────
// Lasso selection — captures content from all three layers inside a free-form
// polygon, lifts it onto a transient floating overlay, and exposes scale /
// rotate / move / delete operations. On commit the floating selection is
// re-baked into the layers at its final transform; on cancel the originals
// are restored. While a selection is active, the underlying layers are shown
// with a "hole" where the selection was lifted from.
// ────────────────────────────────────────────────────────────────────────────

type LassoPoint = [number, number];
type LassoPolygon = LassoPoint[];

// Floating-selection state. `null` outside any selection.
type FloatingSelection = {
	// Closed polygon in canvas space — points the user drew, used both for
	// hit-testing and for clipping the captured raster + vector content.
	polygon: LassoPolygon;
	// Bounding box of `polygon` (axis-aligned, in canvas pixels). Used as the
	// pivot anchor for rotation/scaling and to size the overlay handles.
	bboxX: number; bboxY: number; bboxW: number; bboxH: number;

	// Raster portion lifted from main, masked by the polygon. Stored on its own
	// canvas the size of the bbox so transforms apply to a tight footprint.
	// null when no main pixels were captured (selection was over empty area).
	rasterCanvas: HTMLCanvasElement | null;

	// Vector pieces lifted from lineart/draft. Each entry is a stroke whose
	// points are entirely inside the polygon. Strokes that crossed the boundary
	// have been split at the crossings and only the inside fragments live here.
	// Coordinates are in normalised canvas space (matching ChatDrawingStroke).
	vectorStrokes: ChatDrawingStroke[];

	// Stroke ids that were removed from `strokes[]` (fully inside) or replaced
	// by their outside-fragments. Needed at commit time to broadcast the
	// removals to peers via drawUndo.
	removedOriginalIds: string[];
	// Outside-fragments that need to be broadcast as new strokes (replacing
	// originals that crossed the lasso boundary).
	outsideFragments: ChatDrawingStroke[];

	// Snapshots for cancel. mainSnapshot is the ImageData that was lifted out
	// of mainCanvas at capture time (null when no main pixels selected).
	// originalStrokes is a reference list of the original strokes that were
	// removed/split — restored on cancel via deep copy.
	mainSnapshot: ImageData | null;
	originalStrokes: ChatDrawingStroke[];

	// Affine transform applied to the floating preview, anchored at the bbox
	// centre. tx/ty translate the bbox centre away from its original position,
	// scale and rotation pivot around (bboxX + bboxW/2 + tx, bboxY + bboxH/2 + ty).
	tx: number; ty: number;
	// rotation in radians
	rotation: number;
	// uniform scale, simpler UX than independent x/y
	scale: number;
	// True once the actual cut has been performed — vector strokes split,
	// main pixels lifted, originals removed from strokes[]. False between
	// polygon-close and the first user transform: the underlying layers are
	// still intact, the overlay just shows the polygon + bbox + handles.
	isCut: boolean;
};

const lassoSelection = ref<FloatingSelection | null>(null);
// Polygon currently being drawn (pointer down in lasso mode, before capture
// completes). Drawn live in the overlay with a thin dashed line.
const lassoDrawingPolygon = ref<LassoPolygon | null>(null);
// In-progress transform. Records what the user grabbed at pointerDown so move
// deltas can be applied relative to that anchor.
type LassoDragMode = 'move' | 'scale' | 'rotate';
let lassoDrag: null | {
	mode: LassoDragMode;
	pointerId: number;
	startX: number; startY: number;
	// Snapshot of selection state at drag start so live moves are deltas.
	startTx: number; startTy: number;
	startRotation: number;
	startScale: number;
} = null;

// Lasso commits push a single compound entry to `myUndoStack` (using a synthetic
// id with the `lasso:` prefix). The entry stores everything needed to reverse
// the operation: the strokes that were added, the originals that were removed,
// and ImageData snapshots covering the union of source and destination on
// mainCanvas — undo blits the "before" snapshot back, redo blits the "after".
type LassoUndoEntry = {
	addedStrokes: ChatDrawingStroke[];
	removedStrokes: ChatDrawingStroke[];
	// Union bbox covering source + destination in canvas-px space.
	unionX: number; unionY: number; unionW: number; unionH: number;
	// pre-operation pixels (source intact, dest unchanged)
	mainBeforeUnion: ImageData | null;
	// post-operation pixels (source erased, dest pasted)
	mainAfterUnion: ImageData | null;
};
const lassoUndoEntries = new Map<string, LassoUndoEntry>();

function newLassoUndoId(): string {
	return 'lasso:' + newStrokeId();
}

// Redo stack tracking undo steps taken WHILE a floating lasso selection is
// active (i.e., before commit). Each undo of a still-floating selection pushes
// one entry; redo while floating pops one off. New user actions (fresh polygon,
// fresh transform) invalidate the stack so stale redos don't resurrect old
// state.
type LassoFloatingRedoEntry =
	| { kind: 'transform-reset'; tx: number; ty: number; rotation: number; scale: number }
	| {
		kind: 'cancel';
		polygon: LassoPolygon;
		bboxX: number; bboxY: number; bboxW: number; bboxH: number;
	};
const lassoFloatingRedoStack: LassoFloatingRedoEntry[] = [];

function clearLassoFloatingRedo() {
	lassoFloatingRedoStack.length = 0;
}

// Compose mainBeforeUnion: the pixels at the union bbox AS THEY WERE before
// the lasso operation. Current mainCanvas at this point has the source hole
// (capture cleared it), so we draw sel.mainSnapshot back at the source position
// onto a temp canvas to reconstruct the pre-capture state.
function composeMainBeforeUnion(
	mctx: CanvasRenderingContext2D,
	sourceMain: ImageData,
	sourceX: number, sourceY: number,
	unionX: number, unionY: number, unionW: number, unionH: number,
): ImageData {
	const tmp = globalThis.document.createElement('canvas');
	tmp.width = unionW;
	tmp.height = unionH;
	const tctx = get2dCtx(tmp);
	// Step 1: paint current mainCanvas at union (which has the source hole).
	tctx.drawImage(mainCanvas, unionX, unionY, unionW, unionH, 0, 0, unionW, unionH);
	// Step 2: drawImage of sel.mainSnapshot (via a scratch canvas, since we
	// can't drawImage directly from an ImageData) at the source's offset
	// inside the union — fills the hole.
	const src = globalThis.document.createElement('canvas');
	src.width = sourceMain.width;
	src.height = sourceMain.height;
	get2dCtx(src).putImageData(sourceMain, 0, 0);
	tctx.drawImage(src, sourceX - unionX, sourceY - unionY);
	void mctx;
	return tctx.getImageData(0, 0, unionW, unionH);
}

// Standard ray-casting point-in-polygon test, polygon is a list of [x,y] in
// canvas-pixel space and treated as a closed loop. Returns true if (x, y)
// is inside (boundary cases are unstable but that's acceptable for selection).
function pointInPolygon(x: number, y: number, poly: LassoPolygon): boolean {
	let inside = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const xi = poly[i][0], yi = poly[i][1];
		const xj = poly[j][0], yj = poly[j][1];
		const intersect = ((yi > y) !== (yj > y))
			&& (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi);
		if (intersect) inside = !inside;
	}
	return inside;
}

// Compute the intersection point (and parameter t along ab) of segment ab and
// segment cd. Returns null if they don't intersect within both segments.
function segmentIntersection(
	ax: number, ay: number, bx: number, by: number,
	cx: number, cy: number, dx: number, dy: number,
): { x: number; y: number; t: number } | null {
	const rx = bx - ax;
	const ry = by - ay;
	const sx = dx - cx;
	const sy = dy - cy;
	const denom = rx * sy - ry * sx;
	if (Math.abs(denom) < 1e-9) return null;
	const t = ((cx - ax) * sy - (cy - ay) * sx) / denom;
	const u = ((cx - ax) * ry - (cy - ay) * rx) / denom;
	if (t < 0 || t > 1 || u < 0 || u > 1) return null;
	return { x: ax + rx * t, y: ay + ry * t, t };
}

// Find every place a single stroke segment ab crosses the polygon boundary,
// returned sorted along ab (smallest t first).
function findPolygonCrossings(
	ax: number, ay: number, bx: number, by: number,
	poly: LassoPolygon,
): { x: number; y: number; t: number }[] {
	const out: { x: number; y: number; t: number }[] = [];
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const hit = segmentIntersection(ax, ay, bx, by, poly[j][0], poly[j][1], poly[i][0], poly[i][1]);
		if (hit) out.push(hit);
	}
	out.sort((p, q) => p.t - q.t);
	return out;
}

// Split a vector stroke at every place it crosses the lasso polygon. Returns
// `inside` and `outside` lists of new stroke fragments (each fragment has its
// own fresh id; original id is dropped). A stroke wholly inside or wholly
// outside the polygon ends up as a single fragment in the matching list.
function splitStrokeAtPolygon(stroke: ChatDrawingStroke, poly: LassoPolygon): {
	inside: ChatDrawingStroke[];
	outside: ChatDrawingStroke[];
} {
	const inside: ChatDrawingStroke[] = [];
	const outside: ChatDrawingStroke[] = [];
	if (stroke.points.length === 0) return { inside, outside };

	// Text and fill strokes don't decompose meaningfully — pick a side based on
	// the anchor point. Fill is degenerate (single seed point); text uses its
	// anchor too. Either way, the whole stroke goes to one side.
	if (stroke.tool === 'fill' || stroke.tool === 'text' || stroke.points.length === 1) {
		const p = stroke.points[0];
		const px = p[0] * CANVAS_W;
		const py = p[1] * CANVAS_H;
		const dst = pointInPolygon(px, py, poly) ? inside : outside;
		dst.push({ ...stroke, id: newStrokeId(), points: stroke.points.map(pp => pp.slice()) });
		return { inside, outside };
	}

	// For multi-point strokes: walk segment-by-segment, accumulating into the
	// "current" fragment. When we cross the polygon, end the current fragment
	// at the crossing and start a new one on the other side.
	let fragmentInside = pointInPolygon(stroke.points[0][0] * CANVAS_W, stroke.points[0][1] * CANVAS_H, poly);
	let fragmentPoints: number[][] = [stroke.points[0].slice()];

	const flush = () => {
		if (fragmentPoints.length < 2) {
			// A single point makes no visible mark for line-style strokes; drop it.
			fragmentPoints = [];
			return;
		}
		const dst = fragmentInside ? inside : outside;
		dst.push({ ...stroke, id: newStrokeId(), points: fragmentPoints });
		fragmentPoints = [];
	};

	for (let i = 1; i < stroke.points.length; i++) {
		const pa = stroke.points[i - 1];
		const pb = stroke.points[i];
		const ax = pa[0] * CANVAS_W, ay = pa[1] * CANVAS_H;
		const bx = pb[0] * CANVAS_W, by = pb[1] * CANVAS_H;
		const crossings = findPolygonCrossings(ax, ay, bx, by, poly);
		// Walk through this segment crossing-by-crossing, flipping inside/outside.
		let lastT = 0;
		for (const c of crossings) {
			const cnx = c.x / CANVAS_W;
			const cny = c.y / CANVAS_H;
			// Pressure: linearly interpolate between pa and pb at parameter c.t.
			const cpr = pa.length >= 3 && pb.length >= 3
				? (pa[2] as number) * (1 - c.t) + (pb[2] as number) * c.t
				: 1;
			const crossPoint = pa.length >= 3 ? [cnx, cny, cpr] : [cnx, cny];
			fragmentPoints.push(crossPoint);
			flush();
			fragmentInside = !fragmentInside;
			fragmentPoints.push(crossPoint.slice());
			lastT = c.t;
		}
		// No more crossings on this segment — end-point goes into the current fragment.
		void lastT;
		fragmentPoints.push(pb.slice());
	}
	flush();

	return { inside, outside };
}

// Lasso ops mutate strokes[] (remove/split originals, add fragments / transformed
// copies) AND mainCanvas (lift/stamp pixels). Going through redrawAll afterwards
// is wrong because:
//   - baselineLineart / baselineDraft still hold the originals if they were
//     already baked, so a redrawAll re-blits them and the "removed" strokes
//     come back as ghosts.
//   - baselineMainCanvas may not contain the freshly-stamped raster (on a
//     fresh drawing where the snapshot was empty), so a main-reset wipes the
//     committed lasso content.
// Rebuild the vector layers from the post-mutation strokes[] directly, then
// re-snapshot all three layers as the new baseline so subsequent redraws
// agree with what we've just put on screen.
function rebuildVectorLayersFromStrokes() {
	for (const layer of ['lineart', 'draft'] as const) {
		const c = getLayerCtx(layer);
		c.save();
		c.setTransform(1, 0, 0, 1, 0, 0);
		c.clearRect(0, 0, CANVAS_W, CANVAS_H);
		c.restore();
	}
	for (const s of strokes.value) {
		const layer = resolveStrokeLayer(s);
		if (layer !== 'lineart' && layer !== 'draft') continue;
		renderStrokeToCtx(getLayerCtx(layer), s);
	}
}

// Apply the floating selection's transform to a single point in canvas-pixel
// space. The transform is centred on the bbox so rotation/scaling pivot there.
function applyLassoTransform(sel: FloatingSelection, x: number, y: number): [number, number] {
	const cx = sel.bboxX + sel.bboxW / 2;
	const cy = sel.bboxY + sel.bboxH / 2;
	const dx = x - cx;
	const dy = y - cy;
	const cos = Math.cos(sel.rotation);
	const sin = Math.sin(sel.rotation);
	const rx = (dx * cos - dy * sin) * sel.scale;
	const ry = (dx * sin + dy * cos) * sel.scale;
	return [cx + sel.tx + rx, cy + sel.ty + ry];
}

// Capture the lasso selection from the closed polygon. Splits vector strokes,
// lifts main raster pixels, removes lifted content from the layers, and
// stashes the originals so cancel can restore them. The actual cut (vector
// split + main raster lift) is deferred to `performLassoCut` so a selection
// that the user hasn't moved yet leaves the underlying layers untouched.
function captureLassoSelection(rawPoly: LassoPolygon) {
	if (rawPoly.length < 3) return;
	// Compute bbox
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	for (const [x, y] of rawPoly) {
		if (x < minX) minX = x;
		if (y < minY) minY = y;
		if (x > maxX) maxX = x;
		if (y > maxY) maxY = y;
	}
	minX = Math.max(0, Math.floor(minX));
	minY = Math.max(0, Math.floor(minY));
	maxX = Math.min(CANVAS_W, Math.ceil(maxX));
	maxY = Math.min(CANVAS_H, Math.ceil(maxY));
	const bboxW = maxX - minX;
	const bboxH = maxY - minY;
	if (bboxW < 2 || bboxH < 2) return;

	// New selection invalidates any pending floating-redo entries from a
	// previous lasso session.
	clearLassoFloatingRedo();

	// Lazy capture — empty floating state, no mutation. The cut runs later in
	// performLassoCut on the first transform delta.
	lassoSelection.value = {
		polygon: rawPoly,
		bboxX: minX, bboxY: minY, bboxW, bboxH,
		rasterCanvas: null,
		vectorStrokes: [],
		removedOriginalIds: [],
		outsideFragments: [],
		mainSnapshot: null,
		originalStrokes: [],
		tx: 0, ty: 0,
		rotation: 0,
		scale: 1,
		isCut: false,
	};
	recompositeDisplay();
}

// Perform the deferred cut: split vector strokes at the polygon boundary and
// lift main raster pixels. Called from the pointer-move handler the first time
// the user actually starts transforming the selection.
function performLassoCut(sel: FloatingSelection) {
	if (sel.isCut) return;
	const rawPoly = sel.polygon;

	// Split every vector stroke at the lasso polygon. Inside fragments become
	// the floating selection's vectors; outside fragments replace the original.
	const insideStrokes: ChatDrawingStroke[] = [];
	const outsideFragments: ChatDrawingStroke[] = [];
	const removedIds: string[] = [];
	const originals: ChatDrawingStroke[] = [];
	const next: ChatDrawingStroke[] = [];
	for (const s of strokes.value) {
		if (s.layer !== 'lineart' && s.layer !== 'draft') {
			next.push(s);
			continue;
		}
		const { inside, outside } = splitStrokeAtPolygon(s, rawPoly);
		if (inside.length === 0) {
			next.push(s);
			continue;
		}
		originals.push(JSON.parse(JSON.stringify(s)) as ChatDrawingStroke);
		if (s.id) removedIds.push(s.id);
		for (const f of inside) insideStrokes.push(f);
		for (const f of outside) {
			outsideFragments.push(f);
			next.push(f);
		}
	}
	strokes.value = next;

	// Lift the main raster polygon. We grab the bbox, then mask everything
	// outside the polygon to transparent so the floating canvas only carries
	// the genuinely-selected pixels.
	let rasterCanvas: HTMLCanvasElement | null = null;
	let mainSnapshot: ImageData | null = null;
	const mctx = getLayerCtx('main');
	try {
		mainSnapshot = mctx.getImageData(sel.bboxX, sel.bboxY, sel.bboxW, sel.bboxH);
	} catch {
		mainSnapshot = null;
	}
	if (mainSnapshot) {
		const out = globalThis.document.createElement('canvas');
		out.width = sel.bboxW;
		out.height = sel.bboxH;
		const octx = get2dCtx(out);
		octx.save();
		octx.beginPath();
		for (let i = 0; i < rawPoly.length; i++) {
			const px = rawPoly[i][0] - sel.bboxX;
			const py = rawPoly[i][1] - sel.bboxY;
			if (i === 0) octx.moveTo(px, py);
			else octx.lineTo(px, py);
		}
		octx.closePath();
		octx.clip();
		octx.drawImage(mainCanvas, sel.bboxX, sel.bboxY, sel.bboxW, sel.bboxH, 0, 0, sel.bboxW, sel.bboxH);
		octx.restore();
		rasterCanvas = out;
		// Erase the polygon from live mainCanvas so the layer shows a hole.
		mctx.save();
		mctx.beginPath();
		for (let i = 0; i < rawPoly.length; i++) {
			const px = rawPoly[i][0];
			const py = rawPoly[i][1];
			if (i === 0) mctx.moveTo(px, py);
			else mctx.lineTo(px, py);
		}
		mctx.closePath();
		mctx.globalCompositeOperation = 'destination-out';
		mctx.fillStyle = '#000';
		mctx.fill();
		mctx.restore();
	}

	sel.rasterCanvas = rasterCanvas;
	sel.vectorStrokes = insideStrokes;
	sel.removedOriginalIds = removedIds;
	sel.outsideFragments = outsideFragments;
	sel.mainSnapshot = mainSnapshot;
	sel.originalStrokes = originals;
	sel.isCut = true;
	// Rebuild lineart/draft to reflect strokes[] (without removed originals);
	// snapshot all layers so future redraws don't resurrect the originals.
	rebuildVectorLayersFromStrokes();
	snapshotBaselineFromLive();
	recompositeDisplay();
}

// Bake the floating selection into the layers at its current transform, sync
// the result via WebSocket, then drop the floating state.
function commitLassoSelection() {
	const sel = lassoSelection.value;
	if (!sel) return;
	// Commit ends the floating-redo lifecycle.
	clearLassoFloatingRedo();
	// Uncut selection (user never moved the floating preview) — drop the
	// floating state without recording an undo entry. Nothing was lifted, so
	// there's nothing to commit.
	if (!sel.isCut) {
		lassoSelection.value = null;
		recompositeDisplay();
		return;
	}
	// Use `selRotation` locally — `rotation` at module scope is the view-rotation
	// ref, and shadowing it inside this function would confuse readers.
	const { tx, ty, rotation: selRotation, scale } = sel;
	const cx = sel.bboxX + sel.bboxW / 2;
	const cy = sel.bboxY + sel.bboxH / 2;

	// Compute the union bbox of source + destination so we can snapshot the
	// pre / post mainCanvas state once and replay it on undo / redo. Compute
	// before touching mainCanvas so `mainBeforeUnion` is captured first.
	const corners: LassoPoint[] = [
		[sel.bboxX, sel.bboxY],
		[sel.bboxX + sel.bboxW, sel.bboxY],
		[sel.bboxX + sel.bboxW, sel.bboxY + sel.bboxH],
		[sel.bboxX, sel.bboxY + sel.bboxH],
	];
	let unionMinX = sel.bboxX, unionMinY = sel.bboxY;
	let unionMaxX = sel.bboxX + sel.bboxW, unionMaxY = sel.bboxY + sel.bboxH;
	for (const [x, y] of corners) {
		const [tX, tY] = applyLassoTransform(sel, x, y);
		if (tX < unionMinX) unionMinX = tX;
		if (tY < unionMinY) unionMinY = tY;
		if (tX > unionMaxX) unionMaxX = tX;
		if (tY > unionMaxY) unionMaxY = tY;
	}
	const unionX = Math.max(0, Math.floor(unionMinX) - 2);
	const unionY = Math.max(0, Math.floor(unionMinY) - 2);
	const unionW = Math.min(CANVAS_W - unionX, Math.ceil(unionMaxX) - unionX + 4);
	const unionH = Math.min(CANVAS_H - unionY, Math.ceil(unionMaxY) - unionY + 4);

	const mctx = getLayerCtx('main');
	// "Before" snapshot — current mainCanvas at union has the source hole;
	// composite sel.mainSnapshot back onto a temp canvas to reconstruct the
	// pre-capture state. Skipped when no main pixels were involved.
	const mainBeforeUnion = sel.mainSnapshot
		? composeMainBeforeUnion(mctx, sel.mainSnapshot, sel.bboxX, sel.bboxY, unionX, unionY, unionW, unionH)
		: null;

	// Vector strokes: transform every point and add to strokes[] / broadcast.
	const transformedAdded: ChatDrawingStroke[] = [];
	for (const s of sel.vectorStrokes) {
		const transformed: ChatDrawingStroke = {
			...s,
			id: newStrokeId(),
			points: s.points.map(p => {
				const px = p[0] * CANVAS_W;
				const py = p[1] * CANVAS_H;
				const dx = px - cx;
				const dy = py - cy;
				const cos = Math.cos(selRotation);
				const sin = Math.sin(selRotation);
				const rx = (dx * cos - dy * sin) * scale + cx + tx;
				const ry = (dx * sin + dy * cos) * scale + cy + ty;
				const out: number[] = [rx / CANVAS_W, ry / CANVAS_H];
				if (p.length >= 3) out.push(p[2] as number);
				return out;
			}),
		};
		strokes.value.push(transformed);
		renderStroke(transformed);
		props.connection.send('drawStroke', { drawingId: props.drawingId, stroke: transformed });
		transformedAdded.push(transformed);
	}

	// Outside fragments (already in strokes[] from capture) need to be broadcast
	// so peers see the split version of the originals.
	for (const f of sel.outsideFragments) {
		props.connection.send('drawStroke', { drawingId: props.drawingId, stroke: f });
	}
	// Removed originals → drawUndo for each so peers drop them.
	for (const id of sel.removedOriginalIds) {
		props.connection.send('drawUndo', { drawingId: props.drawingId, strokeId: id });
	}

	// Raster: stamp the floating raster onto main at its transform, then send
	// a tile patch covering the union of the original bbox + the new bbox.
	if (sel.rasterCanvas) {
		mctx.save();
		mctx.translate(cx + tx, cy + ty);
		mctx.rotate(selRotation);
		mctx.scale(scale, scale);
		mctx.drawImage(sel.rasterCanvas, -sel.bboxW / 2, -sel.bboxH / 2);
		mctx.restore();
		const patchData = mctx.getImageData(unionX, unionY, unionW, unionH);
		void imageDataToBase64Png(patchData).then(dataBase64 => {
			if (!dataBase64) return;
			const patch: ChatDrawingTilePatch = {
				id: newStrokeId(),
				x: unionX, y: unionY, width: unionW, height: unionH, dataBase64,
				composite: 'source-over',
			};
			props.connection.send('drawTilePatch', { drawingId: props.drawingId, patch });
		});
	}

	// "After" snapshot — current mainCanvas at union after the paste.
	const mainAfterUnion = sel.mainSnapshot
		? mctx.getImageData(unionX, unionY, unionW, unionH)
		: null;

	// Record a compound undo entry so Ctrl+Z reverses the whole lasso operation
	// (vector deltas + raster paste) atomically.
	const undoId = newLassoUndoId();
	lassoUndoEntries.set(undoId, {
		// All strokes added during the operation: outside fragments (from capture)
		// + transformed copies (from commit). On undo all of them get removed.
		addedStrokes: [...sel.outsideFragments, ...transformedAdded],
		// Originals that were captured/split. On undo they go back into strokes[].
		removedStrokes: sel.originalStrokes,
		unionX, unionY, unionW, unionH,
		mainBeforeUnion, mainAfterUnion,
	});
	myUndoStack.value.push(undoId);
	myRedoStack.value = [];
	while (myUndoStack.value.length > MAX_UNDO_HISTORY) {
		const evicted = myUndoStack.value.shift();
		if (evicted) {
			strokePatches.delete(evicted);
			mainRasterPatchHistory.delete(evicted);
			lassoUndoEntries.delete(evicted);
		}
	}

	lassoSelection.value = null;
	rebuildVectorLayersFromStrokes();
	snapshotBaselineFromLive();
	recompositeDisplay();
}

// Restore the captured content back to its original position and drop the
// selection. Used for Esc.
function cancelLassoSelection() {
	const sel = lassoSelection.value;
	if (!sel) return;
	// Uncut: the layers were never modified, just drop the floating polygon.
	if (!sel.isCut) {
		lassoSelection.value = null;
		recompositeDisplay();
		return;
	}
	// Restore vector strokes — drop outside fragments we'd added, re-insert originals.
	const fragmentIds = new Set(sel.outsideFragments.map(f => f.id).filter((x): x is string => x != null));
	strokes.value = strokes.value.filter(s => !s.id || !fragmentIds.has(s.id));
	for (const orig of sel.originalStrokes) strokes.value.push(orig);

	// Restore main raster from snapshot if we had one.
	if (sel.mainSnapshot) {
		const mctx = getLayerCtx('main');
		mctx.putImageData(sel.mainSnapshot, sel.bboxX, sel.bboxY);
	}

	lassoSelection.value = null;
	rebuildVectorLayersFromStrokes();
	snapshotBaselineFromLive();
	recompositeDisplay();
}

// Drop the selection without restoring — same as commit but without baking.
// Handles main (already cleared from layer) and vector (already removed from
// strokes[]) — we just need to broadcast the removals so peers match.
function deleteLassoSelection() {
	const sel = lassoSelection.value;
	if (!sel) return;
	// Explicit destructive action — discard floating-redo history.
	clearLassoFloatingRedo();
	// Uncut: nothing has been lifted, so "delete" really means "perform the
	// cut and then drop the lifted content". Run performLassoCut first so
	// downstream code has the broadcasts / hole / strokes[] mutations to do.
	if (!sel.isCut) {
		performLassoCut(sel);
	}

	// Broadcast removals for the original vector strokes (peers drop them).
	for (const id of sel.removedOriginalIds) {
		props.connection.send('drawUndo', { drawingId: props.drawingId, strokeId: id });
	}
	// Broadcast outside fragments (peers see the split originals' surviving parts).
	for (const f of sel.outsideFragments) {
		props.connection.send('drawStroke', { drawingId: props.drawingId, stroke: f });
	}
	// Broadcast a tile patch for the lifted main bbox so peers see the hole.
	if (sel.rasterCanvas) {
		const mctx = getLayerCtx('main');
		const patchData = mctx.getImageData(sel.bboxX, sel.bboxY, sel.bboxW, sel.bboxH);
		void imageDataToBase64Png(patchData).then(dataBase64 => {
			if (!dataBase64) return;
			const patch: ChatDrawingTilePatch = {
				id: newStrokeId(),
				x: sel.bboxX, y: sel.bboxY, width: sel.bboxW, height: sel.bboxH, dataBase64,
				composite: 'source-over',
			};
			props.connection.send('drawTilePatch', { drawingId: props.drawingId, patch });
		});
	}

	lassoSelection.value = null;
	rebuildVectorLayersFromStrokes();
	snapshotBaselineFromLive();
	recompositeDisplay();
}

// Hit-test for the floating selection. Returns the drag mode if the pointer
// landed on a handle / inside the bbox; null otherwise. `x, y` are canvas-px.
function lassoHitTest(x: number, y: number): LassoDragMode | null {
	const sel = lassoSelection.value;
	if (!sel) return null;
	const cx = sel.bboxX + sel.bboxW / 2;
	const cy = sel.bboxY + sel.bboxH / 2;
	// Inverse-transform the pointer into the selection's local frame so the
	// hit test works regardless of current rotation/scale.
	const dx = x - (cx + sel.tx);
	const dy = y - (cy + sel.ty);
	const cos = Math.cos(-sel.rotation);
	const sin = Math.sin(-sel.rotation);
	const lx = (dx * cos - dy * sin) / sel.scale + cx;
	const ly = (dx * sin + dy * cos) / sel.scale + cy;
	// hit radius in selection-local pixels — generous so handles aren't fiddly
	const HANDLE = 14 / sel.scale;
	// how far above the bbox top edge the rotate handle is positioned
	const ROTATE_OFFSET = 30 / sel.scale;

	// Rotate handle: above the bbox top edge, at horizontal centre.
	const rhx = sel.bboxX + sel.bboxW / 2;
	const rhy = sel.bboxY - ROTATE_OFFSET;
	if ((lx - rhx) ** 2 + (ly - rhy) ** 2 <= HANDLE * HANDLE) return 'rotate';

	// Corner handles: any of the 4 bbox corners.
	for (const [hx, hy] of [
		[sel.bboxX, sel.bboxY],
		[sel.bboxX + sel.bboxW, sel.bboxY],
		[sel.bboxX, sel.bboxY + sel.bboxH],
		[sel.bboxX + sel.bboxW, sel.bboxY + sel.bboxH],
	]) {
		if ((lx - hx) ** 2 + (ly - hy) ** 2 <= HANDLE * HANDLE) return 'scale';
	}

	// Inside the bbox: drag-to-move.
	if (lx >= sel.bboxX && lx <= sel.bboxX + sel.bboxW
		&& ly >= sel.bboxY && ly <= sel.bboxY + sel.bboxH) return 'move';

	return null;
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
	//
	// Special case: when a main raster is loaded from disk, the main baseline is the
	// raster itself (already painted into mainCanvas) and we skip resetting main from
	// the (empty) baseline — that would erase the raster.
	const layerResets: ReadonlyArray<readonly [CanvasRenderingContext2D, HTMLCanvasElement, 'main' | 'draft' | 'lineart']> = [
		[mainCtx, baselineMainCanvas, 'main'] as const,
		[draftCtx, baselineDraftCanvas, 'draft'] as const,
		[lineartCtx, baselineLineartCanvas, 'lineart'] as const,
	];
	for (const [dst, src, name] of layerResets) {
		if (name === 'main' && mainRasterLoaded) continue;
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
				const s = snapshot[i];
				const layer = resolveStrokeLayer(s);
				// When the main raster is loaded, any main strokes still in `strokes[]` are
				// stale (legacy or pre-migration) and would double up on top of the raster.
				if (mainRasterLoaded && layer === 'main') continue;
				renderStrokeToCtx(getLayerCtx(layer), s);
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
// Standalone measurement context so the textbox computed style can call measureText
// without mutating the live mainCtx state (which would be a side effect inside a
// computed property).
const textMeasureCanvas = globalThis.document.createElement('canvas');
const textMeasureCtx: CanvasRenderingContext2D = get2dCtx(textMeasureCanvas);

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
	// textarea matches the eventual rendered stroke width. The font assignment looks like
	// a side effect to the lint rule, but textMeasureCtx is a private measurement-only
	// canvas — no other code observes its state.
	let widthCSS = TEXT_BOX_MIN_WIDTH_PX;
	const text = textBoxValue.value;
	const lines = text.length > 0 ? text.split('\n') : [''];
	const lineCount = lines.length;
	// eslint-disable-next-line vue/no-side-effects-in-computed-properties -- measurement-only canvas, see comment above
	textMeasureCtx.font = `${fontPxCanvas}px sans-serif`;
	let maxW = 0;
	for (const line of lines) {
		const m = textMeasureCtx.measureText(line);
		if (m.width > maxW) maxW = m.width;
	}
	widthCSS = Math.max(TEXT_BOX_MIN_WIDTH_PX, Math.ceil(maxW * displayScale + TEXT_BOX_PAD_X));
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
	if (panState || handPointers.has(ev.pointerId)) {
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
	const samples = rawBuffer.slice(-n);
	let sx = 0, sy = 0, sp = 0;
	for (const [x, y, p] of samples) { sx += x; sy += y; sp += p; }
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
		const samples = rawBuffer.slice(-n);
		let sx = 0, sy = 0, sp = 0;
		for (const [x, y, p] of samples) { sx += x; sy += y; sp += p; }
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
	const textStrokeId = newStrokeId();
	const stroke: ChatDrawingStroke = {
		id: textStrokeId,
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
	myUndoStack.value.push(textStrokeId);
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

// Hand-tool drag — Mouse+Shift only. Single-pointer rotation pivoted on the canvas
// centre (legacy desktop behavior). Multi-touch and the default no-modifier drag go
// through `handPointers` / `handGesture` below so pinch + twist + pan all compose.
let panState: null | {
	pointerId: number;
	mode: 'rotate';
	startPanX: number;
	startPanY: number;
	startRotation: number;
	pivotX: number;
	pivotY: number;
	startAngle: number;
} = null;

// Multi-pointer hand-tool state. Each tracked pointer keeps its current client
// position; the gesture snapshot is rebuilt every time a pointer is added or
// removed so the canvas stays put while the gesture frame redefines itself.
const handPointers = new Map<number, { clientX: number; clientY: number }>();
let handGesture: null | {
	startCentroidX: number;
	startCentroidY: number;
	startDistance: number;
	startAngle: number;
	startPanX: number;
	startPanY: number;
	startZoom: number;
	startRotation: number;
} = null;

function startHandDrag(ev: PointerEvent) {
	const c = canvasEl.value;
	if (!c) return;
	// Mouse + Shift: legacy keyboard-driven rotation around the canvas centre.
	// Single-pointer; bypasses the multi-touch path so the pivot is fixed.
	if (handPointers.size === 0 && !panState && ev.pointerType === 'mouse' && ev.shiftKey) {
		const rect = c.getBoundingClientRect();
		const pivotX = (rect.left + rect.right) / 2;
		const pivotY = (rect.top + rect.bottom) / 2;
		panState = {
			pointerId: ev.pointerId,
			mode: 'rotate',
			startPanX: panX.value,
			startPanY: panY.value,
			startRotation: rotation.value,
			pivotX,
			pivotY,
			startAngle: Math.atan2(ev.clientY - pivotY, ev.clientX - pivotX),
		};
		panActive.value = true;
		try { c.setPointerCapture(ev.pointerId); } catch { /* noop */ }
		return;
	}
	// Touch / pen / unmodified mouse: track the pointer and (re)build the gesture
	// snapshot. Capture per-pointer so the drag survives leaving the canvas bounds;
	// multi-pointer capture works because each pointer is captured independently.
	try { c.setPointerCapture(ev.pointerId); } catch { /* noop */ }
	handPointers.set(ev.pointerId, { clientX: ev.clientX, clientY: ev.clientY });
	rebuildHandGesture();
}

function updateHandDrag(ev: PointerEvent) {
	if (panState && ev.pointerId === panState.pointerId) {
		const ang = Math.atan2(ev.clientY - panState.pivotY, ev.clientX - panState.pivotX);
		const deltaDeg = (ang - panState.startAngle) * 180 / Math.PI;
		rotation.value = panState.startRotation + deltaDeg;
		return;
	}
	const tracked = handPointers.get(ev.pointerId);
	if (!tracked) return;
	tracked.clientX = ev.clientX;
	tracked.clientY = ev.clientY;
	applyHandGesture();
}

function endHandDrag(ev: PointerEvent) {
	if (panState && ev.pointerId === panState.pointerId) {
		try { canvasEl.value?.releasePointerCapture(ev.pointerId); } catch { /* noop */ }
		panState = null;
		panActive.value = false;
		return;
	}
	if (handPointers.has(ev.pointerId)) {
		try { canvasEl.value?.releasePointerCapture(ev.pointerId); } catch { /* noop */ }
		handPointers.delete(ev.pointerId);
		rebuildHandGesture();
	}
}

// Re-snapshot pan/zoom/rotation against the current pointer set. Called on every
// pointerdown/up while the hand tool has any active pointers, so transitioning
// 1↔2 fingers doesn't cause a discontinuity — the canvas stays at its current
// state and the new pointer geometry becomes the new reference frame.
function rebuildHandGesture() {
	if (handPointers.size === 0) {
		handGesture = null;
		panActive.value = false;
		return;
	}
	let cx = 0; let cy = 0;
	for (const p of handPointers.values()) { cx += p.clientX; cy += p.clientY; }
	cx /= handPointers.size;
	cy /= handPointers.size;
	let dist = 0; let ang = 0;
	if (handPointers.size >= 2) {
		const pts = Array.from(handPointers.values()).slice(0, 2);
		const dx = pts[1].clientX - pts[0].clientX;
		const dy = pts[1].clientY - pts[0].clientY;
		dist = Math.hypot(dx, dy);
		ang = Math.atan2(dy, dx);
	}
	handGesture = {
		startCentroidX: cx,
		startCentroidY: cy,
		startDistance: dist,
		startAngle: ang,
		startPanX: panX.value,
		startPanY: panY.value,
		startZoom: zoom.value,
		startRotation: rotation.value,
	};
	panActive.value = true;
}

function applyHandGesture() {
	if (!handGesture) return;
	let cx = 0; let cy = 0;
	for (const p of handPointers.values()) { cx += p.clientX; cy += p.clientY; }
	cx /= handPointers.size;
	cy /= handPointers.size;

	// Single pointer (or degenerate two-pointer with zero start distance): just
	// translate the canvas by the centroid drift. No zoom/rotation change.
	if (handPointers.size < 2 || handGesture.startDistance === 0) {
		panX.value = handGesture.startPanX + (cx - handGesture.startCentroidX);
		panY.value = handGesture.startPanY + (cy - handGesture.startCentroidY);
		return;
	}

	// Two-finger gesture: pinch ratio drives zoom, twist drives rotation, and
	// the centroid drift drives pan. Composed so the canvas point under the
	// start centroid stays fixed (matching the standard tablet feel). The first
	// two pointers in iteration order define the gesture frame; further pointers
	// are ignored for zoom/rotation.
	const pts = Array.from(handPointers.values()).slice(0, 2);
	const dx = pts[1].clientX - pts[0].clientX;
	const dy = pts[1].clientY - pts[0].clientY;
	const dist = Math.hypot(dx, dy);
	const ang = Math.atan2(dy, dx);

	const newZoom = clampZoom(handGesture.startZoom * (dist / handGesture.startDistance));
	const scaleFactor = newZoom / handGesture.startZoom;
	const angleDelta = ang - handGesture.startAngle;

	const cont = canvasContainerEl.value;
	if (!cont) return;
	const contRect = cont.getBoundingClientRect();
	const containerCx = (contRect.left + contRect.right) / 2;
	const containerCy = (contRect.top + contRect.bottom) / 2;

	// Old canvas centre in screen space (panX/Y is offset from container centre).
	// Apply scale + rotation around the start centroid, then translate by the
	// centroid drift to land the new pan.
	const oldCentreX = containerCx + handGesture.startPanX;
	const oldCentreY = containerCy + handGesture.startPanY;
	const offsetX = oldCentreX - handGesture.startCentroidX;
	const offsetY = oldCentreY - handGesture.startCentroidY;
	const cosA = Math.cos(angleDelta);
	const sinA = Math.sin(angleDelta);
	const newOffsetX = scaleFactor * (offsetX * cosA - offsetY * sinA);
	const newOffsetY = scaleFactor * (offsetX * sinA + offsetY * cosA);
	const newCentreX = handGesture.startCentroidX + newOffsetX + (cx - handGesture.startCentroidX);
	const newCentreY = handGesture.startCentroidY + newOffsetY + (cy - handGesture.startCentroidY);

	panX.value = newCentreX - containerCx;
	panY.value = newCentreY - containerCy;
	zoom.value = newZoom;
	rotation.value = handGesture.startRotation + angleDelta * 180 / Math.PI;
}

// Rotation handle drag session (hand-tool only). Pivot is the visual centre of the canvas
// so dragging around the dial rotates the view around the same point as Shift+drag.
let rotateHandleState: null | {
	pointerId: number;
	pivotX: number;
	pivotY: number;
	startAngle: number;
	startRotation: number;
} = null;

function onRotateHandlePointerDown(ev: PointerEvent) {
	const c = canvasEl.value;
	if (!c) return;
	ev.preventDefault();
	ev.stopPropagation();
	const rect = c.getBoundingClientRect();
	const pivotX = (rect.left + rect.right) / 2;
	const pivotY = (rect.top + rect.bottom) / 2;
	rotateHandleState = {
		pointerId: ev.pointerId,
		pivotX,
		pivotY,
		startAngle: Math.atan2(ev.clientY - pivotY, ev.clientX - pivotX),
		startRotation: rotation.value,
	};
	(ev.currentTarget as Element).setPointerCapture?.(ev.pointerId);
}

function onRotateHandlePointerMove(ev: PointerEvent) {
	if (!rotateHandleState || ev.pointerId !== rotateHandleState.pointerId) return;
	const ang = Math.atan2(ev.clientY - rotateHandleState.pivotY, ev.clientX - rotateHandleState.pivotX);
	const deltaDeg = (ang - rotateHandleState.startAngle) * 180 / Math.PI;
	rotation.value = rotateHandleState.startRotation + deltaDeg;
}

function onRotateHandlePointerUp(ev: PointerEvent) {
	if (!rotateHandleState || ev.pointerId !== rotateHandleState.pointerId) return;
	try { (ev.currentTarget as Element).releasePointerCapture?.(ev.pointerId); } catch { /* noop */ }
	rotateHandleState = null;
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

	// Lasso tool: either drag a handle on the floating selection, or start
	// drawing a new polygon. If a selection is active and the pointer landed
	// outside it, commit the current selection first so the next lasso draws
	// on the freshly-baked layers.
	if (tool.value === 'lasso') {
		const cx = point[0] * CANVAS_W;
		const cy = point[1] * CANVAS_H;
		if (lassoSelection.value) {
			const hit = lassoHitTest(cx, cy);
			if (hit) {
				canvasEl.value?.setPointerCapture(ev.pointerId);
				lassoDrag = {
					mode: hit,
					pointerId: ev.pointerId,
					startX: cx, startY: cy,
					startTx: lassoSelection.value.tx,
					startTy: lassoSelection.value.ty,
					startRotation: lassoSelection.value.rotation,
					startScale: lassoSelection.value.scale,
				};
				return;
			}
			// Click outside the selection — commit and start a fresh polygon at this point.
			commitLassoSelection();
		}
		canvasEl.value?.setPointerCapture(ev.pointerId);
		lassoDrawingPolygon.value = [[cx, cy]];
		recompositeDisplay();
		return;
	}

	// Alt+click on any tool acts as a spoit for one shot.
	if (tool.value === 'spoit' || ev.altKey) {
		const picked = pickColorAt(point[0], point[1]);
		if (picked) applyRecentColor(picked);
		return;
	}

	if (tool.value === 'fill') {
		// Fill is a main-only tool: always lands on the main raster layer, regardless
		// of the active layer or clip mode. Render locally then broadcast as a tile patch.
		grabPreStrokeSnapshot('main');
		const fillStrokeId = newStrokeId();
		const stroke: ChatDrawingStroke = {
			id: fillStrokeId,
			points: [[point[0], point[1]]],
			color: composedColor.value,
			width: 0,
			tool: 'fill',
			layer: 'main',
		};
		renderStroke(stroke);
		void commitMainRasterStroke(fillStrokeId, computeStrokeBbox(stroke), 'source-over');
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

	const usesBrushBuffer = tool.value === 'pen' || tool.value === 'airbrush' || tool.value === 'watercolor' || tool.value === 'marker' || tool.value === 'dodge';
	const usesMixer = tool.value === 'mixer';
	if (usesBrushBuffer) {
		// All buffer-based brush tools route through the live buffer to suppress the
		// bead artefact (alpha doubling at segment endpoints).
		startPaintLive(layerForStroke);
	}

	// ペン (筆圧検知 ON) は描きはじめの瞬間を必ず筆圧 0 で開始する。生筆圧で
	// 始めると入りが太いまま線が始まりテーパーが効かないので、0 から始めて
	// 後続サンプルが窓平均に積まれるにつれて自然に太くなる入りを作る。
	// 筆圧検知 OFF のときは均一線を期待されているのでこの処理はスキップ。
	const startPoint: [number, number, number] = tool.value === 'pen' && pressureSensitivity.value
		? [point[0], point[1], 0]
		: point;
	rawBuffer = [startPoint];
	currentPoints = [startPoint];
	// 新しいストロークの開始ごとに筆圧の窓と累積パス長、カーブ平滑化状態をリセット。
	resetPressureSmoothing();
	resetPenCurve();
	resetRecentSamples();
	pushRecentSample(point[0], point[1]);
	strokePathLength = 0;
	// pen+筆圧検知 ON では合成 0 を窓に入れない (= 入りの taper はパス長ベース
	// で別途実施)。それ以外は実筆圧をそのまま窓に投入する。
	if (!(tool.value === 'pen' && pressureSensitivity.value)) {
		pushPressureSample(startPoint[2]);
	}
	// Stamp the initial dot so a tap/click without movement still leaves a mark.
	// pen+筆圧検知 ON はストローク始点が筆圧 0 で見えないこと、かつ初期ドットを
	// 経由すると penCurveHasLastMid が立って次の penPaintLive が「初期ドットの
	// 中点 → 入力点」のおかしな二次ベジエを描いてしまうため、初期ドットはスキ
	// ップしてカーブ状態をクリーンに保つ。
	if (usesBrushBuffer && !(tool.value === 'pen' && pressureSensitivity.value)) {
		const ix = startPoint[0] * CANVAS_W;
		const iy = startPoint[1] * CANVAS_H;
		const ipr = startPoint[2];
		const [pr, pg, pbb, palpha] = parseColorRGBA(composedColor.value);
		const opaque = `rgb(${pr},${pg},${pbb})`;
		const clip = effectiveClipForNewStroke();
		const alpha = palpha / 255;
		brushBufferStamp(ix, iy, ix + 0.01, iy + 0.01, ipr, ipr, opaque, alpha, clip);
		recompositeDisplay();
	} else if (usesMixer) {
		// Mixer's "stamp" at pointer-down samples and draws a single dot at the start.
		mixerDrawSegment(point[0] * CANVAS_W, point[1] * CANVAS_H, point[0] * CANVAS_W + 0.01, point[1] * CANVAS_H + 0.01, point[2]);
		recompositeDisplay();
	} else {
		renderStroke({
			points: [point],
			color: composedColor.value,
			width: activeBrushWidth.value / CANVAS_W,
			// Cast: only eraser falls through here at runtime (the raster-only branches
			// above caught everything else); 'eraser' is in the wire union.
			tool: tool.value as ChatDrawingStroke['tool'],
			layer: layerForStroke,
			...(effectiveClipForNewStroke() ? { clip: true } : {}),
		});
	}
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
	// Lasso runs through its own move handler — it doesn't go through the
	// `isDrawingStroke` flag because a transform-drag isn't a stroke.
	if (tool.value === 'lasso') {
		const p = canvasPointToNormalized(ev);
		const cx = p[0] * CANVAS_W;
		const cy = p[1] * CANVAS_H;
		// Building a new polygon — append the live point.
		if (lassoDrawingPolygon.value && (!lassoDrag || lassoDrag.pointerId !== ev.pointerId)) {
			const poly = lassoDrawingPolygon.value;
			const last = poly[poly.length - 1];
			// Skip near-duplicate points to keep the polygon tractable for clipping.
			if (Math.hypot(cx - last[0], cy - last[1]) >= 1.5) {
				poly.push([cx, cy]);
				recompositeDisplay();
			}
			return;
		}
		// Transform-dragging a captured selection.
		if (lassoDrag && lassoSelection.value && ev.pointerId === lassoDrag.pointerId) {
			const sel = lassoSelection.value;
			const dx = cx - lassoDrag.startX;
			const dy = cy - lassoDrag.startY;
			// Lazy cut — perform the actual stroke split + raster lift only when
			// the user starts moving the selection. A pure click-without-drag
			// leaves the underlying layers intact.
			if (!sel.isCut && (Math.abs(dx) > 0 || Math.abs(dy) > 0)) {
				performLassoCut(sel);
				rebuildVectorLayersFromStrokes();
				snapshotBaselineFromLive();
				// New manual transform invalidates the floating redo stack.
				clearLassoFloatingRedo();
			}
			if (lassoDrag.mode === 'move') {
				sel.tx = lassoDrag.startTx + dx;
				sel.ty = lassoDrag.startTy + dy;
			} else if (lassoDrag.mode === 'scale') {
				// Uniform scale based on distance from the bbox centre. Bigger pull = bigger.
				const ccx = sel.bboxX + sel.bboxW / 2 + lassoDrag.startTx;
				const ccy = sel.bboxY + sel.bboxH / 2 + lassoDrag.startTy;
				const startDist = Math.hypot(lassoDrag.startX - ccx, lassoDrag.startY - ccy);
				const nowDist = Math.hypot(cx - ccx, cy - ccy);
				if (startDist > 1) {
					const factor = nowDist / startDist;
					sel.scale = Math.max(0.05, Math.min(20, lassoDrag.startScale * factor));
				}
			} else {
				// 'rotate' — the only mode left after move/scale.
				const ccx = sel.bboxX + sel.bboxW / 2 + lassoDrag.startTx;
				const ccy = sel.bboxY + sel.bboxH / 2 + lassoDrag.startTy;
				const startAng = Math.atan2(lassoDrag.startY - ccy, lassoDrag.startX - ccx);
				const nowAng = Math.atan2(cy - ccy, cx - ccx);
				sel.rotation = lassoDrag.startRotation + (nowAng - startAng);
			}
			recompositeDisplay();
			return;
		}
	}

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

	// High-frequency input (pen tablets, fine touch) is coalesced by the OS into one
	// pointermove per frame — getCoalescedEvents exposes the missed sub-frame samples.
	// Iterating them gives the brush engine native-rate samples, which makes diagonal
	// strokes and pressure ramps at stroke-start visibly smoother.
	const samples = (typeof ev.getCoalescedEvents === 'function' ? ev.getCoalescedEvents() : null);
	let drewAnySegment = false;
	if (samples && samples.length > 0) {
		for (const e of samples) {
			if (processBrushSample(e)) drewAnySegment = true;
		}
	} else if (processBrushSample(ev)) {
		drewAnySegment = true;
	}
	if (drewAnySegment) recompositeDisplay();
}

// Returns true if a segment was drawn (caller batches recompositeDisplay).
function processBrushSample(ev: PointerEvent): boolean {
	const p = canvasPointToNormalized(ev);
	// 筆圧の窓平均を毎サンプル更新。位置スタビライザの出力に上書きすることで
	// smoothing スライダの値に関係なく筆圧ノイズを常時抑止する。
	pushPressureSample(p[2]);
	// 終端速度推定用に最近サンプルもタイムスタンプ付きで保持。
	pushRecentSample(p[0], p[1]);
	rawBuffer.push(p);
	const next = consumeStabilized();
	if (!next) return false;
	// 位置は次サンプル基準のまま、筆圧だけ平滑化した値に差し替える。
	next[2] = currentSmoothedPressure();

	const last = currentPoints[currentPoints.length - 1];
	const dx = (next[0] - last[0]) * CANVAS_W;
	const dy = (next[1] - last[1]) * CANVAS_H;
	if (dx * dx + dy * dy < 1) return false;

	// 累積パス長を更新し、pen+筆圧検知 ON のときは「最初の TAPER_IN px」の間
	// smoothstep カーブで筆圧をランプアップ (距離ベースなのでサンプルレートや
	// スタビライザの遅延に左右されない)。線形ランプだと taper 終端で線幅増加率
	// が不連続になり「角」として見えるが、smoothstep は両端で導関数が 0 になる
	// ため C1 連続でテーパー終わりがふんわり繋がる。
	strokePathLength += Math.sqrt(dx * dx + dy * dy);
	if (tool.value === 'pen' && pressureSensitivity.value) {
		const TAPER_IN = Math.max(8, activeBrushWidth.value * 1.5);
		const tt = Math.min(1, strokePathLength / TAPER_IN);
		const taperFactor = tt * tt * (3 - 2 * tt);
		next[2] = next[2] * taperFactor;
	}

	const avgP = (last[2] + next[2]) / 2;
	const ax = last[0] * CANVAS_W;
	const ay = last[1] * CANVAS_H;
	const bx = next[0] * CANVAS_W;
	const by = next[1] * CANVAS_H;
	if (tool.value === 'pen' || tool.value === 'airbrush' || tool.value === 'watercolor' || tool.value === 'marker' || tool.value === 'dodge') {
		const [pr, pg, pbb, palpha] = parseColorRGBA(composedColor.value);
		const opaque = `rgb(${pr},${pg},${pbb})`;
		const clip = effectiveClipForNewStroke();
		const alpha = palpha / 255;
		brushBufferStamp(ax, ay, bx, by, last[2], next[2], opaque, alpha, clip);
		currentPoints.push(next);
		return true;
	}
	if (tool.value === 'mixer') {
		mixerDrawSegment(ax, ay, bx, by, avgP);
		currentPoints.push(next);
		return true;
	}
	// Eraser only path — alpha 1 destination-out, no bead artefact possible.
	const c = getLayerCtx(preStrokeLayerTarget ?? currentLayer.value);
	c.save();
	c.lineCap = 'round';
	c.lineJoin = 'round';
	c.globalCompositeOperation = 'destination-out';
	c.strokeStyle = '#000';
	c.globalAlpha = 1;
	c.lineWidth = Math.max(0.5, activeBrushWidth.value * avgP);
	c.beginPath();
	c.moveTo(last[0] * CANVAS_W, last[1] * CANVAS_H);
	c.lineTo(next[0] * CANVAS_W, next[1] * CANVAS_H);
	c.stroke();
	c.restore();
	currentPoints.push(next);
	return true;
}

function onPointerUp(ev: PointerEvent) {
	if ((panState && ev.pointerId === panState.pointerId) || handPointers.has(ev.pointerId)) {
		endHandDrag(ev);
		return;
	}

	// Lasso lifecycle: finish polygon-draw OR end transform-drag.
	if (tool.value === 'lasso') {
		try { canvasEl.value?.releasePointerCapture(ev.pointerId); } catch { /* noop */ }
		// End transform-drag (no capture phase to start).
		if (lassoDrag && lassoDrag.pointerId === ev.pointerId) {
			lassoDrag = null;
			return;
		}
		// Close polygon — append final point and capture.
		if (lassoDrawingPolygon.value) {
			const poly = lassoDrawingPolygon.value;
			const p = canvasPointToNormalized(ev);
			poly.push([p[0] * CANVAS_W, p[1] * CANVAS_H]);
			lassoDrawingPolygon.value = null;
			captureLassoSelection(poly);
			return;
		}
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
		const lineStrokeId = newStrokeId();
		const stroke: ChatDrawingStroke = {
			id: lineStrokeId,
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
		if (lineLayer === 'main') {
			renderStroke(stroke);
			void commitMainRasterStroke(lineStrokeId, computeStrokeBbox(stroke), lineClip ? 'source-atop' : 'source-over');
			recordRecentColor(color.value);
			lineStart = null;
			if (pendingRemoteRedraw) void flushPendingRedraw();
			return;
		}
		strokes.value.push(stroke);
		renderStroke(stroke);
		props.connection.send('drawStroke', { drawingId: props.drawingId, stroke });
		myUndoStack.value.push(lineStrokeId);
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
	const finalSmoothed = currentSmoothedPressure();
	// ペン (筆圧検知 ON) は描き終わりの瞬間も筆圧 0 に強制 (始端と対称)。最後
	// の tail サンプルだけ 0 に置き換え、手前の tail サンプルは finalSmoothed
	// を維持。結果: 最終 segment が radiusA=finalSmoothed → radiusB=0 で arc+fill
	// 補間され、終端が自然に 0 へテーパーアウトする。
	const taperEndZero = tool.value === 'pen' && pressureSensitivity.value;
	for (let ti = 0; ti < tail.length; ti++) {
		const next = tail[ti];
		const isLastTail = ti === tail.length - 1;
		next[2] = (taperEndZero && isLastTail) ? 0 : finalSmoothed;
		if (currentPoints.length === 0) { currentPoints.push(next); continue; }
		const last = currentPoints[currentPoints.length - 1];
		const dx = (next[0] - last[0]) * CANVAS_W;
		const dy = (next[1] - last[1]) * CANVAS_H;
		if (dx * dx + dy * dy < 1) continue;
		const avgP = (last[2] + next[2]) / 2;
		const c = getLayerCtx(preStrokeLayerTarget ?? currentLayer.value);
		const ax = last[0] * CANVAS_W;
		const ay = last[1] * CANVAS_H;
		const bx = next[0] * CANVAS_W;
		const by = next[1] * CANVAS_H;
		if (tool.value === 'pen' || tool.value === 'airbrush' || tool.value === 'watercolor' || tool.value === 'marker' || tool.value === 'dodge') {
			const [pr, pg, pbb, palpha] = parseColorRGBA(composedColor.value);
			const opaque = `rgb(${pr},${pg},${pbb})`;
			const clip = effectiveClipForNewStroke();
			const alpha = palpha / 255;
			brushBufferStamp(ax, ay, bx, by, last[2], next[2], opaque, alpha, clip);
			currentPoints.push(next);
			continue;
		}
		if (tool.value === 'mixer') {
			mixerDrawSegment(ax, ay, bx, by, avgP);
			currentPoints.push(next);
			continue;
		}
		c.save();
		c.lineCap = 'round';
		c.lineJoin = 'round';
		c.globalCompositeOperation = 'destination-out';
		c.strokeStyle = '#000';
		c.globalAlpha = 1;
		c.lineWidth = Math.max(0.5, activeBrushWidth.value * avgP);
		c.beginPath();
		c.moveTo(ax, ay);
		c.lineTo(bx, by);
		c.stroke();
		c.restore();
		currentPoints.push(next);
	}
	// pen のカーブ平滑化は最後の中点で止まっているので、最終的な「最後の中点
	// → 最後の入力点」直線を描いて stroke を完結させる。
	if (tool.value === 'pen') {
		const [pr, pg, pbb, palpha] = parseColorRGBA(composedColor.value);
		const opaque = `rgb(${pr},${pg},${pbb})`;
		const clip = effectiveClipForNewStroke();
		const alpha = palpha / 255;
		finishPenCurve(opaque, alpha, clip);
	}
	recompositeDisplay();
	rawBuffer = [];

	if (currentPoints.length === 0) {
		if (pendingRemoteRedraw) void flushPendingRedraw();
		return;
	}

	// tool.value is a ref so TS doesn't narrow across the earlier branches that return
	// for line/fill/spoit — explicitly coerce to the committable tool set. The new
	// raster-only tools (marker / dodge) aren't in the wire union; since they always
	// go through the main-raster path (their strokes never serialise), we fall them
	// back to 'pen' on the stroke object — only the bbox is used downstream.
	const commitTool: ChatDrawingStroke['tool'] =
		tool.value === 'eraser' ? 'eraser' :
		tool.value === 'airbrush' ? 'airbrush' :
		tool.value === 'watercolor' ? 'watercolor' :
		tool.value === 'mixer' ? 'mixer' :
		'pen';
	const commitLayer = preStrokeLayerTarget ?? currentLayer.value;
	const commitClip = effectiveClipForNewStroke() && commitTool !== 'eraser';
	const commitStrokeId = newStrokeId();

	// 「払い」(harai) — 終端速度がしきい値超のとき、終端から taperLen 分だけ
	// 筆圧を 0 にスケールダウンして再描画する。勢いよく描き終えた線ほど長く
	// 細くなり、ゆっくり止めた線はそのまま太く終わる。
	let haraiApplied = false;
	if (commitTool === 'pen' && pressureSensitivity.value && currentPoints.length >= 2) {
		const v = computeEndVelocity();
		const HARAI_THRESHOLD = 500;
		const HARAI_FACTOR = 0.1;
		const HARAI_MAX_LEN = 120;
		if (v > HARAI_THRESHOLD) {
			const taperLen = Math.min(HARAI_MAX_LEN, (v - HARAI_THRESHOLD) * HARAI_FACTOR);
			if (taperLen > 0) {
				applyHaraiTaper(currentPoints, taperLen);
				if (preStrokeLayerSnapshot && preStrokeLayerTarget) {
					const layerCtx = getLayerCtx(preStrokeLayerTarget);
					layerCtx.putImageData(preStrokeLayerSnapshot, 0, 0);
				}
				haraiApplied = true;
			}
		}
	}

	const stroke: ChatDrawingStroke = {
		id: commitStrokeId,
		points: currentPoints,
		color: composedColor.value,
		width: activeBrushWidth.value / CANVAS_W,
		tool: commitTool,
		layer: commitLayer,
		...(commitClip ? { clip: true } : {}),
		...(commitTool === 'airbrush' ? { hardness: airbrushHardness.value, ...(airbrushShowCore.value ? { core: true } : {}) } : {}),
	};
	currentPoints = [];

	if (haraiApplied) {
		// preStrokeLayerSnapshot を putImageData で書き戻したので、harai 適用後の
		// points で stroke 全体を再描画して commit 前のレイヤを正しい姿に戻す。
		renderStroke(stroke);
		recompositeDisplay();
	}

	if (commitLayer === 'main') {
		// Pixels are already on mainCanvas (via paintLiveDrawSegment for pen/airbrush, or
		// destination-out direct draw for eraser). Just dirty-rect-snapshot, broadcast as
		// a tile patch, and record undo history. Do NOT push to strokes[].
		const composite: 'source-over' | 'destination-out' | 'source-atop' =
			commitTool === 'eraser' ? 'destination-out' :
			commitClip ? 'source-atop' :
			'source-over';
		void commitMainRasterStroke(commitStrokeId, computeStrokeBbox(stroke), composite);
		if (tool.value !== 'eraser') recordRecentColor(color.value);
		if (pendingRemoteRedraw) void flushPendingRedraw();
		return;
	}

	strokes.value.push(stroke);
	props.connection.send('drawStroke', { drawingId: props.drawingId, stroke });
	myUndoStack.value.push(commitStrokeId);
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
	// Defensive: a stricter peer should never broadcast main strokes through the vector
	// channel, but if a legacy client does, fall through to the existing render path
	// which routes to the appropriate layer canvas.
	strokes.value.push(payload.stroke);
	renderStroke(payload.stroke);
	maybeBakeOverflow();
}

function onRemoteTilePatch(payload: { userId: string; drawingId: string; patch: ChatDrawingTilePatch }) {
	if (payload.drawingId !== props.drawingId) return;
	if (payload.userId === $i.id) return;
	void applyTilePatch(payload.patch);
}

function onRemoteClear(payload: { userId: string; drawingId: string }) {
	if (payload.drawingId !== props.drawingId) return;
	strokes.value = [];
	resetBaseline();
	clearCanvas();
	clearMainRasterPatches();
	mainRasterRedoHistory.clear();
	mainRasterLoaded = false;
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
		clearMainRasterPatches();
		mainRasterRedoHistory.clear();
		resetBaseline();
		await loadMainRasterFromUrl(fresh.mainImageUrl);
		await redrawAll();
		await applyLiveTilePatchesIfAny(fresh.liveTilePatches);
		// Flatten the replayed state into the baseline so subsequent redraws are cheap.
		snapshotBaselineFromLive();
	} catch (err) {
		console.error('failed to reload drawing', err);
	}
}

// Fetch the main raster PNG by URL and paint it into mainCanvas (replacing any prior
// pixels). No-op when the drawing has no main raster yet (legacy / never-saved).
async function loadMainRasterFromUrl(url: string | null | undefined) {
	if (!url) {
		mainRasterLoaded = false;
		return;
	}
	try {
		const img = await new Promise<HTMLImageElement>((resolve, reject) => {
			const i = new Image();
			i.crossOrigin = 'anonymous';
			i.onload = () => resolve(i);
			i.onerror = err => reject(err);
			// Cache-busting query param off — the server already rotates the access key
			// on every save, so each URL is permanently cacheable.
			i.src = url;
		});
		ensureLayerCanvases();
		const c = getLayerCtx('main');
		c.save();
		c.setTransform(1, 0, 0, 1, 0, 0);
		c.globalCompositeOperation = 'copy';
		c.drawImage(img, 0, 0, CANVAS_W, CANVAS_H);
		c.restore();
		mainRasterLoaded = true;
	} catch (err) {
		console.error('failed to load main raster', err);
		mainRasterLoaded = false;
	}
}

// Apply server-buffered tile patches that have not yet been folded into the main
// raster on disk. Patches are applied in order so they reproduce the same composite
// stack as the authors' canvases.
async function applyLiveTilePatchesIfAny(patches: ChatDrawingTilePatch[] | undefined) {
	if (!patches || patches.length === 0) return;
	for (const p of patches) {
		await applyTilePatch(p);
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
	clearMainRasterPatches();
	mainRasterRedoHistory.clear();
	mainRasterLoaded = false;
	props.connection.send('drawClear', { drawingId: props.drawingId });
}

// Static list of layers, ordered top → bottom of the panel. Each option drives
// one row in the layer-list UI; the active row is highlighted so it's obvious
// which layer the next stroke targets — no more "only the non-default ones
// look active" confusion.
const layerOptions = [
	{ value: 'lineart' as const, label: '線画', icon: 'ti-pen' },
	{ value: 'main' as const, label: '塗り', icon: 'ti-paint' },
	{ value: 'draft' as const, label: '下描き', icon: 'ti-pencil' },
];

// Layer cycling is disabled while a main-only tool (fill / airbrush) is active.
// The watcher on `tool` keeps `currentLayer` pinned to 'main' in that case, so this
// flag is what the toolbar uses to gray out the cycle button and explain why.
const layerToggleDisabled = computed(() => MAIN_ONLY_TOOLS.has(tool.value));

// Raster-only tools (fill / airbrush) only make sense on the main raster layer; on
// draft/lineart they would land on main anyway (per `effectiveLayerForNewStroke`),
// so hide them entirely on those layers to avoid the UI implying they edit the
// active layer.
const rasterToolsVisible = computed(() => currentLayer.value === 'main');

// True when the currently-selected tool has its own adjustable parameters that
// should appear in the tool-specific zone of the toolbar. Used to hide the zone
// entirely when no params are relevant (pen / line / eraser / text / fill /
// spoit / hand).
const hasToolParams = computed(() => (
	tool.value === 'airbrush'
	|| tool.value === 'watercolor'
	|| tool.value === 'marker'
	|| tool.value === 'mixer'
	|| tool.value === 'dodge'
));

// Display name for the active tool, used as the section header above its
// adjustable parameters in the right panel.
const toolNameLabel = computed(() => {
	switch (tool.value) {
		case 'airbrush': return 'エアブラシ';
		case 'watercolor': return '水彩';
		case 'marker': return 'マーカー';
		case 'mixer': return '指先';
		case 'dodge': return '覆い焼き';
		default: return '';
	}
});

// If the user switches off main while a raster-only tool is selected, fall back to
// pen so the toolbar selection stays consistent with what's now visible.
watch(currentLayer, layer => {
	if (layer !== 'main' && MAIN_ONLY_TOOLS.has(tool.value)) {
		tool.value = 'pen';
	}
});

// Re-composite whenever the draft opacity slider moves so the user sees the change live.
watch(draftOpacity, () => recompositeDisplay());

function clampZoom(z: number): number {
	return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
}

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
// Step zoom from a UI button. Pivots on the container centre so the canvas centre
// stays fixed — gives pen-tablet / touch users a wheel-free way to zoom.
function zoomStep(factor: number) {
	const cont = canvasContainerEl.value;
	if (!cont) {
		zoom.value = clampZoom(zoom.value * factor);
		return;
	}
	const rect = cont.getBoundingClientRect();
	zoomAtCursor((rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2, factor);
}

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
	// While a lasso selection is still floating (transform-active, not yet
	// committed), undo first reverts the in-progress transform back to the
	// capture position (which also reverses any cut by restoring originals
	// when the transform reset takes the selection back to uncut state). A
	// second undo cancels the selection entirely. Doesn't consume an entry
	// from the regular undo stack.
	if (lassoSelection.value) {
		const sel = lassoSelection.value;
		const isMoved = sel.tx !== 0 || sel.ty !== 0 || sel.rotation !== 0 || sel.scale !== 1;
		if (isMoved) {
			// Push a redo entry capturing the current transform so a follow-up
			// redo can replay it.
			lassoFloatingRedoStack.push({
				kind: 'transform-reset',
				tx: sel.tx, ty: sel.ty, rotation: sel.rotation, scale: sel.scale,
			});
			// Reset the transform AND undo the cut so the layers go back to
			// pre-lasso state. The polygon stays — second undo will drop it.
			if (sel.isCut) {
				const fragmentIds = new Set(sel.outsideFragments.map(f => f.id).filter((x): x is string => x != null));
				strokes.value = strokes.value.filter(s => !s.id || !fragmentIds.has(s.id));
				for (const orig of sel.originalStrokes) strokes.value.push(orig);
				if (sel.mainSnapshot) {
					getLayerCtx('main').putImageData(sel.mainSnapshot, sel.bboxX, sel.bboxY);
				}
				sel.isCut = false;
				sel.rasterCanvas = null;
				sel.vectorStrokes = [];
				sel.removedOriginalIds = [];
				sel.outsideFragments = [];
				sel.mainSnapshot = null;
				sel.originalStrokes = [];
				rebuildVectorLayersFromStrokes();
				snapshotBaselineFromLive();
			}
			sel.tx = 0;
			sel.ty = 0;
			sel.rotation = 0;
			sel.scale = 1;
			recompositeDisplay();
			return;
		}
		// Push a redo entry that knows how to recreate this polygon, then drop
		// the floating state. Subsequent redo will resurrect it (uncut).
		lassoFloatingRedoStack.push({
			kind: 'cancel',
			polygon: sel.polygon,
			bboxX: sel.bboxX, bboxY: sel.bboxY,
			bboxW: sel.bboxW, bboxH: sel.bboxH,
		});
		cancelLassoSelection();
		return;
	}

	const id = myUndoStack.value.pop();
	if (!id) return;

	// Lasso compound undo: reverses the entire lasso operation atomically —
	// remove the strokes the commit added, re-insert the originals, and blit
	// the pre-operation main pixels back. Peers are kept in sync with the
	// matching drawUndo / drawStroke / drawTilePatch broadcasts.
	const lassoEntry = lassoUndoEntries.get(id);
	if (lassoEntry) {
		const addedIds = new Set(lassoEntry.addedStrokes.map(s => s.id).filter((x): x is string => x != null));
		strokes.value = strokes.value.filter(s => !s.id || !addedIds.has(s.id));
		for (const orig of lassoEntry.removedStrokes) strokes.value.push(orig);
		// Broadcast inverse: drop the added strokes, re-add the originals.
		for (const aid of addedIds) {
			props.connection.send('drawUndo', { drawingId: props.drawingId, strokeId: aid });
		}
		for (const orig of lassoEntry.removedStrokes) {
			props.connection.send('drawStroke', { drawingId: props.drawingId, stroke: orig });
		}
		// Restore main raster from the pre-operation snapshot, then peers get
		// a tile patch of the same region so they converge.
		if (lassoEntry.mainBeforeUnion) {
			const c = getLayerCtx('main');
			c.putImageData(lassoEntry.mainBeforeUnion, lassoEntry.unionX, lassoEntry.unionY);
			void imageDataToBase64Png(lassoEntry.mainBeforeUnion).then(dataBase64 => {
				if (!dataBase64) return;
				const patch: ChatDrawingTilePatch = {
					x: lassoEntry.unionX,
					y: lassoEntry.unionY,
					width: lassoEntry.unionW,
					height: lassoEntry.unionH,
					dataBase64,
					composite: 'source-over',
				};
				props.connection.send('drawTilePatch', { drawingId: props.drawingId, patch });
			});
		}
		// Push a synthetic placeholder onto redoStack so redo() can retrieve
		// the same entry (the entry stays in lassoUndoEntries until eviction
		// via MAX_UNDO_HISTORY).
		myRedoStack.value.push({ id, points: [], color: '#000000', width: 0, tool: 'pen', layer: 'main' });
		rebuildVectorLayersFromStrokes();
		snapshotBaselineFromLive();
		recompositeDisplay();
		return;
	}

	// Main-raster path: id is keyed in mainRasterPatchHistory rather than strokes[].
	// Paint `before` back, broadcast a tile patch carrying the same pixels so peers
	// converge on the rolled-back state, and stash the entry into the redo history.
	const rasterPatch = mainRasterPatchHistory.get(id);
	if (rasterPatch) {
		const c = getLayerCtx('main');
		c.putImageData(rasterPatch.before, rasterPatch.x, rasterPatch.y);
		recompositeDisplay();
		// Send a `source-over` patch of `before` so peers also roll back. We can't use
		// the original composite because for `destination-out`/`source-atop` the inverse
		// requires the full rect with source-over.
		void imageDataToBase64Png(rasterPatch.before).then(dataBase64 => {
			if (!dataBase64) return;
			const undoPatch: ChatDrawingTilePatch = {
				x: rasterPatch.x,
				y: rasterPatch.y,
				width: rasterPatch.before.width,
				height: rasterPatch.before.height,
				dataBase64,
				composite: 'source-over',
			};
			props.connection.send('drawTilePatch', { drawingId: props.drawingId, patch: undoPatch } as never);
		});
		mainRasterPatchHistory.delete(id);
		// Push a synthetic redo marker; we re-key it under the same id when redo runs.
		myRedoStack.value.push({
			id,
			points: [],
			color: '#000000',
			width: 0,
			tool: 'pen',
			layer: 'main',
		});
		// Stash the redo info so redo can restore `after` without round-tripping through render.
		mainRasterRedoHistory.set(id, rasterPatch);
		return;
	}
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

// Mirror of mainRasterPatchHistory used during redo to restore the `after` state.
const mainRasterRedoHistory = new Map<string, MainRasterPatch>();

// True once a main raster was loaded from a `mainImageUrl`. While this is true,
// redrawAll() and the renderer skip any main-layer strokes still in `strokes[]` —
// they've been baked into mainCanvas and replaying them would double them up.
let mainRasterLoaded = false;

function redo() {
	// Floating-lasso redo takes precedence over the regular redo stack — it
	// reverses the most recent undo step that targeted the active selection.
	if (lassoFloatingRedoStack.length > 0) {
		const entry = lassoFloatingRedoStack.pop();
		if (!entry) return;
		if (entry.kind === 'cancel') {
			// Resurrect the polygon (uncut). Drops anything currently floating.
			lassoSelection.value = {
				polygon: entry.polygon,
				bboxX: entry.bboxX, bboxY: entry.bboxY,
				bboxW: entry.bboxW, bboxH: entry.bboxH,
				rasterCanvas: null,
				vectorStrokes: [],
				removedOriginalIds: [],
				outsideFragments: [],
				mainSnapshot: null,
				originalStrokes: [],
				tx: 0, ty: 0,
				rotation: 0,
				scale: 1,
				isCut: false,
			};
			recompositeDisplay();
			return;
		}
		// 'transform-reset' — re-perform the cut and re-apply the saved transform.
		const sel = lassoSelection.value;
		if (!sel) return;
		if (!sel.isCut) {
			performLassoCut(sel);
			rebuildVectorLayersFromStrokes();
			snapshotBaselineFromLive();
		}
		sel.tx = entry.tx;
		sel.ty = entry.ty;
		sel.rotation = entry.rotation;
		sel.scale = entry.scale;
		recompositeDisplay();
		return;
	}

	const stroke = myRedoStack.value.pop();
	if (!stroke || !stroke.id) return;

	// Lasso compound redo: the stroke is a synthetic placeholder; the real
	// data is keyed by id in lassoUndoEntries (kept since undo). Re-apply
	// the operation forward and re-push the id back onto the undo stack.
	if (stroke.id.startsWith('lasso:')) {
		const lassoEntry = lassoUndoEntries.get(stroke.id);
		if (!lassoEntry) return;
		// Drop the originals we'd just put back during undo, re-add the
		// transformed/outside strokes that the commit had introduced.
		const removedIds = new Set(lassoEntry.removedStrokes.map(s => s.id).filter((x): x is string => x != null));
		strokes.value = strokes.value.filter(s => !s.id || !removedIds.has(s.id));
		for (const added of lassoEntry.addedStrokes) strokes.value.push(added);
		for (const rid of removedIds) {
			props.connection.send('drawUndo', { drawingId: props.drawingId, strokeId: rid });
		}
		for (const added of lassoEntry.addedStrokes) {
			props.connection.send('drawStroke', { drawingId: props.drawingId, stroke: added });
		}
		// Restore main raster from the post-operation snapshot.
		if (lassoEntry.mainAfterUnion) {
			const c = getLayerCtx('main');
			c.putImageData(lassoEntry.mainAfterUnion, lassoEntry.unionX, lassoEntry.unionY);
			void imageDataToBase64Png(lassoEntry.mainAfterUnion).then(dataBase64 => {
				if (!dataBase64) return;
				const patch: ChatDrawingTilePatch = {
					x: lassoEntry.unionX,
					y: lassoEntry.unionY,
					width: lassoEntry.unionW,
					height: lassoEntry.unionH,
					dataBase64,
					composite: 'source-over',
				};
				props.connection.send('drawTilePatch', { drawingId: props.drawingId, patch });
			});
		}
		myUndoStack.value.push(stroke.id);
		rebuildVectorLayersFromStrokes();
		snapshotBaselineFromLive();
		recompositeDisplay();
		return;
	}

	// Main-raster redo: the stroke object is a synthetic placeholder; the real data is
	// keyed in mainRasterRedoHistory. Paint `after` back, restore patch into the live
	// history, and broadcast.
	const cachedRasterRedo = stroke.layer === 'main' ? mainRasterRedoHistory.get(stroke.id) : undefined;
	if (cachedRasterRedo) {
		const r = cachedRasterRedo;
		const c = getLayerCtx('main');
		c.putImageData(r.after, r.x, r.y);
		recompositeDisplay();
		mainRasterPatchHistory.set(stroke.id, r);
		mainRasterRedoHistory.delete(stroke.id);
		myUndoStack.value.push(stroke.id);
		void imageDataToBase64Png(r.after).then(dataBase64 => {
			if (!dataBase64) return;
			const patch: ChatDrawingTilePatch = {
				x: r.x,
				y: r.y,
				width: r.after.width,
				height: r.after.height,
				dataBase64,
				composite: 'source-over',
			};
			props.connection.send('drawTilePatch', { drawingId: props.drawingId, patch });
		});
		return;
	}
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
	// Lasso shortcuts take precedence when a selection is active. Skip them if
	// focus is in a text field so users typing into the textbox tool don't trip
	// Esc/Enter/Delete unintentionally.
	if (lassoSelection.value || lassoDrawingPolygon.value) {
		const target = ev.target as HTMLElement | null;
		const inTextField = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
		if (!inTextField) {
			if (ev.key === 'Escape') {
				ev.preventDefault();
				if (lassoDrawingPolygon.value) {
					lassoDrawingPolygon.value = null;
					recompositeDisplay();
				} else {
					// Esc is an explicit "discard" — drop the floating-redo
					// history too so a stray Ctrl+Y can't resurrect this state.
					clearLassoFloatingRedo();
					cancelLassoSelection();
				}
				return;
			}
			if (ev.key === 'Enter' && lassoSelection.value) {
				ev.preventDefault();
				commitLassoSelection();
				return;
			}
			if ((ev.key === 'Delete' || ev.key === 'Backspace') && lassoSelection.value) {
				ev.preventDefault();
				deleteLassoSelection();
				return;
			}
		}
	}

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

// Encode a canvas to a base64 PNG using a low-allocation chunked btoa.
async function canvasToBase64Png(c: HTMLCanvasElement): Promise<string | null> {
	return await new Promise<string | null>(resolve => {
		c.toBlob(async b => {
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

// Render the published composite (white bg + main + lineart, no draft) to a fresh
// offscreen canvas and return it as a base64-encoded PNG. Used on save to hand the
// bit-exact image to the server so it can skip the heavy stroke replay.
async function bakeCompositePngBase64(): Promise<string | null> {
	ensureLayerCanvases();
	const out = globalThis.document.createElement('canvas');
	out.width = CANVAS_W;
	out.height = CANVAS_H;
	const octx = out.getContext('2d');
	if (!octx) return null;
	octx.fillStyle = '#ffffff';
	octx.fillRect(0, 0, CANVAS_W, CANVAS_H);
	octx.drawImage(mainCanvas, 0, 0);
	octx.drawImage(lineartCanvas, 0, 0);
	return await canvasToBase64Png(out);
}

// Encode the main (raster) layer alone — transparent background — for the dedicated
// `mainImageBase64` channel of the update API. The server keeps this as the canonical
// state of the main layer between sessions.
async function bakeMainRasterPngBase64(): Promise<string | null> {
	ensureLayerCanvases();
	return await canvasToBase64Png(mainCanvas);
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
		const [imageBase64, mainImageBase64] = await Promise.all([
			bakeCompositePngBase64(),
			bakeMainRasterPngBase64(),
		]);
		// Drop any main strokes from the persisted set — main lives in the raster now.
		// Legacy drawings that loaded with main strokes get migrated here automatically.
		const persistedStrokes = strokes.value.filter((s: ChatDrawingStroke) => s.layer === 'draft' || s.layer === 'lineart');
		await apiChatDrawingUpdate({
			drawingId: props.drawingId,
			strokes: persistedStrokes,
			...(imageBase64 ? { imageBase64 } : {}),
			...(mainImageBase64 ? { mainImageBase64 } : {}),
		});
		closeWindow();
	} catch (err) {
		console.error(err);
		os.alert({ type: 'error', text: i18n.ts.somethingHappened });
	} finally {
		saving.value = false;
	}
}

function closeWindow() {
	windowEl.value?.close();
}

// iPad Safari のダブルタップ既定動作（スマートズーム / 由来のスクロール）抑止用。
// 連続する 2 回目の touchend（≦ 350ms 以内）に対し preventDefault する。
let lastTouchEndAt = 0;

function onRootTouchEnd(ev: TouchEvent) {
	const t = performance.now();
	if (t - lastTouchEndAt < 350) {
		ev.preventDefault();
	}
	lastTouchEndAt = t;
}

onMounted(async () => {
	clearCanvas();
	// Paint the colour wheel once on mount. The HSV watcher only fires on value
	// changes, so without an initial draw the wheel canvas would render blank
	// until the user moves a slider or clicks the picker.
	void nextTick(() => requestAnimationFrame(drawWheel));
	// Observe the canvas scroll container so display size tracks window resizes.
	if (canvasContainerEl.value) {
		resizeObserver = new ResizeObserver(entries => {
			for (const entry of entries) {
				containerSize.value = { w: entry.contentRect.width, h: entry.contentRect.height };
			}
		});
		resizeObserver.observe(canvasContainerEl.value);
	}
	props.connection.on('drawStroke', onRemoteStroke);
	props.connection.on('drawTilePatch', onRemoteTilePatch);
	props.connection.on('drawClear', onRemoteClear);
	props.connection.on('drawingUpdated', onRemoteDrawingUpdated);
	props.connection.on('drawingPresence', onRemotePresence);
	props.connection.on('drawUndo', onRemoteUndo);
	props.connection.on('drawingCursor', onRemoteCursor);
	window.addEventListener('keydown', onKeyDown);

	// iPad Safari でダブルタップが「スマートズーム / スクロール」として解釈され、
	// MkWindow 配下の表示位置がずれて画面下部に黒い隙間が出る問題への対策。
	// CSS の `touch-action: manipulation` だけでは抑止しきれないケースがあるため、
	// touchend の 2 回目（≦ 350ms 以内）について preventDefault してブラウザの
	// 既定アクション（ズーム／フォーカス由来のスクロール）を打ち切る。
	// 描画は pointer events 経由なので preventDefault しても影響しない。
	if (rootEl.value) {
		rootEl.value.addEventListener('touchend', onRootTouchEnd, { passive: false });
	}

	try {
		const fresh = await apiChatDrawingShow(props.drawingId);
		title.value = fresh.title;
		strokes.value = fresh.strokes;
		resetBaseline();
		// Paint the main raster first so cross-layer fill replay (lineart sampling main)
		// sees the right pixels. Then replay non-main vector strokes via redrawAll, which
		// is now a no-op for main-layer entries when a raster is already loaded.
		await loadMainRasterFromUrl(fresh.mainImageUrl);
		await redrawAll();
		await applyLiveTilePatchesIfAny(fresh.liveTilePatches);
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
	presenceInterval = globalThis.setInterval(sendPresence, PRESENCE_HEARTBEAT_MS);
	// tick for expiring stale participants in the UI
	tickInterval = globalThis.setInterval(() => { now.value = Date.now(); }, 3000);
});

onBeforeUnmount(() => {
	props.connection.off('drawStroke', onRemoteStroke);
	props.connection.off('drawTilePatch', onRemoteTilePatch);
	props.connection.off('drawClear', onRemoteClear);
	props.connection.off('drawingUpdated', onRemoteDrawingUpdated);
	props.connection.off('drawingPresence', onRemotePresence);
	props.connection.off('drawUndo', onRemoteUndo);
	props.connection.off('drawingCursor', onRemoteCursor);
	window.removeEventListener('keydown', onKeyDown);
	if (rootEl.value) {
		rootEl.value.removeEventListener('touchend', onRootTouchEnd);
	}
	if (presenceInterval) globalThis.clearInterval(presenceInterval);
	if (tickInterval) globalThis.clearInterval(tickInterval);
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
	// iPad Safari のダブルタップズーム / 300ms タップディレイを抑止。canvas は
	// `touch-action: none` のまま、param panel など子要素のスクロールは維持される。
	touch-action: manipulation;
}

.root input[type="text"],
.root input[type="number"] {
	user-select: text;
	-webkit-user-select: text;
}

// Main workspace row: left tool strip / canvas / right param panel laid out
// horizontally and stretching to fill all vertical space between the window
// header and the bottom bar / footer.
.workspace {
	flex: 1 1 0;
	min-height: 0;
	display: flex;
	flex-direction: row;
	align-items: stretch;
}

// Left vertical tool strip — fixed-width column of tool buttons.
.toolStrip {
	flex: 0 0 auto;
	width: 48px;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 4px;
	padding: 8px 6px;
	background: var(--MI_THEME-panel);
	border-right: solid 1px var(--MI_THEME-divider);
	overflow-y: auto;
}

// Horizontal hairline divider used to subgroup tool-strip buttons (pigment /
// modifier / helper). Mirrors the row-layout `subseparator` but laid sideways.
.toolStripDivider {
	width: 28px;
	height: 1px;
	background: var(--MI_THEME-divider);
	opacity: 0.4;
	margin: 4px 0;
}

// Right parameter panel — stacked sections (color, brush, tool-specific, layer).
// Scrolls vertically when the window is short.
.paramPanel {
	flex: 0 0 auto;
	width: 220px;
	display: flex;
	flex-direction: column;
	gap: 3px;
	padding: 5px;
	background: var(--MI_THEME-panel);
	border-left: solid 1px var(--MI_THEME-divider);
	overflow-y: auto;
}

// One labelled section in the param panel.
.panelSection {
	display: flex;
	flex-direction: column;
	gap: 3px;
	padding: 4px 6px 5px;
	border-radius: 6px;
	background: color-mix(in srgb, var(--MI_THEME-bg) 35%, transparent);
}

.panelTitle {
	font-size: 0.72em;
	font-weight: 600;
	text-transform: none;
	color: var(--MI_THEME-fgTransparentWeak);
	margin: 0;
	padding: 0;
	letter-spacing: 0.04em;
	line-height: 1.3;
}

// Inline horizontal row inside a section (e.g., color swatch + button row).
.panelRow {
	display: flex;
	flex-direction: row;
	align-items: center;
	gap: 4px;
	flex-wrap: wrap;
}

// Compact inline slider field used inside the right panel: label / slider /
// value share a single row so the section stays as short as possible.
.sliderFieldStacked {
	flex-direction: row;
	align-items: center;
	padding: 2px 4px;
	gap: 5px;
	font-size: 0.78em;

	.toolLabel {
		flex: 0 0 auto;
		min-width: 66px;
		font-size: 0.95em;
		white-space: nowrap;
	}

	.widthSlider {
		flex: 1 1 auto;
		min-width: 0;
		width: auto;
	}

	.widthValue {
		flex: 0 0 auto;
		min-width: 22px;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
}

// Full-width toggle button used inside panel sections (筆圧検知, コア線).
.panelToggle {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 3px 8px;
	border-radius: 5px;
	font-size: 0.78em;
	background: color-mix(in srgb, var(--MI_THEME-bg) 55%, transparent);

	&:hover:not(:disabled) {
		background: var(--MI_THEME-accentedBg);
	}
}

// Layer list — vertical list of all 3 layers, with the active row clearly
// highlighted (filled background + leading accent bar + trailing checkmark)
// so it's never ambiguous which layer the next stroke targets.
.layerList {
	display: flex;
	flex-direction: column;
	gap: 2px;
	border-radius: 6px;
	overflow: hidden;
}

.layerRow {
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 4px 8px 4px 5px;
	border-radius: 5px;
	background: color-mix(in srgb, var(--MI_THEME-bg) 60%, transparent);
	color: var(--MI_THEME-fg);
	text-align: left;
	font-size: 0.82em;

	&:hover:not(:disabled) {
		background: var(--MI_THEME-accentedBg);
	}

	&:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
}

.layerRowActive {
	background: color-mix(in srgb, var(--MI_THEME-accent) 22%, var(--MI_THEME-bg));
	color: var(--MI_THEME-fg);
	font-weight: 600;

	&:hover:not(:disabled) {
		background: color-mix(in srgb, var(--MI_THEME-accent) 30%, var(--MI_THEME-bg));
	}
}

// Leading accent bar on the active row — a 3px vertical strip that's much
// more visible than just a background tint, so the active layer reads at a
// glance regardless of which layer is selected.
.layerRowMarker {
	flex: 0 0 3px;
	align-self: stretch;
	border-radius: 2px;
	background: transparent;

	.layerRowActive & {
		background: var(--MI_THEME-accent);
	}
}

.layerRowIcon {
	font-size: 1.05em;
	color: var(--MI_THEME-fgTransparentWeak);

	.layerRowActive & {
		color: var(--MI_THEME-accent);
	}
}

.layerRowLabel {
	flex: 1 1 auto;
}

.layerRowCheck {
	flex: 0 0 auto;
	font-size: 0.95em;
	color: var(--MI_THEME-accent);
}

// Slim bottom bar — sits below the workspace, above the footer. Holds the
// status-bar-style controls: history, view, and the destructive clear button.
.bottomBar {
	flex: 0 0 auto;
	display: flex;
	flex-direction: row;
	align-items: center;
	gap: 8px;
	padding: 4px 10px;
	background: color-mix(in srgb, var(--MI_THEME-panel) 92%, transparent);
	border-top: solid 1px var(--MI_THEME-divider);
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

// Lighter divider used to subgroup buttons inside the same toolGroup (e.g. to
// visually separate drawing brushes from helper tools without breaking the row).
.subseparator {
	width: 1px;
	height: 14px;
	background: var(--MI_THEME-divider);
	opacity: 0.3;
	margin: 0 2px;
}

// Reserve layout space without rendering pixels — used for raster-only tools
// when the active layer isn't main, so the auxiliary subgroup behind them stays
// in a fixed position instead of shifting left when raster tools disappear.
.invisible {
	visibility: hidden;
	pointer-events: none;
}

// Extra-wide gap before destructive controls (clear-all). Wider than the regular
// .spacer so the trash button doesn't sit directly next to other clickable
// controls — physical distance is the cheapest mis-click prevention.
.dangerSpacer {
	flex: 0 0 32px;
}

// Destructive action button — red tint to signal "this wipes everything".
// Hover lights it up further so the user has a clear visual moment to commit.
.dangerButton {
	color: var(--MI_THEME-error, #e64545);

	&:hover:not(:disabled) {
		background: color-mix(in srgb, var(--MI_THEME-error, #e64545) 18%, transparent);
		color: var(--MI_THEME-error, #e64545);
	}
}

// Wrapper for the contextual "settings of the currently-selected tool" zone in
// row 2. Tinted so it reads as a distinct sub-area (= these controls change
// when you switch tool, unlike the common brush params next to it).
.toolParams {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding: 2px 6px;
	border-radius: 6px;
	background: color-mix(in srgb, var(--MI_THEME-accentedBg) 80%, transparent);
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
	flex: 0 0 auto;
	width: 24px;
	height: 22px;
	border: 1px solid var(--MI_THEME-divider);
	border-radius: 4px;
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
	gap: 2px;
	align-items: center;
	max-width: 100%;
	overflow: hidden;
	flex-wrap: wrap;
}

.recentColorChip {
	width: 14px;
	height: 14px;
	border-radius: 3px;
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
	width: 150px;
	height: 150px;
	touch-action: none;
	align-self: center;
	user-select: none;
	-webkit-user-select: none;
	-webkit-touch-callout: none;
}

.wheelSliderRow {
	display: flex;
	align-items: center;
	gap: 4px;
}

.wheelSlider {
	flex: 1;
}

.hexInput {
	flex: 1;
	min-width: 0;
	padding: 2px 5px;
	border: 1px solid var(--MI_THEME-divider);
	border-radius: 4px;
	background: var(--MI_THEME-bg);
	color: var(--MI_THEME-fg);
	font-family: ui-monospace, monospace;
	font-size: 0.78em;
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
	// Stretches to fill all space between the left tool strip and the right
	// param panel. min-width: 0 keeps flex from inflating to fit content when
	// the canvas is wider than the available width.
	flex: 1 1 0;
	min-width: 0;
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

.rotateHandle {
	position: absolute;
	top: 14px;
	left: 50%;
	transform: translateX(-50%);
	width: 48px;
	height: 48px;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	border-radius: 50%;
	background: rgba(255, 255, 255, 0.85);
	border: 2px solid var(--MI_THEME-accent);
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
	cursor: grab;
	touch-action: none;
	z-index: 22;
	user-select: none;
	-webkit-user-select: none;

	&:active {
		cursor: grabbing;
	}
}

.rotateHandleDial {
	width: 100%;
	height: 100%;
	display: flex;
	align-items: center;
	justify-content: center;
	pointer-events: none;
}

.rotateHandleArrow {
	color: var(--MI_THEME-accent);
	font-size: 20px;
	line-height: 1;
}

.rotateHandleLabel {
	position: absolute;
	bottom: -18px;
	font-size: 0.7em;
	font-variant-numeric: tabular-nums;
	color: var(--MI_THEME-fg);
	background: rgba(255, 255, 255, 0.85);
	padding: 1px 6px;
	border-radius: 8px;
	pointer-events: none;
	white-space: nowrap;
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
