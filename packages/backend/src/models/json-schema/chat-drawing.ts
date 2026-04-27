/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const packedChatDrawingLiteSchema = {
	type: 'object',
	properties: {
		id: {
			type: 'string',
			optional: false, nullable: false,
		},
		updatedAt: {
			type: 'string',
			format: 'date-time',
			optional: false, nullable: false,
		},
		createdById: {
			type: 'string',
			optional: false, nullable: false,
		},
		lastEditedById: {
			type: 'string',
			optional: false, nullable: false,
		},
		roomId: {
			type: 'string',
			optional: false, nullable: true,
		},
		title: {
			type: 'string',
			optional: false, nullable: false,
		},
		width: {
			type: 'number',
			optional: false, nullable: false,
		},
		height: {
			type: 'number',
			optional: false, nullable: false,
		},
		imageUrl: {
			type: 'string',
			optional: false, nullable: true,
		},
	},
} as const;

// Wire shape of a raster tile patch broadcast on the main layer. Carries the dirty rect
// position + a base64 PNG that receivers draw into their main canvas.
export const packedChatDrawingTilePatchSchema = {
	type: 'object',
	properties: {
		id: { type: 'string', optional: true, nullable: false },
		x: { type: 'number', optional: false, nullable: false },
		y: { type: 'number', optional: false, nullable: false },
		width: { type: 'number', optional: false, nullable: false },
		height: { type: 'number', optional: false, nullable: false },
		dataBase64: { type: 'string', optional: false, nullable: false },
		composite: { type: 'string', optional: false, nullable: false },
	},
} as const;

export const packedChatDrawingSchema = {
	type: 'object',
	properties: {
		id: {
			type: 'string',
			optional: false, nullable: false,
		},
		createdAt: {
			type: 'string',
			format: 'date-time',
			optional: false, nullable: false,
		},
		updatedAt: {
			type: 'string',
			format: 'date-time',
			optional: false, nullable: false,
		},
		createdById: {
			type: 'string',
			optional: false, nullable: false,
		},
		lastEditedById: {
			type: 'string',
			optional: false, nullable: false,
		},
		roomId: {
			type: 'string',
			optional: false, nullable: true,
		},
		otherUserId: {
			type: 'string',
			optional: false, nullable: true,
		},
		title: {
			type: 'string',
			optional: false, nullable: false,
		},
		width: {
			type: 'number',
			optional: false, nullable: false,
		},
		height: {
			type: 'number',
			optional: false, nullable: false,
		},
		imageUrl: {
			type: 'string',
			optional: false, nullable: true,
		},
		// URL to the main (raster) layer PNG. null while the drawing has no main raster
		// yet (fresh creation, or a legacy drawing not yet migrated). Clients fetch this,
		// draw it into their main canvas, then apply any live tile patches on top.
		mainImageUrl: {
			type: 'string',
			optional: false, nullable: true,
		},
		// Live raster patches buffered server-side for the main layer that haven't been
		// folded into mainImageUrl yet. Replayed on top of the main raster by late joiners
		// to bring them up to the leading-edge state.
		liveTilePatches: {
			type: 'array',
			optional: true, nullable: false,
			items: {
				type: 'object',
				optional: false, nullable: false,
				ref: 'ChatDrawingTilePatch',
			},
		},
		strokes: {
			type: 'array',
			optional: false, nullable: false,
			items: {
				type: 'object',
				optional: false, nullable: false,
				properties: {
					points: {
						type: 'array',
						optional: false, nullable: false,
						items: {
							type: 'array',
							optional: false, nullable: false,
							items: {
								type: 'number',
								optional: false, nullable: false,
							},
						},
					},
					color: {
						type: 'string',
						optional: false, nullable: false,
					},
					width: {
						type: 'number',
						optional: false, nullable: false,
					},
					tool: {
						type: 'string',
						optional: false, nullable: false,
					},
				},
			},
		},
	},
} as const;
