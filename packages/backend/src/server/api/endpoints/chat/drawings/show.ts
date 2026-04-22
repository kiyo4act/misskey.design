/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { ChatService } from '@/core/ChatService.js';
import { ChatDrawingService } from '@/core/ChatDrawingService.js';
import { ChatEntityService } from '@/core/entities/ChatEntityService.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	kind: 'read:chat',

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'ChatDrawing',
	},

	errors: {
		noSuchDrawing: {
			message: 'No such drawing.',
			code: 'NO_SUCH_DRAWING',
			id: 'd2f8c927-f95c-4af5-bef3-8c33af7a0f0c',
		},
		accessDenied: {
			message: 'Access denied.',
			code: 'ACCESS_DENIED',
			id: '8a9f81c6-3c4e-4a16-9d8d-2bc76497e8a8',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		drawingId: { type: 'string', format: 'misskey:id' },
	},
	required: ['drawingId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private chatService: ChatService,
		private chatDrawingService: ChatDrawingService,
		private chatEntityService: ChatEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'read');

			const drawing = await this.chatDrawingService.findById(ps.drawingId);
			if (drawing == null) throw new ApiError(meta.errors.noSuchDrawing);

			if (!(await this.chatDrawingService.hasEditPermission(me.id, drawing))) {
				throw new ApiError(meta.errors.accessDenied);
			}

			return this.chatEntityService.packDrawing(drawing, me);
		});
	}
}
