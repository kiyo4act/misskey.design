import {
	Antenna,
	ChatMessage,
	ChatMessageLite,
	DriveFile,
	DriveFolder,
	Note,
	Notification,
	Signin,
	User,
	UserDetailed,
	UserDetailedNotMe,
	UserLite,
} from './autogen/models.js';
import {
	AnnouncementCreated,
	EmojiAdded, EmojiDeleted,
	EmojiUpdated,
	PageEvent,
	QueueStats,
	QueueStatsLog,
	ServerStats,
	ServerStatsLog,
	ReversiGameDetailed,
} from './entities.js';
import {
	ReversiUpdateKey,
} from './consts.js';

type ReversiUpdateSettings<K extends ReversiUpdateKey> = {
	key: K;
	value: ReversiGameDetailed[K];
};

export type Channels = {
	main: {
		params: null;
		events: {
			notification: (payload: Notification) => void;
			mention: (payload: Note) => void;
			reply: (payload: Note) => void;
			renote: (payload: Note) => void;
			follow: (payload: UserDetailedNotMe) => void; // 自分が他人をフォローしたとき
			followed: (payload: UserDetailed | UserLite) => void; // 他人が自分をフォローしたとき
			unfollow: (payload: UserDetailed) => void; // 自分が他人をフォロー解除したとき
			meUpdated: (payload: UserDetailed) => void;
			pageEvent: (payload: PageEvent) => void;
			urlUploadFinished: (payload: { marker: string; file: DriveFile; }) => void;
			readAllNotifications: () => void;
			unreadNotification: (payload: Notification) => void;
			notificationFlushed: () => void;
			unreadAntenna: (payload: Antenna) => void;
			newChatMessage: (payload: ChatMessage) => void;
			readAllAnnouncements: () => void;
			myTokenRegenerated: () => void;
			signin: (payload: Signin) => void;
			registryUpdated: (payload: {
				scope?: string[];
				key: string;
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				value: any | null;
			}) => void;
			driveFileCreated: (payload: DriveFile) => void;
			readAntenna: (payload: Antenna) => void;
			receiveFollowRequest: (payload: User) => void;
			announcementCreated: (payload: AnnouncementCreated) => void;
		};
		receives: null;
	};
	homeTimeline: {
		params: {
			withRenotes?: boolean;
			withFiles?: boolean;
		};
		events: {
			note: (payload: Note) => void;
		};
		receives: null;
	};
	localTimeline: {
		params: {
			withRenotes?: boolean;
			withReplies?: boolean;
			withFiles?: boolean;
		};
		events: {
			note: (payload: Note) => void;
		};
		receives: null;
	};
	hybridTimeline: {
		params: {
			withRenotes?: boolean;
			withReplies?: boolean;
			withFiles?: boolean;
		};
		events: {
			note: (payload: Note) => void;
		};
		receives: null;
	};
	globalTimeline: {
		params: {
			withRenotes?: boolean;
			withFiles?: boolean;
		};
		events: {
			note: (payload: Note) => void;
		};
		receives: null;
	};
	userList: {
		params: {
			listId: string;
			withFiles?: boolean;
			withRenotes?: boolean;
		};
		events: {
			note: (payload: Note) => void;
		};
		receives: null;
	};
	hashtag: {
		params: {
			q: string[][];
		};
		events: {
			note: (payload: Note) => void;
		};
		receives: null;
	};
	roleTimeline: {
		params: {
			roleId: string;
		};
		events: {
			note: (payload: Note) => void;
		};
		receives: null;
	};
	antenna: {
		params: {
			antennaId: string;
		};
		events: {
			note: (payload: Note) => void;
		};
		receives: null;
	};
	channel: {
		params: {
			channelId: string;
		};
		events: {
			note: (payload: Note) => void;
		};
		receives: null;
	};
	drive: {
		params: null;
		events: {
			fileCreated: (payload: DriveFile) => void;
			fileDeleted: (payload: DriveFile['id']) => void;
			fileUpdated: (payload: DriveFile) => void;
			folderCreated: (payload: DriveFolder) => void;
			folderDeleted: (payload: DriveFolder['id']) => void;
			folderUpdated: (payload: DriveFolder) => void;
		};
		receives: null;
	};
	serverStats: {
		params: null;
		events: {
			stats: (payload: ServerStats) => void;
			statsLog: (payload: ServerStatsLog) => void;
		};
		receives: {
			requestLog: {
				id: string | number;
				length: number;
			};
		};
	};
	queueStats: {
		params: null;
		events: {
			stats: (payload: QueueStats) => void;
			statsLog: (payload: QueueStatsLog) => void;
		};
		receives: {
			requestLog: {
				id: string | number;
				length: number;
			};
		};
	};
	admin: {
		params: null;
		events: {
			newAbuseUserReport: {
				id: string;
				targetUserId: string;
				reporterId: string;
				comment: string;
			}
		};
		receives: null;
	};
	reversi: {
		params: null;
		events: {
			matched: (payload: { game: ReversiGameDetailed }) => void;
			invited: (payload: { user: User }) => void;
		};
		receives: null;
	};
	reversiGame: {
		params: {
			gameId: string;
		};
		events: {
			started: (payload: { game: ReversiGameDetailed; }) => void;
			ended: (payload: { winnerId: User['id'] | null; game: ReversiGameDetailed; }) => void;
			canceled: (payload: { userId: User['id']; }) => void;
			changeReadyStates: (payload: { user1: boolean; user2: boolean; }) => void;
			updateSettings: <K extends ReversiUpdateKey>(payload: { userId: User['id']; key: K; value: ReversiGameDetailed[K]; }) => void;
			log: (payload: {
				time: number;
				player: boolean;
				operation: 'put';
				pos: number;
			} & { id: string | null }) => void;
		};
		receives: {
			putStone: {
				pos: number;
				id: string;
			};
			ready: boolean;
			cancel: null | Record<string, never>;
			updateSettings: ReversiUpdateSettings<ReversiUpdateKey>;
			claimTimeIsUp: null | Record<string, never>;
		}
	};
	chatUser: {
		params: {
			otherId: string;
		};
		events: {
			message: (payload: ChatMessageLite) => void;
			deleted: (payload: ChatMessageLite['id']) => void;
			react: (payload: {
				reaction: string;
				user?: UserLite;
				messageId: ChatMessageLite['id'];
			}) => void;
			unreact: (payload: {
				reaction: string;
				user?: UserLite;
				messageId: ChatMessageLite['id'];
			}) => void;
			drawStroke: (payload: {
				userId: User['id'];
				drawingId: string;
				stroke: ChatDrawStroke;
			}) => void;
			drawTilePatch: (payload: {
				userId: User['id'];
				drawingId: string;
				patch: ChatDrawTilePatch;
			}) => void;
			drawClear: (payload: {
				userId: User['id'];
				drawingId: string;
			}) => void;
			drawingUpdated: (payload: {
				drawingId: string;
				imageAccessKey: string;
				imageUrl: string;
				updatedAt: string;
				lastEditedById: User['id'];
			}) => void;
			drawingPresence: (payload: {
				drawingId: string;
				userId: User['id'];
				user: UserLite;
			}) => void;
			drawUndo: (payload: {
				userId: User['id'];
				drawingId: string;
				strokeId: string;
			}) => void;
			drawingCursor: (payload: {
				drawingId: string;
				userId: User['id'];
				x: number;
				y: number;
			}) => void;
		};
		receives: {
			read: {
				id: ChatMessageLite['id'];
			};
			drawStroke: {
				drawingId: string;
				stroke: ChatDrawStroke;
			};
			drawTilePatch: {
				drawingId: string;
				patch: ChatDrawTilePatch;
			};
			drawClear: {
				drawingId: string;
			};
			drawingPresence: {
				drawingId: string;
			};
			drawUndo: {
				drawingId: string;
				strokeId: string;
			};
			drawingCursor: {
				drawingId: string;
				x: number;
				y: number;
			};
		};
	};
	chatRoom: {
		params: {
			roomId: string;
		};
		events: {
			message: (payload: ChatMessageLite) => void;
			deleted: (payload: ChatMessageLite['id']) => void;
			react: (payload: {
				reaction: string;
				user?: UserLite;
				messageId: ChatMessageLite['id'];
			}) => void;
			unreact: (payload: {
				reaction: string;
				user?: UserLite;
				messageId: ChatMessageLite['id'];
			}) => void;
			drawStroke: (payload: {
				userId: User['id'];
				drawingId: string;
				stroke: ChatDrawStroke;
			}) => void;
			drawTilePatch: (payload: {
				userId: User['id'];
				drawingId: string;
				patch: ChatDrawTilePatch;
			}) => void;
			drawClear: (payload: {
				userId: User['id'];
				drawingId: string;
			}) => void;
			drawingUpdated: (payload: {
				drawingId: string;
				imageAccessKey: string;
				imageUrl: string;
				updatedAt: string;
				lastEditedById: User['id'];
			}) => void;
			drawingPresence: (payload: {
				drawingId: string;
				userId: User['id'];
				user: UserLite;
			}) => void;
			drawUndo: (payload: {
				userId: User['id'];
				drawingId: string;
				strokeId: string;
			}) => void;
			drawingCursor: (payload: {
				drawingId: string;
				userId: User['id'];
				x: number;
				y: number;
			}) => void;
		};
		receives: {
			read: {
				id: ChatMessageLite['id'];
			};
			drawStroke: {
				drawingId: string;
				stroke: ChatDrawStroke;
			};
			drawTilePatch: {
				drawingId: string;
				patch: ChatDrawTilePatch;
			};
			drawClear: {
				drawingId: string;
			};
			drawingPresence: {
				drawingId: string;
			};
			drawUndo: {
				drawingId: string;
				strokeId: string;
			};
			drawingCursor: {
				drawingId: string;
				x: number;
				y: number;
			};
		};
	};
};

export type ChatDrawStroke = {
	id?: string;
	points: number[][];
	color: string;
	width: number;
	tool: 'pen' | 'eraser' | 'fill' | 'paint' | 'watercolor' | 'text' | 'mixer' | 'airbrush';
	layer?: 'main' | 'draft' | 'lineart';
	clip?: boolean;
	text?: string;
	hardness?: number;
	core?: boolean;
};

// Raster tile patch for the main (fill) layer. Sent on stroke completion in place of
// a vector stroke; receivers replace the (x, y, width, height) rect with the patch's
// PNG pixels.
export type ChatDrawTilePatch = {
	id?: string;
	x: number;
	y: number;
	width: number;
	height: number;
	dataBase64: string;
	composite: 'source-over' | 'destination-out' | 'source-atop';
};

export type NoteUpdatedEvent = { id: Note['id'] } & ({
	type: 'reacted';
	body: {
		reaction: string;
		emoji?: {
			name: string;
			url: string;
		} | null;
		userId: User['id'];
	};
} | {
	type: 'unreacted';
	body: {
		reaction: string;
		userId: User['id'];
	};
} | {
	type: 'deleted';
	body: {
		deletedAt: string;
	};
} | {
	type: 'pollVoted';
	body: {
		choice: number;
		userId: User['id'];
	};
});

export type BroadcastEvents = {
	noteUpdated: (payload: NoteUpdatedEvent) => void;
	emojiAdded: (payload: EmojiAdded) => void;
	emojiUpdated: (payload: EmojiUpdated) => void;
	emojiDeleted: (payload: EmojiDeleted) => void;
	announcementCreated: (payload: AnnouncementCreated) => void;
};
