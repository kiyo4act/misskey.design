/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { bindThis } from '@/decorators.js';
import { GlobalEventService, type GlobalEvents } from '@/core/GlobalEventService.js';
import type { JsonObject } from '@/misc/json-value.js';
import { ChatService } from '@/core/ChatService.js';
import { ChatDrawingService } from '@/core/ChatDrawingService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import Channel, { type ChannelRequest } from '../channel.js';
import { sanitizeDrawStroke, sanitizeDrawTilePatch } from './chat-draw-utils.js';

@Injectable({ scope: Scope.TRANSIENT })
export class ChatUserChannel extends Channel {
	public readonly chName = 'chatUser';
	public static shouldShare = false;
	public static requireCredential = true as const;
	public static kind = 'read:chat';
	private otherId: string;

	constructor(
		@Inject(REQUEST)
		request: ChannelRequest,

		private chatService: ChatService,
		private globalEventService: GlobalEventService,
		private chatDrawingService: ChatDrawingService,
		private userEntityService: UserEntityService,
	) {
		super(request);
	}

	@bindThis
	public async init(params: JsonObject): Promise<boolean> {
		if (typeof params.otherId !== 'string') return false;
		if (!this.user) return false;
		if (params.otherId === this.user.id) return false;

		this.otherId = params.otherId;

		this.subscriber.on(`chatUserStream:${this.user.id}-${this.otherId}`, this.onEvent);

		return true;
	}

	@bindThis
	private async onEvent(data: GlobalEvents['chatUser']['payload']) {
		this.send(data.type, data.body);
	}

	@bindThis
	public onMessage(type: string, body: JsonObject) {
		switch (type) {
			case 'read':
				if (this.otherId && this.user) {
					this.chatService.readUserChatMessage(this.user.id, this.otherId);
				}
				break;
			case 'drawStroke': {
				if (!this.otherId || !this.user) break;
				const drawingId = typeof body.drawingId === 'string' ? body.drawingId : null;
				if (!drawingId) break;
				const stroke = sanitizeDrawStroke(body.stroke);
				if (!stroke) break;
				this.chatDrawingService.appendLiveStroke(drawingId, stroke);
				const payload = { userId: this.user.id, drawingId, stroke };
				this.globalEventService.publishChatUserStream(this.user.id, this.otherId, 'drawStroke', payload);
				this.globalEventService.publishChatUserStream(this.otherId, this.user.id, 'drawStroke', payload);
				break;
			}
			case 'drawTilePatch': {
				if (!this.otherId || !this.user) break;
				const drawingId = typeof body.drawingId === 'string' ? body.drawingId : null;
				if (!drawingId) break;
				const patch = sanitizeDrawTilePatch(body.patch);
				if (!patch) break;
				this.chatDrawingService.appendLiveTilePatch(drawingId, patch);
				const payload = { userId: this.user.id, drawingId, patch };
				this.globalEventService.publishChatUserStream(this.user.id, this.otherId, 'drawTilePatch', payload);
				this.globalEventService.publishChatUserStream(this.otherId, this.user.id, 'drawTilePatch', payload);
				break;
			}
			case 'drawClear': {
				if (!this.otherId || !this.user) break;
				const drawingId = typeof body.drawingId === 'string' ? body.drawingId : null;
				if (!drawingId) break;
				this.chatDrawingService.clearLiveBufferForClear(drawingId);
				const payload = { userId: this.user.id, drawingId };
				this.globalEventService.publishChatUserStream(this.user.id, this.otherId, 'drawClear', payload);
				this.globalEventService.publishChatUserStream(this.otherId, this.user.id, 'drawClear', payload);
				break;
			}
			case 'drawingPresence': {
				if (!this.otherId || !this.user) break;
				const drawingId = typeof body.drawingId === 'string' ? body.drawingId : null;
				if (!drawingId) break;
				const userId = this.user.id;
				const otherId = this.otherId;
				this.userEntityService.pack(userId).then(user => {
					const payload = { drawingId, userId, user };
					this.globalEventService.publishChatUserStream(userId, otherId, 'drawingPresence', payload);
					this.globalEventService.publishChatUserStream(otherId, userId, 'drawingPresence', payload);
				}).catch(() => { /* ignore pack failure */ });
				break;
			}
			case 'drawUndo': {
				if (!this.otherId || !this.user) break;
				const drawingId = typeof body.drawingId === 'string' ? body.drawingId : null;
				const strokeId = typeof body.strokeId === 'string' ? body.strokeId : null;
				if (!drawingId || !strokeId) break;
				if (!/^[A-Za-z0-9_-]{1,32}$/.test(strokeId)) break;
				this.chatDrawingService.removeBufferedStrokeById(drawingId, strokeId);
				const payload = { userId: this.user.id, drawingId, strokeId };
				this.globalEventService.publishChatUserStream(this.user.id, this.otherId, 'drawUndo', payload);
				this.globalEventService.publishChatUserStream(this.otherId, this.user.id, 'drawUndo', payload);
				break;
			}
			case 'drawingCursor': {
				if (!this.otherId || !this.user) break;
				const drawingId = typeof body.drawingId === 'string' ? body.drawingId : null;
				if (!drawingId) break;
				const rawX = Number(body.x);
				const rawY = Number(body.y);
				if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) break;
				const x = Math.max(-0.1, Math.min(1.1, rawX));
				const y = Math.max(-0.1, Math.min(1.1, rawY));
				const payload = { drawingId, userId: this.user.id, x, y };
				this.globalEventService.publishChatUserStream(this.user.id, this.otherId, 'drawingCursor', payload);
				this.globalEventService.publishChatUserStream(this.otherId, this.user.id, 'drawingCursor', payload);
				break;
			}
		}
	}

	@bindThis
	public dispose() {
		if (!this.user) return;
		this.subscriber.off(`chatUserStream:${this.user.id}-${this.otherId}`, this.onEvent);
	}
}
