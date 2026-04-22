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

			const updated = await this.chatDrawingService.updateDrawing(me, drawing, ps.strokes);
			return this.chatEntityService.packDrawing(updated, me);
		});
	}
}
