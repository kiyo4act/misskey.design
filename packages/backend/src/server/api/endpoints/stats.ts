/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { InstancesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import NotesChart from '@/core/chart/charts/notes.js';
import UsersChart from '@/core/chart/charts/users.js';

export const meta = {
	requireCredential: false,

	tags: ['meta'],

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			notesCount: {
				type: 'number',
				optional: false, nullable: false,
			},
			originalNotesCount: {
				type: 'number',
				optional: false, nullable: false,
			},
			usersCount: {
				type: 'number',
				optional: false, nullable: false,
			},
			originalUsersCount: {
				type: 'number',
				optional: false, nullable: false,
			},
			reactionsCount: {
				type: 'number',
				optional: false, nullable: false,
			},
			//originalReactionsCount: {
			//	type: 'number',
			//	optional: false, nullable: false,
			//},
			instances: {
				type: 'number',
				optional: false, nullable: false,
			},
			driveUsageLocal: {
				type: 'number',
				optional: false, nullable: false,
			},
			driveUsageRemote: {
				type: 'number',
				optional: false, nullable: false,
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.db)
		private db: DataSource,

		@Inject(DI.instancesRepository)
		private instancesRepository: InstancesRepository,

		private notesChart: NotesChart,
		private usersChart: UsersChart,
	) {
		super(meta, paramDef, async () => {
			const notesChart = await this.notesChart.getChart('hour', 1, null);
			const notesCount = notesChart.local.total[0] + notesChart.remote.total[0];
			const originalNotesCount = notesChart.local.total[0];

			const usersChart = await this.usersChart.getChart('hour', 1, null);
			const usersCount = usersChart.local.total[0] + usersChart.remote.total[0];
			const originalUsersCount = usersChart.local.total[0];

			const [instances, reactionsCount] = await Promise.all([
				this.instancesRepository.count({ cache: 3600000 }),
				this.estimateReactionsCount(),
			]);

			return {
				notesCount,
				originalNotesCount,
				usersCount,
				originalUsersCount,
				reactionsCount,
				instances,
				driveUsageLocal: 0,
				driveUsageRemote: 0,
			};
		});
	}

	/**
	 * note_reaction の行数を PostgreSQL の統計情報 (pg_class.reltuples) から推定する。
	 * 全件 COUNT(*) は大規模テーブルの全走査になり DB 負荷が大きいため使わない。
	 * 統計が未収集 (-1) またはテーブルが見つからない場合は 0 を返す。
	 */
	private async estimateReactionsCount(): Promise<number> {
		const rows: { estimate: string | null }[] = await this.db.query(
			'SELECT reltuples::bigint AS "estimate" FROM pg_class WHERE oid = to_regclass(\'note_reaction\')',
		);
		const estimate = parseInt(rows[0]?.estimate ?? '0', 10);
		return Number.isFinite(estimate) && estimate > 0 ? estimate : 0;
	}
}
