/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import ms from 'ms';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { GetterService } from '@/server/api/GetterService.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { ChatService } from '@/core/ChatService.js';
import { ChatDrawingService } from '@/core/ChatDrawingService.js';
import type { DriveFilesRepository, MiUser } from '@/models/_.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	prohibitMoved: true,

	kind: 'write:chat',

	limit: {
		duration: ms('1hour'),
		max: 500,
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'ChatMessageLiteFor1on1',
	},

	errors: {
		recipientIsYourself: {
			message: 'You can not send a message to yourself.',
			code: 'RECIPIENT_IS_YOURSELF',
			id: '17e2ba79-e22a-4cbc-bf91-d327643f4a7e',
		},

		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: '11795c64-40ea-4198-b06e-3c873ed9039d',
		},

		noSuchFile: {
			message: 'No such file.',
			code: 'NO_SUCH_FILE',
			id: '4372b8e2-185d-4146-8749-2f68864a3e5f',
		},

		contentRequired: {
			message: 'Content required. You need to set text or fileId.',
			code: 'CONTENT_REQUIRED',
			id: '25587321-b0e6-449c-9239-f8925092942c',
		},

		youHaveBeenBlocked: {
			message: 'You cannot send a message because you have been blocked by this user.',
			code: 'YOU_HAVE_BEEN_BLOCKED',
			id: 'c15a5199-7422-4968-941a-2a462c478f7d',
		},

		noSuchDrawing: {
			message: 'No such drawing.',
			code: 'NO_SUCH_DRAWING',
			id: 'fb25d21b-07e4-4b1e-9e1a-7c0e80f0f0f2',
		},

		drawingScopeMismatch: {
			message: 'The drawing does not belong to this conversation.',
			code: 'DRAWING_SCOPE_MISMATCH',
			id: 'e9fce120-4d4a-4ed0-9e15-4b0a6b38b0e2',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		text: { type: 'string', nullable: true, maxLength: 2000 },
		fileId: { type: 'string', format: 'misskey:id' },
		drawingId: { type: 'string', format: 'misskey:id' },
		toUserId: { type: 'string', format: 'misskey:id' },
	},
	required: ['toUserId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		private getterService: GetterService,
		private chatService: ChatService,
		private chatDrawingService: ChatDrawingService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.chatService.checkChatAvailability(me.id, 'write');

			let file = null;
			if (ps.fileId != null) {
				file = await this.driveFilesRepository.findOneBy({
					id: ps.fileId,
					userId: me.id,
				});

				if (file == null) {
					throw new ApiError(meta.errors.noSuchFile);
				}
			}

			// Myself
			if (ps.toUserId === me.id) {
				throw new ApiError(meta.errors.recipientIsYourself);
			}

			let drawingId: string | null = null;
			if (ps.drawingId != null) {
				const drawing = await this.chatDrawingService.findById(ps.drawingId);
				if (drawing == null) throw new ApiError(meta.errors.noSuchDrawing);
				if (drawing.roomId != null) throw new ApiError(meta.errors.drawingScopeMismatch);
				const pair = [drawing.user1Id, drawing.user2Id];
				if (!pair.includes(me.id) || !pair.includes(ps.toUserId)) {
					throw new ApiError(meta.errors.drawingScopeMismatch);
				}
				drawingId = drawing.id;
			}

			if (ps.text == null && file == null && drawingId == null) {
				throw new ApiError(meta.errors.contentRequired);
			}

			const toUser = await this.getterService.getUser(ps.toUserId).catch(err => {
				if (err.id === '15348ddd-432d-49c2-8a5a-8069753becff') throw new ApiError(meta.errors.noSuchUser);
				throw err;
			});

			return await this.chatService.createMessageToUser(me, toUser, {
				text: ps.text,
				file: file,
				drawingId,
			});
		});
	}
}
