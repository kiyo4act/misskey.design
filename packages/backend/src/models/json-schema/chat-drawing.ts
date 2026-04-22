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
