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
import { GetterService } from '@/server/api/GetterService.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	prohibitMoved: true,

	kind: 'write:chat',

	limit: {
		duration: ms('1hour'),
		max: 60,
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'ChatDrawing',
	},

	errors: {
		noSuchRoom: {
			message: 'No such room.',
			code: 'NO_SUCH_ROOM',
			id: 'b68a97a8-bf04-4f7d-8c1d-cf0d94d1cb1f',
		},
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: '7d5e2cfd-b4b0-4cfd-a4a9-51a1d1f3a5e4',
		},
		scopeRequired: {
			message: 'Either roomId or otherUserId is required.',
			code: 'SCOPE_REQUIRED',
			id: '05c8ce77-d4d7-4b2e-95fd-c85f6f3ca4ab',
		},
		recipientIsYourself: {
			message: 'You cannot start a drawing with yourself.',
			code: 'RECIPIENT_IS_YOURSELF',
			id: '0cc7b6ab-d7ac-4e64-b88f-bed4e6aefa46',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		roomId: { type: 'string', format: 'misskey:id', nullable: true },
		otherUserId: { type: 'string', format: 'misskey:id', nullable: true },
		title: { type: 'string', minLength: 1, maxLength: 256 },
		strokes: {
			type: 'array',
			items: { type: 'object' },
			default: [],
		},
	},
	required: ['title'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private chatService: ChatService,
		private chatDrawingService: ChatDrawingService,
		private chatEntityService: ChatEntityService,
		private getterService: GetterService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'write');

			if (ps.roomId) {
				const room = await this.chatService.findRoomById(ps.roomId);
				if (room == null) throw new ApiError(meta.errors.noSuchRoom);
				if (!(await this.chatService.hasPermissionToViewRoomTimeline(me.id, room))) {
					throw new ApiError(meta.errors.noSuchRoom);
				}
				const drawing = await this.chatDrawingService.createForRoom(me, room, ps.title, ps.strokes);
				return this.chatEntityService.packDrawing(drawing, me);
			}

			if (ps.otherUserId) {
				if (ps.otherUserId === me.id) throw new ApiError(meta.errors.recipientIsYourself);
				const other = await this.getterService.getUser(ps.otherUserId).catch(err => {
					if (err.id === '15348ddd-432d-49c2-8a5a-8069753becff') throw new ApiError(meta.errors.noSuchUser);
					throw err;
				});
				const drawing = await this.chatDrawingService.createForDm(me, other, ps.title, ps.strokes);
				return this.chatEntityService.packDrawing(drawing, me);
			}

			throw new ApiError(meta.errors.scopeRequired);
		});
	}
}
