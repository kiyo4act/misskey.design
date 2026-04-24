/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, Scope } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { GlobalEventService, type GlobalEvents } from '@/core/GlobalEventService.js';
import type { JsonObject } from '@/misc/json-value.js';
import { ChatService } from '@/core/ChatService.js';
import { ChatDrawingService } from '@/core/ChatDrawingService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import Channel, { type ChannelRequest } from '../channel.js';
import { REQUEST } from '@nestjs/core';
import type { ChatRoomsRepository } from '@/models/_.js';
import { sanitizeDrawStroke } from './chat-draw-utils.js';

@Injectable({ scope: Scope.TRANSIENT })
export class ChatRoomChannel extends Channel {
	public readonly chName = 'chatRoom';
	public static shouldShare = false;
	public static requireCredential = true as const;
	public static kind = 'read:chat';
	private roomId: string;

	constructor(
		@Inject(REQUEST)
		request: ChannelRequest,

		@Inject(DI.chatRoomsRepository)
		private chatRoomsRepository: ChatRoomsRepository,

		private chatService: ChatService,
		private globalEventService: GlobalEventService,
		private chatDrawingService: ChatDrawingService,
		private userEntityService: UserEntityService,
	) {
		super(request);
	}

	@bindThis
	public async init(params: JsonObject): Promise<boolean> {
		if (typeof params.roomId !== 'string') return false;
		if (!this.user) return false;

		this.roomId = params.roomId;

		const room = await this.chatRoomsRepository.findOneBy({
			id: this.roomId,
		});

		if (room == null) return false;
		if (!(await this.chatService.hasPermissionToViewRoomTimeline(this.user.id, room))) return false;

		this.subscriber.on(`chatRoomStream:${this.roomId}`, this.onEvent);

		return true;
	}

	@bindThis
	private async onEvent(data: GlobalEvents['chatRoom']['payload']) {
		this.send(data.type, data.body);
	}

	@bindThis
	public onMessage(type: string, body: any) {
		switch (type) {
			case 'read':
				if (this.roomId) {
					this.chatService.readRoomChatMessage(this.user!.id, this.roomId);
				}
				break;
			case 'drawStroke': {
				if (!this.roomId || !this.user) break;
				const drawingId = typeof body?.drawingId === 'string' ? body.drawingId : null;
				if (!drawingId) break;
				const stroke = sanitizeDrawStroke(body?.stroke);
				if (!stroke) break;
				this.chatDrawingService.appendLiveStroke(drawingId, stroke);
				this.globalEventService.publishChatRoomStream(this.roomId, 'drawStroke', {
					userId: this.user.id,
					drawingId,
					stroke,
				});
				break;
			}
			case 'drawClear': {
				if (!this.roomId || !this.user) break;
				const drawingId = typeof body?.drawingId === 'string' ? body.drawingId : null;
				if (!drawingId) break;
				this.chatDrawingService.clearLiveBufferForClear(drawingId);
				this.globalEventService.publishChatRoomStream(this.roomId, 'drawClear', {
					userId: this.user.id,
					drawingId,
				});
				break;
			}
			case 'drawingPresence': {
				if (!this.roomId || !this.user) break;
				const drawingId = typeof body?.drawingId === 'string' ? body.drawingId : null;
				if (!drawingId) break;
				const userId = this.user.id;
				this.userEntityService.pack(userId).then(user => {
					this.globalEventService.publishChatRoomStream(this.roomId, 'drawingPresence', {
						drawingId,
						userId,
						user,
					});
				}).catch(() => { /* ignore pack failure */ });
				break;
			}
			case 'drawUndo': {
				if (!this.roomId || !this.user) break;
				const drawingId = typeof body?.drawingId === 'string' ? body.drawingId : null;
				const strokeId = typeof body?.strokeId === 'string' ? body.strokeId : null;
				if (!drawingId || !strokeId) break;
				if (!/^[A-Za-z0-9_-]{1,32}$/.test(strokeId)) break;
				this.chatDrawingService.removeBufferedStrokeById(drawingId, strokeId);
				this.globalEventService.publishChatRoomStream(this.roomId, 'drawUndo', {
					userId: this.user.id,
					drawingId,
					strokeId,
				});
				break;
			}
			case 'drawingCursor': {
				if (!this.roomId || !this.user) break;
				const drawingId = typeof body?.drawingId === 'string' ? body.drawingId : null;
				if (!drawingId) break;
				const rawX = Number(body?.x);
				const rawY = Number(body?.y);
				if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) break;
				// Clamp to [-0.1, 1.1] — slight overshoot is allowed so the cursor can animate off the edge,
				// but we reject nonsense values to keep payloads tiny.
				const x = Math.max(-0.1, Math.min(1.1, rawX));
				const y = Math.max(-0.1, Math.min(1.1, rawY));
				this.globalEventService.publishChatRoomStream(this.roomId, 'drawingCursor', {
					drawingId,
					userId: this.user.id,
					x,
					y,
				});
				break;
			}
		}
	}

	@bindThis
	public dispose() {
		this.subscriber.off(`chatRoomStream:${this.roomId}`, this.onEvent);
	}
}
