/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import { resolve } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import type { Config } from '@/config.js';
import type { ChatDrawingsRepository, DriveFilesRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { StatusError } from '@/misc/status-error.js';
import type Logger from '@/logger.js';
import { DownloadService } from '@/core/DownloadService.js';
import { InternalStorageService } from '@/core/InternalStorageService.js';
import { FileInfoService } from '@/core/FileInfoService.js';
import { ImageProcessingService } from '@/core/ImageProcessingService.js';
import { VideoProcessingService } from '@/core/VideoProcessingService.js';
import { LoggerService } from '@/core/LoggerService.js';
import { bindThis } from '@/decorators.js';
import { handleRequestRedirectToOmitSearch } from '@/misc/fastify-hook-handlers.js';
import { FileServerDriveHandler } from './file/FileServerDriveHandler.js';
import { FileServerFileResolver } from './file/FileServerFileResolver.js';
import { FileServerProxyHandler } from './file/FileServerProxyHandler.js';
import type { FastifyInstance, FastifyRequest, FastifyReply, FastifyPluginOptions } from 'fastify';

@Injectable()
export class FileServerService {
	private logger: Logger;
	private driveHandler: FileServerDriveHandler;
	private proxyHandler: FileServerProxyHandler;
	private fileResolver: FileServerFileResolver;

	private readonly assets: string;

	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		@Inject(DI.chatDrawingsRepository)
		private chatDrawingsRepository: ChatDrawingsRepository,

		private fileInfoService: FileInfoService,
		private downloadService: DownloadService,
		private imageProcessingService: ImageProcessingService,
		private videoProcessingService: VideoProcessingService,
		private internalStorageService: InternalStorageService,
		private loggerService: LoggerService,
	) {
		this.logger = this.loggerService.getLogger('server', 'gray');
		this.assets = resolve(this.config.rootDir, 'packages/backend/src/server/file/assets');
		this.fileResolver = new FileServerFileResolver(
			this.driveFilesRepository,
			this.fileInfoService,
			this.downloadService,
			this.internalStorageService,
		);
		this.driveHandler = new FileServerDriveHandler(
			this.config,
			this.fileResolver,
			this.assets,
			this.videoProcessingService,
		);
		this.proxyHandler = new FileServerProxyHandler(
			this.config,
			this.fileResolver,
			this.assets,
			this.imageProcessingService,
		);

		//this.createServer = this.createServer.bind(this);
	}

	@bindThis
	public createServer(fastify: FastifyInstance, _options: FastifyPluginOptions, done: (err?: Error) => void) {
		fastify.addHook('onRequest', (_request, reply, done) => {
			reply.header('Content-Security-Policy', 'default-src \'none\'; img-src \'self\'; media-src \'self\'; style-src \'unsafe-inline\'');
			if (process.env.NODE_ENV === 'development') {
				reply.header('Access-Control-Allow-Origin', '*');
			}
			done();
		});

		fastify.register((fastify, _options, done) => {
			fastify.addHook('onRequest', handleRequestRedirectToOmitSearch);
			fastify.get('/files/app-default.jpg', (_request, reply) => {
				const file = fs.createReadStream(`${this.assets}/dummy.png`);
				reply.header('Content-Type', 'image/jpeg');
				reply.header('Cache-Control', 'max-age=31536000, immutable');
				return reply.send(file);
			});

			fastify.get<{ Params: { key: string; } }>('/files/:key', async (request, reply) => {
				return await this.driveHandler.handle(request, reply)
					.catch(err => this.errorHandler(request, reply, err));
			});
			fastify.get<{ Params: { key: string; } }>('/files/:key/*', async (request, reply) => {
				return await reply.redirect(`${this.config.url}/files/${request.params.key}`, 301);
			});

			fastify.get<{ Params: { key: string; } }>('/chat-drawings/:key', async (request, reply) => {
				const keyParam = request.params.key;
				const accessKey = keyParam.endsWith('.png') ? keyParam.slice(0, -4) : keyParam;
				// Accept either the composite-image key OR the main-raster key. Both live
				// in the same `chatdrawing-{accessKey}.png` namespace on internal storage,
				// but they're stored in separate columns on the drawing row — look up either.
				const drawing = await this.chatDrawingsRepository.findOne({
					where: [{ imageAccessKey: accessKey }, { mainImageAccessKey: accessKey }],
				});
				if (drawing == null) {
					reply.code(404);
					return reply.send('Not found');
				}
				try {
					const stream = this.internalStorageService.read(`chatdrawing-${accessKey}.png`);
					reply.header('Content-Type', 'image/png');
					reply.header('Cache-Control', 'public, max-age=31536000, immutable');
					return reply.send(stream);
				} catch (err) {
					return this.errorHandler(request, reply, err);
				}
			});
			done();
		});

		fastify.get<{
			Params: { url: string; };
			Querystring: { url?: string; };
		}>('/proxy/:url*', async (request, reply) => {
			return await this.proxyHandler.handle(request, reply)
				.catch(err => this.errorHandler(request, reply, err));
		});

		done();
	}

	@bindThis
	private async errorHandler(request: FastifyRequest<{ Params?: { [x: string]: unknown }; Querystring?: { [x: string]: unknown }; }>, reply: FastifyReply, err?: unknown) {
		this.logger.error(`${err}`);

		reply.header('Cache-Control', 'max-age=300');

		if (request.query && 'fallback' in request.query) {
			return reply.sendFile('/dummy.png', this.assets);
		}

		if (err instanceof StatusError && (err.statusCode === 302 || err.isClientError)) {
			reply.code(err.statusCode);
			return;
		}

		reply.code(500);
		return;
	}
}
