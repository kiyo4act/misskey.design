/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';
import { misskeyApi } from '@/utility/misskey-api.js';

export type ChatDrawingStroke = {
	id?: string;
	points: number[][];
	color: string;
	width: number;
	tool: 'pen' | 'eraser' | 'fill' | 'paint' | 'watercolor' | 'text';
	layer?: 'main' | 'draft' | 'lineart';
	clip?: boolean;
	text?: string;
};

export type ChatDrawingLite = Misskey.entities.ChatDrawingLite;
export type ChatDrawing = Omit<Misskey.entities.ChatDrawing, 'strokes'> & {
	strokes: ChatDrawingStroke[];
};

export function apiChatDrawingCreate(params: {
	roomId?: string | null;
	otherUserId?: string | null;
	title: string;
	strokes?: ChatDrawingStroke[];
}): Promise<ChatDrawing> {
	// autogen types strokes as Record<string, never>[]; cast because we validate server-side.
	return misskeyApi('chat/drawings/create', params as never) as Promise<ChatDrawing>;
}

// Rounds floating-point coords/pressure so JSON serialisation stays compact.
// 4 decimals on a normalised 0..1 coordinate gives ~0.25px precision on a 1024×768 canvas,
// well below the visible threshold, and shrinks the payload by ~60% versus full-precision doubles.
function compactStrokes(strokes: ChatDrawingStroke[]): ChatDrawingStroke[] {
	return strokes.map(s => ({
		...s,
		points: s.points.map(p => {
			const x = Math.round(p[0] * 10000) / 10000;
			const y = Math.round(p[1] * 10000) / 10000;
			if (p.length >= 3) {
				const pr = Math.round(p[2] * 100) / 100;
				return [x, y, pr];
			}
			return [x, y];
		}),
		width: Math.round(s.width * 100000) / 100000,
	}));
}

export function apiChatDrawingUpdate(params: {
	drawingId: string;
	strokes: ChatDrawingStroke[];
	imageBase64?: string;
}): Promise<ChatDrawing> {
	const body: Record<string, unknown> = {
		drawingId: params.drawingId,
		strokes: compactStrokes(params.strokes),
	};
	if (params.imageBase64) body.imageBase64 = params.imageBase64;
	return misskeyApi('chat/drawings/update', body as never) as Promise<ChatDrawing>;
}

export function apiChatDrawingShow(drawingId: string): Promise<ChatDrawing> {
	return misskeyApi('chat/drawings/show', { drawingId }) as Promise<ChatDrawing>;
}

export function apiSendMessageToRoomWithDrawing(params: {
	toRoomId: string;
	text?: string | null;
	drawingId: string;
}) {
	return misskeyApi('chat/messages/create-to-room', params);
}

export function apiSendMessageToUserWithDrawing(params: {
	toUserId: string;
	text?: string | null;
	drawingId: string;
}) {
	return misskeyApi('chat/messages/create-to-user', params);
}
