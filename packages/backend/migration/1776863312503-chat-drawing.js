/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ChatDrawing1776863312503 {
	name = 'ChatDrawing1776863312503'

	async up(queryRunner) {
		await queryRunner.query(`CREATE TABLE "chat_drawing" ("id" character varying(32) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "createdById" character varying(32) NOT NULL, "lastEditedById" character varying(32) NOT NULL, "roomId" character varying(32), "user1Id" character varying(32), "user2Id" character varying(32), "strokes" jsonb NOT NULL DEFAULT '[]'::jsonb, "width" integer NOT NULL DEFAULT 1024, "height" integer NOT NULL DEFAULT 768, "imageAccessKey" character varying(64), "imageSize" integer NOT NULL DEFAULT 0, CONSTRAINT "PK_chat_drawing_id" PRIMARY KEY ("id"))`);
		await queryRunner.query(`CREATE INDEX "IDX_chat_drawing_roomId" ON "chat_drawing" ("roomId") `);
		await queryRunner.query(`CREATE INDEX "IDX_chat_drawing_user_pair" ON "chat_drawing" ("user1Id", "user2Id") `);
		await queryRunner.query(`CREATE INDEX "IDX_chat_drawing_createdById" ON "chat_drawing" ("createdById") `);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_chat_drawing_imageAccessKey" ON "chat_drawing" ("imageAccessKey") `);
		await queryRunner.query(`ALTER TABLE "chat_drawing" ADD CONSTRAINT "FK_chat_drawing_roomId" FOREIGN KEY ("roomId") REFERENCES "chat_room"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
		await queryRunner.query(`ALTER TABLE "chat_drawing" ADD CONSTRAINT "FK_chat_drawing_user1Id" FOREIGN KEY ("user1Id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
		await queryRunner.query(`ALTER TABLE "chat_drawing" ADD CONSTRAINT "FK_chat_drawing_user2Id" FOREIGN KEY ("user2Id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
		await queryRunner.query(`ALTER TABLE "chat_drawing" ADD CONSTRAINT "FK_chat_drawing_createdById" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
		await queryRunner.query(`ALTER TABLE "chat_drawing" ADD CONSTRAINT "FK_chat_drawing_lastEditedById" FOREIGN KEY ("lastEditedById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);

		await queryRunner.query(`ALTER TABLE "chat_message" ADD COLUMN "drawingId" character varying(32)`);
		await queryRunner.query(`CREATE INDEX "IDX_chat_message_drawingId" ON "chat_message" ("drawingId") `);
		await queryRunner.query(`ALTER TABLE "chat_message" ADD CONSTRAINT "FK_chat_message_drawingId" FOREIGN KEY ("drawingId") REFERENCES "chat_drawing"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "chat_message" DROP CONSTRAINT "FK_chat_message_drawingId"`);
		await queryRunner.query(`DROP INDEX "IDX_chat_message_drawingId"`);
		await queryRunner.query(`ALTER TABLE "chat_message" DROP COLUMN "drawingId"`);

		await queryRunner.query(`ALTER TABLE "chat_drawing" DROP CONSTRAINT "FK_chat_drawing_lastEditedById"`);
		await queryRunner.query(`ALTER TABLE "chat_drawing" DROP CONSTRAINT "FK_chat_drawing_createdById"`);
		await queryRunner.query(`ALTER TABLE "chat_drawing" DROP CONSTRAINT "FK_chat_drawing_user2Id"`);
		await queryRunner.query(`ALTER TABLE "chat_drawing" DROP CONSTRAINT "FK_chat_drawing_user1Id"`);
		await queryRunner.query(`ALTER TABLE "chat_drawing" DROP CONSTRAINT "FK_chat_drawing_roomId"`);
		await queryRunner.query(`DROP INDEX "IDX_chat_drawing_imageAccessKey"`);
		await queryRunner.query(`DROP INDEX "IDX_chat_drawing_createdById"`);
		await queryRunner.query(`DROP INDEX "IDX_chat_drawing_user_pair"`);
		await queryRunner.query(`DROP INDEX "IDX_chat_drawing_roomId"`);
		await queryRunner.query(`DROP TABLE "chat_drawing"`);
	}
}
