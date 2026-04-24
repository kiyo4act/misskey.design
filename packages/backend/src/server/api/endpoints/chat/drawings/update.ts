/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import ms from 'ms';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { ChatService } from '@/core/ChatService.js';
import { ChatDrawingService } from '@/core/ChatDrawingService.js';
import { ChatEntityService } from '@/core/entities/ChatEntityService.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	prohibitMoved: true,

	kind: 'write:chat',

	limit: {
		duration: ms('1hour'),
		max: 300,
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'ChatDrawing',
	},

	errors: {
		noSuchDrawing: {
			message: 'No such drawing.',
			code: 'NO_SUCH_DRAWING',
			id: 'c6cbbb61-02fd-4b26-97c9-9b0f4e81e77f',
		},
		accessDenied: {
			message: 'Access denied.',
			code: 'ACCESS_DENIED',
			id: '3baca464-6d4e-470a-bd57-f6a39f1dde50',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		drawingId: { type: 'string', format: 'misskey:id' },
		strokes: {
			type: 'array',
			items: { type: 'object' },
		},
		// Optional client-baked composite PNG (base64). When present, the server stores
		// it directly instead of re-running the full stroke replay — the usual hot path
		// for saves on drawings with many fills.
		imageBase64: { type: 'string', nullable: true },
	},
	required: ['drawingId', 'strokes'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private chatService: ChatService,
		private chatDrawingService: ChatDrawingService,
		private chatEntityService: ChatEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'write');

			const drawing = await this.chatDrawingService.findById(ps.drawingId);
			if (drawing == null) throw new ApiError(meta.errors.noSuchDrawing);

			if (!(await this.chatDrawingService.hasEditPermission(me.id, drawing))) {
				throw new ApiError(meta.errors.accessDenied);
			}

			let imagePng: Buffer | null = null;
			if (typeof ps.imageBase64 === 'string' && ps.imageBase64.length > 0) {
				try {
					const decoded = Buffer.from(ps.imageBase64, 'base64');
					// Sanity-check PNG magic (89 50 4E 47 0D 0A 1A 0A) and cap size at 12MB.
					if (decoded.length > 8 && decoded.length <= 12 * 1024 * 1024
						&& decoded[0] === 0x89 && decoded[1] === 0x50 && decoded[2] === 0x4E && decoded[3] === 0x47) {
						imagePng = decoded;
					}
				} catch { /* fall back to server render */ }
			}
			const updated = await this.chatDrawingService.updateDrawing(me, drawing, ps.strokes, imagePng);
			return this.chatEntityService.packDrawing(updated, me);
		});
	}
}
