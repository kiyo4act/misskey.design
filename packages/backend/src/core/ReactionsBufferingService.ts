/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { DI } from '@/di-symbols.js';
import type { MiNote } from '@/models/Note.js';
import { bindThis } from '@/decorators.js';
import type { MiUser, NotesRepository } from '@/models/_.js';
import type { Config } from '@/config.js';
import { PER_NOTE_REACTION_USER_PAIR_CACHE_MAX } from '@/const.js';
import { LoggerService } from '@/core/LoggerService.js';
import type Logger from '@/logger.js';
import type { GlobalEvents } from '@/core/GlobalEventService.js';
import type { OnApplicationShutdown } from '@nestjs/common';

const REDIS_DELTA_PREFIX = 'reactionsBufferDeltas';
const REDIS_PAIR_PREFIX = 'reactionsBufferPairs';

@Injectable()
export class ReactionsBufferingService implements OnApplicationShutdown {
	private logger: Logger;

	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.redisForSub)
		private redisForSub: Redis.Redis,

		@Inject(DI.redisForReactions)
		private redisForReactions: Redis.Redis, // TODO: 専用のRedisインスタンスにする

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		private loggerService: LoggerService,
	) {
		this.logger = this.loggerService.getLogger('reactions-buffering');
		this.redisForSub.on('message', this.onMessage);
	}

	@bindThis
	private async onMessage(_: string, data: string) {
		const obj = JSON.parse(data);

		if (obj.channel === 'internal') {
			const { type, body } = obj.message as GlobalEvents['internal']['payload'];
			switch (type) {
				case 'metaUpdated': {
					// リアクションバッファリングが有効→無効になったら即bake
					if (body.before != null && body.before.enableReactionsBuffering && !body.after.enableReactionsBuffering) {
						this.bake();
					}
					break;
				}
				default:
					break;
			}
		}
	}

	@bindThis
	public async create(noteId: MiNote['id'], userId: MiUser['id'], reaction: string, currentPairs: string[]): Promise<void> {
		const pipeline = this.redisForReactions.pipeline();
		pipeline.hincrby(`${REDIS_DELTA_PREFIX}:${noteId}`, reaction, 1);
		for (let i = 0; i < currentPairs.length; i++) {
			pipeline.zadd(`${REDIS_PAIR_PREFIX}:${noteId}`, i, currentPairs[i]);
		}
		pipeline.zadd(`${REDIS_PAIR_PREFIX}:${noteId}`, Date.now(), `${userId}/${reaction}`);
		pipeline.zremrangebyrank(`${REDIS_PAIR_PREFIX}:${noteId}`, 0, -(PER_NOTE_REACTION_USER_PAIR_CACHE_MAX + 1));
		await pipeline.exec();
	}

	@bindThis
	public async delete(noteId: MiNote['id'], userId: MiUser['id'], reaction: string): Promise<void> {
		const pipeline = this.redisForReactions.pipeline();
		pipeline.hincrby(`${REDIS_DELTA_PREFIX}:${noteId}`, reaction, -1);
		pipeline.zrem(`${REDIS_PAIR_PREFIX}:${noteId}`, `${userId}/${reaction}`);
		// TODO: 「消した要素一覧」も持っておかないとcreateされた時に上書きされて復活する
		await pipeline.exec();
	}

	@bindThis
	public async get(noteId: MiNote['id']): Promise<{
		deltas: Record<string, number>;
		pairs: ([MiUser['id'], string])[];
	}> {
		const pipeline = this.redisForReactions.pipeline();
		pipeline.hgetall(`${REDIS_DELTA_PREFIX}:${noteId}`);
		pipeline.zrange(`${REDIS_PAIR_PREFIX}:${noteId}`, 0, -1);
		const results = await pipeline.exec();

		const resultDeltas = results![0][1] as Record<string, string>;
		const resultPairs = results![1][1] as string[];

		const deltas = {} as Record<string, number>;
		for (const [name, count] of Object.entries(resultDeltas)) {
			deltas[name] = parseInt(count);
		}

		const pairs = resultPairs.map(x => x.split('/') as [MiUser['id'], string]);

		return {
			deltas,
			pairs,
		};
	}

	@bindThis
	public async getMany(noteIds: MiNote['id'][]): Promise<Map<MiNote['id'], {
		deltas: Record<string, number>;
		pairs: ([MiUser['id'], string])[];
	}>> {
		const map = new Map<MiNote['id'], {
			deltas: Record<string, number>;
			pairs: ([MiUser['id'], string])[];
		}>();

		const pipeline = this.redisForReactions.pipeline();
		for (const noteId of noteIds) {
			pipeline.hgetall(`${REDIS_DELTA_PREFIX}:${noteId}`);
			pipeline.zrange(`${REDIS_PAIR_PREFIX}:${noteId}`, 0, -1);
		}
		const results = await pipeline.exec();

		const opsForEachNotes = 2;
		for (let i = 0; i < noteIds.length; i++) {
			const noteId = noteIds[i];
			const resultDeltas = results![i * opsForEachNotes][1] as Record<string, string>;
			const resultPairs = results![i * opsForEachNotes + 1][1] as string[];

			const deltas = {} as Record<string, number>;
			for (const [name, count] of Object.entries(resultDeltas)) {
				deltas[name] = parseInt(count);
			}

			const pairs = resultPairs.map(x => x.split('/') as [MiUser['id'], string]);

			map.set(noteId, {
				deltas,
				pairs,
			});
		}

		return map;
	}

	// TODO: scanは重い可能性があるので、別途 bufferedNoteIds を直接Redis上に持っておいてもいいかもしれない
	@bindThis
	public async bake(): Promise<void> {
		const bufferedNoteIds = [];
		let cursor = '0';
		do {
			// https://github.com/redis/ioredis#transparent-key-prefixing
			const result = await this.redisForReactions.scan(
				cursor,
				'MATCH',
				`${this.config.redis.prefix}:${REDIS_DELTA_PREFIX}:*`,
				'COUNT',
				'1000');

			cursor = result[0];
			bufferedNoteIds.push(...result[1].map(x => x.replace(`${this.config.redis.prefix}:${REDIS_DELTA_PREFIX}:`, '')));
		} while (cursor !== '0');

		const bufferedMap = await this.getMany(bufferedNoteIds);

		// DBへの書き込みが完了したものだけをRedisから消す。
		// 先にRedisを消すと、書き込み前にプロセスが落ちた場合にバッファの内容が失われる
		// (どちらにも存在しない状態になり、リアクションが恒久的に消失する)。
		// TODO: SQL一個にまとめたい
		const bakedNoteIds: MiNote['id'][] = [];
		for (const [noteId, buffered] of bufferedMap) {
			const deltas = Object.entries(buffered.deltas);
			if (deltas.length === 0) continue;

			const expressions: string[] = [];
			const parameters: Record<string, string | number> = {};
			for (const [i, [reaction, count]] of deltas.entries()) {
				expressions.push(`jsonb_set("reactions", ARRAY[:reaction${i}], (COALESCE("reactions"->>:reaction${i}, '0')::int + :count${i})::text::jsonb)`);
				parameters[`reaction${i}`] = reaction;
				parameters[`count${i}`] = count;
			}
			const sql = expressions.join(' || ');

			try {
				await this.notesRepository.createQueryBuilder().update()
					.set({
						reactions: () => sql,
						reactionAndUserPairCache: buffered.pairs.map(x => x.join('/')),
					})
					.where('id = :id', { id: noteId })
					.setParameters(parameters)
					.execute();

				bakedNoteIds.push(noteId);
			} catch (err) {
				// 失敗したnoteのバッファは消さずに残し、次回のbakeで再試行する
				this.logger.error(`Failed to bake buffered reactions of note ${noteId}`, { err });
			}
		}

		// clear
		// 読み取ってからここまでの間に増えた分を消さないよう、
		// 実際にDBへ反映したreactionのぶんだけを打ち消す (hincrbyで減算する)。
		// キーごとdelすると、その間に入ったリアクションが書き込まれないまま消える。
		if (bakedNoteIds.length > 0) {
			const pipeline = this.redisForReactions.pipeline();
			for (const noteId of bakedNoteIds) {
				const buffered = bufferedMap.get(noteId)!;
				for (const [reaction, count] of Object.entries(buffered.deltas)) {
					pipeline.hincrby(`${REDIS_DELTA_PREFIX}:${noteId}`, reaction, -count);
				}
				for (const pair of buffered.pairs) {
					pipeline.zrem(`${REDIS_PAIR_PREFIX}:${noteId}`, pair.join('/'));
				}
			}
			await pipeline.exec();

			// 打ち消した結果0になったフィールドを掃除する
			// (残しておくと、次回以降のbakeが空のバッファを拾い続けてしまう)
			const remainings = await this.getMany(bakedNoteIds);
			const cleanup = this.redisForReactions.pipeline();
			for (const [noteId, remaining] of remainings) {
				const emptied = Object.entries(remaining.deltas)
					.filter(([, count]) => count === 0)
					.map(([reaction]) => reaction);

				if (emptied.length > 0) {
					cleanup.hdel(`${REDIS_DELTA_PREFIX}:${noteId}`, ...emptied);
				}
			}
			await cleanup.exec();
		}
	}

	@bindThis
	public mergeReactions(src: MiNote['reactions'], delta: Record<string, number>): MiNote['reactions'] {
		const reactions = { ...src };
		for (const [name, count] of Object.entries(delta)) {
			if (reactions[name] != null) {
				reactions[name] += count;
			} else {
				reactions[name] = count;
			}
		}
		return reactions;
	}

	@bindThis
	public dispose(): void {
		this.redisForSub.off('message', this.onMessage);
	}

	@bindThis
	public async onApplicationShutdown(signal?: string | undefined): Promise<void> {
		// bakeは通常1日1回しか実行されないため、シャットダウン時にflushしておかないと
		// 前回のbakeから今までにバッファされたリアクションがRedis上に取り残される。
		// (Redisが揮発した場合や、そのままバッファリングが無効化された場合に失われる)
		try {
			await this.bake();
		} catch (err) {
			this.logger.error('Failed to bake buffered reactions on shutdown', { err });
		}

		this.dispose();
	}
}
