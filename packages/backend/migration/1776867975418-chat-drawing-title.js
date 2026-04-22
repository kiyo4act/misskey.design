/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ChatDrawingTitle1776867975418 {
	name = 'ChatDrawingTitle1776867975418'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "chat_drawing" ADD COLUMN "title" character varying(256) NOT NULL DEFAULT ''`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "chat_drawing" DROP COLUMN "title"`);
	}
}
