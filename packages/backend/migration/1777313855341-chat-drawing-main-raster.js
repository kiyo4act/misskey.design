/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ChatDrawingMainRaster1777313855341 {
	name = 'ChatDrawingMainRaster1777313855341'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "chat_drawing" ADD COLUMN "mainImageAccessKey" character varying(64)`);
		await queryRunner.query(`ALTER TABLE "chat_drawing" ADD COLUMN "mainImageSize" integer NOT NULL DEFAULT 0`);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_chat_drawing_mainImageAccessKey" ON "chat_drawing" ("mainImageAccessKey") `);
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP INDEX "IDX_chat_drawing_mainImageAccessKey"`);
		await queryRunner.query(`ALTER TABLE "chat_drawing" DROP COLUMN "mainImageSize"`);
		await queryRunner.query(`ALTER TABLE "chat_drawing" DROP COLUMN "mainImageAccessKey"`);
	}
}
