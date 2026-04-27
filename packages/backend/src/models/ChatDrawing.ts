/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, JoinColumn, Column, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import { MiChatRoom } from './ChatRoom.js';

// Each point is [x, y] or [x, y, pressure] (pressure 0..1 from pen tablets).
// Older strokes stored as 2-element arrays are treated as pressure = 1 at render time.
export type ChatDrawingStroke = {
	id?: string;
	points: number[][];
	color: string;
	width: number;
	tool: 'pen' | 'eraser' | 'fill' | 'paint' | 'watercolor' | 'text' | 'mixer' | 'airbrush';
	// Airbrush-only adjustables.
	hardness?: number;
	core?: boolean;
	// 'main' (default) or 'draft'. Draft strokes are rendered semi-transparently underneath
	// the main layer so they serve as an underlay sketch.
	layer?: 'main' | 'draft' | 'lineart';
	// When true, the stroke is drawn with `source-atop` so it only lands where the target
	// layer already has pixels. Used for "lineart clipping" — recoloring existing lines
	// rather than painting new pixels next to them.
	clip?: boolean;
	// Text content for tool === 'text'. Renders as a multi-line text block anchored at points[0].
	text?: string;
};

@Entity('chat_drawing')
export class MiChatDrawing {
	@PrimaryColumn(id())
	public id: string;

	@Column({ type: 'timestamp with time zone' })
	public createdAt: Date;

	@Column({ type: 'timestamp with time zone' })
	public updatedAt: Date;

	@Index()
	@Column({ ...id() })
	public createdById: MiUser['id'];

	@ManyToOne(() => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public createdBy: MiUser | null;

	@Column({ ...id() })
	public lastEditedById: MiUser['id'];

	@ManyToOne(() => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public lastEditedBy: MiUser | null;

	@Index()
	@Column({ ...id(), nullable: true })
	public roomId: MiChatRoom['id'] | null;

	@ManyToOne(() => MiChatRoom, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public room: MiChatRoom | null;

	@Column({ ...id(), nullable: true })
	public user1Id: MiUser['id'] | null;

	@ManyToOne(() => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public user1: MiUser | null;

	@Column({ ...id(), nullable: true })
	public user2Id: MiUser['id'] | null;

	@ManyToOne(() => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public user2: MiUser | null;

	@Column('varchar', { length: 256, default: '' })
	public title: string;

	@Column('jsonb', { default: [] })
	public strokes: ChatDrawingStroke[];

	@Column('integer', { default: 1024 })
	public width: number;

	@Column('integer', { default: 768 })
	public height: number;

	@Index({ unique: true })
	@Column('varchar', { length: 64, nullable: true })
	public imageAccessKey: string | null;

	@Column('integer', { default: 0 })
	public imageSize: number;

	// Raster snapshot of the main (fill) layer. Stored as a PNG and rotated on every save
	// (new key per save) so cached fetches don't serve stale pixels. Lineart and draft
	// strokes remain in `strokes` as vectors; main is fully rasterised so fill brushes can
	// produce effects (texture, smudge, pixel-reading) that vector replay can't preserve.
	@Index({ unique: true })
	@Column('varchar', { length: 64, nullable: true })
	public mainImageAccessKey: string | null;

	@Column('integer', { default: 0 })
	public mainImageSize: number;
}
