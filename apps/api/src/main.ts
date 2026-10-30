import 'reflect-metadata';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  HttpCode,
  Inject,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import express from 'express';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { z, ZodError } from 'zod';
import {
  type Album,
  albumContentSchema,
  type AudioAsset,
  type VideoConfig,
  type LayoutTemplate,
  layoutTemplateSchema,
  type ExportJob,
  type JobView,
  createAlbumContent,
  saveAlbumSchema,
  videoConfigSchema,
  todayIn,
  createPage,
} from '../../../packages/domain/index.js';
import { Repository } from './database.js';
import { AccountDeletion, UPLOAD_TIMEOUT_MS } from './account-deletion.js';
import {
  AccountSecurity,
  AuthError,
  passwordHash,
  passwordMatches,
  type Account,
  type Session,
} from './auth.js';
import { createMailer } from './mail.js';
import { AlbumHistory, VERSION_LIMIT } from './history.js';
import { normalizeAudio, MAX_AUDIO_BYTES, InvalidAudioError, byteRange } from './audio.js';
import { RenderQueue } from './render.js';
import { JobRepository } from './jobs.js';
import { ResourcePolicy } from './resource-policy.js';
import { MaintenanceService } from './maintenance.js';
import { Observability, logEvent, errorDiagnostics } from './observability.js';
import { OpsMonitor } from './ops-monitor.js';
import { BackupLock, backupSafeStore } from './backup-lock.js';
import { JournalService } from './journal.js';
import { JournalAlbumService } from './journal-album.js';
import { normalizePhoto } from './images.js';
import { builtInTemplates, templatePage } from '../../../packages/domain/templates.js';
import { videoDurationFrames } from '../../../packages/domain/video.js';
import { createMediaStore, ObjectNotFoundError } from './storage.js';

const dataDir = path.resolve(process.env.DATA_DIR || 'data');
const repository = new Repository();
const jobs = new JobRepository(repository);
const history = new AlbumHistory(repository);
const store = backupSafeStore(repository, createMediaStore(dataDir));
const backupLock = new BackupLock(repository);
const resources = new ResourcePolicy(repository, store, dataDir);
const observability = new Observability();
const maintenance = new MaintenanceService(repository, resources, dataDir, () =>
  backupLock.paused(),
);
const mailer = createMailer(dataDir);
const opsMonitor = new OpsMonitor(repository, mailer);
const deletion = new AccountDeletion(repository, jobs, store, dataDir, () => backupLock.paused());
const journal = new JournalService(repository, store, resources, deletion);
const journalAlbums = new JournalAlbumService(repository, store, resources, deletion);
const security = new AccountSecurity(
  repository,
  mailer,
  process.env.APP_ORIGIN || 'http://127.0.0.1:5173',
  deletion,
);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
type UserRequest = Request & { userId: string };
const credentialSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(200)
    .transform((v) => v.toLowerCase()),
  password: z.string().min(10).max(200),
});
const cookieOptions = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: process.env.COOKIE_SECURE === 'true',
  maxAge: 30 * 86400000,
  path: '/',
};
async function issueSession(res: Response, userId: string, credentialVersion = 0) {
  const token = randomBytes(32).toString('hex');
  await repository.put('session', hash(token), userId, {
    userId,
    credentialVersion,
    expires: Date.now() + cookieOptions.maxAge,
  });
  res.cookie('scrapbook_session', token, cookieOptions);
}
function publicJob(job: ExportJob): JobView {
  const { snapshot: _, assetData: __, outputKey: ___, audioAsset: ____, ...view } = job;
  return view;
}
async function streamObject(res: Response, key: string, type: string, filename?: string) {
  const object = await store.get(key);
  res.type(type);
  if (object.size !== undefined) res.setHeader('Content-Length', String(object.size));
  if (filename) res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await pipeline(object.stream, res);
}
async function ownedAlbum(req: UserRequest, id: string): Promise<Album> {
  const album = await repository.get<Album>('album', id);
  if (!album || (await repository.owner('album', id)) !== req.userId)
    throw new NotFoundException('Không tìm thấy album.');
  return album;
}
async function ownedAudio(req: UserRequest, albumId: string, audioId: string) {
  await ownedAlbum(req, albumId);
  const audio = await repository.get<AudioAsset>('audio', audioId);
  if (
    !audio ||
    audio.albumId !== albumId ||
    (await repository.owner('audio', audioId)) !== req.userId
  )
    throw new NotFoundException('Không tìm thấy nhạc.');
  return audio;
}
function validateReferences(album: Album) {
  const ids = new Set(album.assets.map((a) => a.id));
  for (const page of album.pages)
    for (const e of page.elements)
      if (e.type === 'image' && e.assetId && !/^demo-[123]$/.test(e.assetId) && !ids.has(e.assetId))
        throw new BadRequestException('Ảnh không thuộc album.');
  for (const memory of album.memories)
    if (memory.assetId && !ids.has(memory.assetId) && !/^demo-[123]$/.test(memory.assetId))
      throw new BadRequestException('Ảnh kỉ niệm không thuộc album.');
}

@Controller('api')
class AppController {
  @Get('timeline-heading') async timelineHeading(@Req() req: UserRequest) {
    return journal.heading(req.userId);
  }
  @Patch('timeline-heading') async saveTimelineHeading(
    @Req() req: UserRequest,
    @Body() body: unknown,
  ) {
    return journal.saveHeading(req.userId, body);
  }
  @Get('journal') async journalList(@Req() req: UserRequest) {
    return journal.list(req.userId);
  }
  @Post('journal') async journalCreate(@Req() req: UserRequest, @Body() body: unknown) {
    return journal.create(req.userId, body);
  }
  @Patch('journal/:id') async journalSave(
    @Req() req: UserRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return journal.save(req.userId, id, body);
  }
  @Delete('journal/:id') async journalDelete(
    @Req() req: UserRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return journal.remove(req.userId, id, body);
  }
  @Post('journal/:id/assets')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1048576, files: 1 },
    }),
  )
  async journalUpload(
    @Req() req: UserRequest,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return journal.upload(req.userId, id, file);
  }
  @Get('journal/:id/assets/:assetId') async journalAsset(
    @Req() req: UserRequest,
    @Param('id') id: string,
    @Param('assetId') assetId: string,
    @Res() res: Response,
  ) {
    const entry = await journal.owned(req.userId, id);
    if (!entry.assets.some((a) => a.id === assetId)) throw new NotFoundException();
    await streamObject(res, 'journal/' + assetId + '.jpg', 'jpeg');
  }
  @Delete('journal/:id/assets/:assetId') async journalRemoveAsset(
    @Req() req: UserRequest,
    @Param('id') id: string,
    @Param('assetId') assetId: string,
    @Body() body: unknown,
  ) {
    return journal.removeAsset(req.userId, id, assetId, body);
  }
  @Get('render-capacity') async renderCapacity() {
    const now = await repository.now();
    const workers = await repository.list<{ lastSeen: number }>('worker');
    return { available: workers.some((worker) => now - worker.lastSeen < 15000) };
  }
  @Get('ops/status') async ops(@Req() req: Request) {
    if (!observability.authorized(req.headers.authorization)) throw new NotFoundException();
    return observability.snapshot(repository);
  }
  @Get('ops/metrics') async metrics(@Req() req: Request, @Res() res: Response) {
    if (!observability.authorized(req.headers.authorization)) throw new NotFoundException();
    res.type('text/plain; version=0.0.4').send(await observability.metrics(repository));
  }
  @Get('usage') async usage(@Req() req: UserRequest) {
    return resources.usage(req.userId);
  }
  @Get('health') async health() {
    const now = await repository.now();
    const workers = await repository.list<{ lastSeen: number }>('worker');
    return {
      status: 'ok',
      database: repository.driver,
      storage: store.kind,
      workers: workers.filter((w) => now - w.lastSeen < 15000).length,
      version: '0.2.0',
      backupProtocol: 1,
    };
  }
  @Get('health/ready') async ready() {
    await repository.now();
    await store.ready();
    return { status: 'ready' };
  }

  @Get('session') async session(
    @Req() req: UserRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!req.userId) {
      req.userId = randomUUID();
      await issueSession(res, req.userId);
    }
    const account = (await repository.list<Account>('account', req.userId))[0];
    return {
      id: req.userId,
      email: account?.email ?? null,
      emailVerified: !!account?.emailVerifiedAt,
    };
  }
  @Post('auth/register') async register(
    @Req() req: UserRequest,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = credentialSchema.parse(body);
    const id = req.userId || randomUUID();
    if ((await repository.list<Account>('account', id)).length)
      throw new ConflictException('Bạn đã đăng nhập. Hãy đăng xuất trước khi tạo tài khoản khác.');
    const salt = randomBytes(16).toString('hex');
    const account: Account = {
      id,
      email: input.email,
      salt,
      password: (await passwordHash(input.password, salt)).toString('hex'),
      credentialVersion: 0,
      revision: 0,
    };
    await repository.transaction(async () => {
      if (repository.driver === 'postgresql')
        await repository.query('SELECT pg_advisory_xact_lock(hashtext(?))', ['register:' + id]);
      if (await security.byUser(id))
        throw new ConflictException(
          'Bạn đã đăng nhập. Hãy đăng xuất trước khi tạo tài khoản khác.',
        );
      if (!(await repository.insert('account', hash(input.email), id, account)))
        throw new ConflictException('Email đã được đăng ký.');
    });
    if (req.cookies.scrapbook_session)
      await repository.remove('session', hash(req.cookies.scrapbook_session));
    await issueSession(res, id);
    let verificationEmailSent = true;
    try {
      await security.requestVerification(id);
    } catch {
      verificationEmailSent = false;
    }
    return { id, email: input.email, emailVerified: false, verificationEmailSent };
  }
  @Post('auth/login') async login(
    @Req() req: UserRequest,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = credentialSchema.parse(body);
    const account = await repository.get<Account>('account', hash(input.email));
    if (!(await passwordMatches(input.password, account)) || account?.deletingAt)
      throw new UnauthorizedException('Email hoặc mật khẩu chưa đúng.');
    if (req.cookies.scrapbook_session)
      await repository.remove('session', hash(req.cookies.scrapbook_session));
    await issueSession(res, account!.id, account!.credentialVersion ?? 0);
    return { id: account!.id, email: account!.email, emailVerified: !!account!.emailVerifiedAt };
  }
  @Post('auth/request-verification') async requestVerification(@Req() req: UserRequest) {
    if (!req.userId) throw new UnauthorizedException('Đăng nhập để xác minh email.');
    await security.requestVerification(req.userId);
    return { ok: true, message: 'Kiểm tra email để xác minh tài khoản.' };
  }
  @Post('auth/verify-email') async verifyEmail(@Body() body: unknown) {
    const input = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).parse(body);
    await security.consume(input.token, 'verify-email');
    return { ok: true, message: 'Email đã được xác minh.' };
  }
  @Post('auth/request-reset') async requestReset(@Body() body: unknown) {
    const input = z.object({ email: credentialSchema.shape.email }).parse(body);
    await security.requestReset(input.email);
    return {
      ok: true,
      message: 'Nếu email đã được đăng ký, liên kết đặt lại mật khẩu sẽ được gửi tới hộp thư đó.',
    };
  }
  @Post('auth/reset-password') async resetPassword(
    @Req() req: UserRequest,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = z
      .object({
        token: z.string().regex(/^[a-f0-9]{64}$/),
        password: credentialSchema.shape.password,
      })
      .parse(body);
    const updated = await security.consume(input.token, 'reset-password', input.password);
    if (req.userId === updated.id) res.clearCookie('scrapbook_session', { path: '/' });
    return { ok: true, message: 'Đã đặt lại mật khẩu. Hãy đăng nhập bằng mật khẩu mới.' };
  }
  @Post('auth/change-password') async changePassword(
    @Req() req: UserRequest,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!req.userId) throw new UnauthorizedException('Đăng nhập để đổi mật khẩu.');
    const input = z
      .object({
        currentPassword: credentialSchema.shape.password,
        newPassword: credentialSchema.shape.password,
      })
      .parse(body);
    const updated = await security.changePassword(
      req.userId,
      input.currentPassword,
      input.newPassword,
    );
    await issueSession(res, updated.id, updated.credentialVersion);
    return { ok: true, message: 'Đã đổi mật khẩu và đăng xuất các phiên khác.' };
  }
  @Delete('auth/account') @HttpCode(202) async deleteAccount(
    @Req() req: UserRequest,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!req.userId) throw new UnauthorizedException('Đăng nhập để xóa tài khoản.');
    const input = z
      .object({
        password: credentialSchema.shape.password,
        confirmation: z.literal('XÓA TÀI KHOẢN'),
      })
      .parse(body);
    const receipt = await deletion.request(req.userId, input.password, security);
    res.clearCookie('scrapbook_session', { path: '/' });
    void deletion.tick().catch(() => {});
    return {
      accepted: true,
      receipt,
      message: 'Yêu cầu xóa đã được tiếp nhận. Bạn đã được đăng xuất.',
    };
  }
  @Post('auth/deletion-status') async deletionStatus(@Body() body: unknown) {
    const input = z.object({ receipt: z.string().regex(/^[a-f0-9]{64}$/) }).parse(body);
    return deletion.status(input.receipt);
  }
  @Post('auth/logout') async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (req.cookies.scrapbook_session)
      await repository.remove('session', hash(req.cookies.scrapbook_session));
    res.clearCookie('scrapbook_session', { path: '/' });
    return { ok: true };
  }
  @Get('templates') async templates(@Req() req: UserRequest) {
    return (await repository.list<LayoutTemplate>('layout-template', req.userId)).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }
  @Post('templates') async createTemplate(@Req() req: UserRequest, @Body() body: unknown) {
    const input = layoutTemplateSchema.parse(body);
    if ((await repository.list('layout-template', req.userId)).length >= 100)
      throw new BadRequestException('Tối đa 100 mẫu cá nhân.');
    const template: LayoutTemplate = {
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      page: { ...input.page, elements: input.page.elements.map((e) => ({ ...e, assetId: null })) },
    };
    await repository.put('layout-template', template.id, req.userId, template);
    return template;
  }
  @Delete('templates/:id') async deleteTemplate(@Req() req: UserRequest, @Param('id') id: string) {
    if ((await repository.owner('layout-template', id)) !== req.userId)
      throw new NotFoundException('Không tìm thấy mẫu.');
    await repository.remove('layout-template', id);
    return { ok: true };
  }
  @Get('albums') async albums(@Req() req: UserRequest) {
    return (await repository.list<Album>('album', req.userId)).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  }
  @Post('albums/from-journal') async fromJournal(@Req() req: UserRequest, @Body() body: unknown) {
    return journalAlbums.create(req.userId, body);
  }
  @Post('albums') async create(@Req() req: UserRequest, @Body() body: unknown) {
    const input = z
      .object({
        title: z.string().trim().min(1).max(120).optional(),
        theme: z.enum(['polaroid', 'letter', 'timeline']).optional(),
        templateId: z.enum(builtInTemplates.map((t) => t.id) as [string, ...string[]]).optional(),
      })
      .parse(body ?? {});
    if ((await repository.list('album', req.userId)).length >= 30)
      throw new BadRequestException('Tối đa 30 album cho bản local.');
    const content = createAlbumContent();
    if (input.theme) {
      content.theme = input.theme;
      content.pages = [createPage(input.theme)];
    }
    if (input.title) content.title = input.title;
    if (input.templateId) {
      const template = builtInTemplates.find((t) => t.id === input.templateId)!;
      content.theme = template.theme;
      content.pages = [templatePage(template.id)];
    }
    const album: Album = {
      ...content,
      id: randomUUID(),
      schemaVersion: 1,
      revision: 0,
      assets: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await repository.transaction(async () => {
      if (repository.driver === 'postgresql')
        await repository.query('SELECT pg_advisory_xact_lock(hashtext(?))', [
          'owner-operation:' + req.userId,
        ]);
      if ((await repository.list('album', req.userId)).length >= 30)
        throw new BadRequestException('Tối đa 30 album.');
      await repository.put('album', album.id, req.userId, album);
    });
    return album;
  }
  @Get('albums/:id') async album(@Req() req: UserRequest, @Param('id') id: string) {
    return ownedAlbum(req, id);
  }
  @Patch('albums/:id') async save(
    @Req() req: UserRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const { content, expectedRevision } = saveAlbumSchema.parse(body);
    const before = await ownedAlbum(req, id);
    const album: Album = {
      ...before,
      ...content,
      revision: expectedRevision + 1,
      updatedAt: new Date().toISOString(),
    };
    validateReferences(album);
    if (!(await repository.compareAndSwap('album', id, req.userId, expectedRevision, album)))
      throw new ConflictException(
        'Album đã được sửa ở một phiên khác. Bản nháp của bạn vẫn được giữ.',
      );
    return album;
  }
  @Get('albums/:id/versions') async versions(@Req() req: UserRequest, @Param('id') id: string) {
    const album = await ownedAlbum(req, id);
    return {
      currentRevision: album.revision,
      limit: VERSION_LIMIT,
      versions: await history.list(id, req.userId),
    };
  }
  @Get('albums/:id/versions/:revision') async version(
    @Req() req: UserRequest,
    @Param('id') id: string,
    @Param('revision') revision: string,
  ) {
    await ownedAlbum(req, id);
    const snapshot = await history.get(
      id,
      z.coerce.number().int().nonnegative().parse(revision),
      req.userId,
    );
    if (!snapshot) throw new NotFoundException('Không tìm thấy phiên bản.');
    return snapshot;
  }
  @Post('albums/:id/versions') async checkpoint(
    @Req() req: UserRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    await ownedAlbum(req, id);
    const input = z
      .object({
        expectedRevision: z.number().int().nonnegative(),
        label: z.string().trim().min(1).max(80),
      })
      .parse(body);
    if (!(await history.checkpoint(id, req.userId, input.expectedRevision, input.label)))
      throw new ConflictException('Album đã thay đổi. Tải lại lịch sử trước khi tạo mốc.');
    return this.versions(req, id);
  }
  @Post('albums/:id/versions/:revision/restore') async restoreVersion(
    @Req() req: UserRequest,
    @Param('id') id: string,
    @Param('revision') revision: string,
    @Body() body: unknown,
  ) {
    const input = z.object({ expectedRevision: z.number().int().nonnegative() }).parse(body);
    const before = await ownedAlbum(req, id);
    const snapshot = await history.get(
      id,
      z.coerce.number().int().nonnegative().parse(revision),
      req.userId,
    );
    if (!snapshot) throw new NotFoundException('Không tìm thấy phiên bản.');
    const restored: Album = {
      ...before,
      ...albumContentSchema.parse(snapshot),
      revision: input.expectedRevision + 1,
      updatedAt: new Date().toISOString(),
    };
    validateReferences(restored);
    if (
      !(await repository.compareAndSwap('album', id, req.userId, input.expectedRevision, restored))
    )
      throw new ConflictException('Album đang được sửa ở phiên khác. Tải lại trước khi khôi phục.');
    return restored;
  }
  @Delete('albums/:id') async removeAlbum(@Req() req: UserRequest, @Param('id') id: string) {
    const album = await ownedAlbum(req, id);
    if (
      (await jobs.list(req.userId)).some(
        (j) => j.albumId === id && !['completed', 'failed', 'canceled'].includes(j.status),
      )
    )
      throw new ConflictException('Hãy đợi hoặc hủy video đang xuất trước khi xóa album.');
    const operation = await deletion.begin(req.userId);
    try {
      const relatedJobs = (await jobs.list(req.userId)).filter((job) => job.albumId === id);
      await deletion.track(operation, [
        ...album.assets.map((asset) => 'uploads/' + asset.id + '.webp'),
        ...relatedJobs.flatMap((job) => (job.outputKey ? [job.outputKey] : [])),
      ]);
      await repository.remove('album', id);
      await repository.remove('video-settings', id);
      for (const share of await repository.list<{ id: string; albumId: string }>(
        'share',
        req.userId,
      ))
        if (share.albumId === id) await repository.remove('share', share.id);
      for (const asset of album.assets) await resources.remove(`uploads/${asset.id}.webp`);
      for (const audio of await repository.list<AudioAsset>('audio', req.userId)) {
        if (audio.albumId !== id) continue;
        await repository.remove('audio', audio.id);
        await resources.remove('audio/' + audio.id + '.mp3');
      }
      for (const job of await jobs.list(req.userId)) {
        if (job.albumId !== id) continue;
        await jobs.remove(job.id, req.userId);
        if (job.outputKey) await resources.remove(job.outputKey);
      }
      return { ok: true };
    } finally {
      await deletion.end(operation);
    }
  }
  @Post('albums/:id/assets')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024, files: 1 },
    }),
  )
  async upload(
    @Req() req: UserRequest,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    const before = await ownedAlbum(req, id);
    if (!file) throw new BadRequestException('Chọn một ảnh JPEG, PNG hoặc WebP.');
    if (before.assets.length >= 100) throw new BadRequestException('Album đã đạt 100 ảnh.');
    let result: Awaited<ReturnType<typeof normalizePhoto>>;
    try {
      result = await normalizePhoto(file.buffer, 'webp');
    } catch {
      throw new BadRequestException('Ảnh không hợp lệ; hỗ trợ JPEG/PNG/WebP tối đa 40 megapixel.');
    }
    const assetId = randomUUID();
    const key = `uploads/${assetId}.webp`;
    const operation = await deletion.begin(req.userId, key);
    try {
      await resources.reserve(req.userId, key, result.data.length);
      await store.put(key, result.data, 'image/webp', AbortSignal.timeout(UPLOAD_TIMEOUT_MS));
      for (let attempt = 0; attempt < 5; attempt++) {
        const album = await ownedAlbum(req, id);
        if (album.assets.length >= 100) throw new BadRequestException('Album đã đạt 100 ảnh.');
        album.assets.push({
          id: assetId,
          name: file.originalname.slice(0, 150),
          width: result.info.width,
          height: result.info.height,
          bytes: result.data.length,
          url: `/api/albums/${id}/assets/${assetId}`,
        });
        const expected = album.revision;
        album.revision++;
        album.updatedAt = new Date().toISOString();
        if (await repository.compareAndSwap('album', id, req.userId, expected, album)) return album;
      }
      throw new ConflictException('Album đang thay đổi, vui lòng tải ảnh lại.');
    } catch (e) {
      try {
        await resources.remove(key);
      } catch {
        console.error('Deferred image cleanup.');
      }
      throw e;
    } finally {
      await deletion.end(operation);
    }
  }
  @Get('albums/:id/assets/:assetId') async asset(
    @Req() req: UserRequest,
    @Param('id') id: string,
    @Param('assetId') assetId: string,
    @Res() res: Response,
  ) {
    const album = await ownedAlbum(req, id);
    if (!album.assets.some((a) => a.id === assetId)) throw new NotFoundException();
    res.setHeader('Cache-Control', 'private, max-age=3600');
    await streamObject(res, `uploads/${assetId}.webp`, 'webp');
  }
  @Get('demo/:file') async demo(@Param('file') file: string, @Res() res: Response) {
    if (!/^[123]\.svg$/.test(file)) throw new NotFoundException();
    res.type('svg').sendFile(path.resolve('apps/web/public/illustrations', `demo-${file}`));
  }
  @Get('albums/:id/video-settings') async videoSettings(
    @Req() req: UserRequest,
    @Param('id') id: string,
  ) {
    const album = await ownedAlbum(req, id);
    const saved = await repository.get<VideoConfig>('video-settings', id);
    if (!saved) return { config: null };
    const validIds = saved.pageIds.filter((pageId) => album.pages.some((p) => p.id === pageId));
    const pageIds = validIds.length ? validIds : [album.pages[0].id];
    const config: VideoConfig = {
      ...saved,
      pageIds,
      sceneDurations: saved.sceneDurations
        ? Object.fromEntries(pageIds.map((pageId) => [pageId, saved.sceneDurations![pageId] ?? 5]))
        : undefined,
    };
    if (config.musicId === 'custom') {
      const audio = await repository.get<AudioAsset>('audio', config.audioId!);
      if (
        !audio ||
        audio.albumId !== id ||
        (await repository.owner('audio', audio.id)) !== req.userId
      )
        config.musicId = 'none';
    }
    return { config };
  }
  @Patch('albums/:id/video-settings') async saveVideoSettings(
    @Req() req: UserRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const album = await ownedAlbum(req, id),
      config = videoConfigSchema.parse(body);
    if (config.pageIds.some((pageId) => !album.pages.some((p) => p.id === pageId)))
      throw new BadRequestException('Trang video không tồn tại.');
    if (config.musicId === 'custom') {
      const audio = await ownedAudio(req, id, config.audioId!);
      if (config.audioEnd! > audio.duration + 0.001)
        throw new BadRequestException('Đoạn cắt vượt thời lượng file nhạc.');
    }
    await repository.put('video-settings', id, req.userId, config);
    return { config };
  }
  @Get('albums/:id/audio') async audioList(@Req() req: UserRequest, @Param('id') id: string) {
    await ownedAlbum(req, id);
    return (await repository.list<AudioAsset>('audio', req.userId)).filter((a) => a.albumId === id);
  }
  @Post('albums/:id/audio')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_AUDIO_BYTES, files: 1 },
    }),
  )
  async uploadAudio(
    @Req() req: UserRequest,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    await ownedAlbum(req, id);
    if (!file) throw new BadRequestException('Chọn nhạc MP3, WAV hoặc M4A.');
    const list = (await repository.list<AudioAsset>('audio', req.userId)).filter(
      (a) => a.albumId === id,
    );
    if (list.length >= 10)
      throw new BadRequestException('Mỗi album tối đa 10 bản nhạc. Xóa nhạc cũ để thêm bản mới.');
    let result: Awaited<ReturnType<typeof normalizeAudio>>;
    try {
      result = await normalizeAudio(file.buffer);
    } catch (error) {
      if (error instanceof InvalidAudioError) throw new BadRequestException(error.message);
      throw error;
    }
    const audioId = randomUUID(),
      key = 'audio/' + audioId + '.mp3';
    const audio: AudioAsset = {
      waveform: result.waveform,
      id: audioId,
      albumId: id,
      name: file.originalname.slice(0, 150),
      duration: result.duration,
      bytes: result.bytes.length,
      url: '/api/albums/' + id + '/audio/' + audioId,
    };
    const operation = await deletion.begin(req.userId, key);
    try {
      await resources.reserve(req.userId, key, result.bytes.length);
      await store.put(key, result.bytes, 'audio/mpeg', AbortSignal.timeout(UPLOAD_TIMEOUT_MS));
      await ownedAlbum(req, id);
      await repository.put('audio', audioId, req.userId, audio);
      return audio;
    } catch (error) {
      try {
        await resources.remove(key);
      } catch {
        console.error('Deferred audio cleanup.');
      }
      throw error;
    } finally {
      await deletion.end(operation);
    }
  }
  @Get('albums/:id/audio/:audioId') async audioFile(
    @Req() req: UserRequest,
    @Param('id') id: string,
    @Param('audioId') audioId: string,
    @Res() res: Response,
  ) {
    await ownedAudio(req, id, audioId);
    const bytes = await store.read('audio/' + audioId + '.mp3', MAX_AUDIO_BYTES);
    res
      .type('audio/mpeg')
      .set({ 'Cache-Control': 'private, max-age=3600', 'Accept-Ranges': 'bytes' });
    let range: ReturnType<typeof byteRange>;
    try {
      range = byteRange(req.headers.range, bytes.length);
    } catch {
      res
        .status(416)
        .set('Content-Range', 'bytes */' + bytes.length)
        .end();
      return;
    }
    if (range)
      res
        .status(206)
        .set('Content-Range', 'bytes ' + range.start + '-' + range.end + '/' + bytes.length)
        .send(bytes.subarray(range.start, range.end + 1));
    else res.send(bytes);
  }
  @Delete('albums/:id/audio/:audioId') async removeAudio(
    @Req() req: UserRequest,
    @Param('id') id: string,
    @Param('audioId') audioId: string,
  ) {
    await ownedAudio(req, id, audioId);
    if (
      (await jobs.list(req.userId)).some(
        (j) =>
          j.albumId === id &&
          j.config.audioId === audioId &&
          !['completed', 'failed', 'canceled'].includes(j.status),
      )
    )
      throw new ConflictException('Nhạc đang được dùng để xuất video. Hãy đợi hoặc hủy tác vụ.');
    await repository.remove('audio', audioId);
    await resources.remove('audio/' + audioId + '.mp3');
    return { ok: true };
  }
  @Get('albums/:id/exports') async exports(@Req() req: UserRequest, @Param('id') id: string) {
    await ownedAlbum(req, id);
    return (await jobs.list(req.userId))
      .filter((j) => j.albumId === id)
      .map(publicJob)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  @Post('albums/:id/exports') async createExport(
    @Req() req: UserRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = z
      .object({
        expectedRevision: z.number().int(),
        config: videoConfigSchema,
        idempotencyKey: z.string().uuid(),
      })
      .parse(body);
    const album = await ownedAlbum(req, id);
    const existing = await jobs.get(input.idempotencyKey, req.userId);
    if (existing) return publicJob(existing);
    if (album.revision !== input.expectedRevision)
      throw new ConflictException('Lưu bản chỉnh sửa mới nhất trước khi xuất.');
    if (input.config.pageIds.some((p) => !album.pages.some((page) => page.id === p)))
      throw new BadRequestException('Trang video không tồn tại.');
    if (new Set(input.config.pageIds).size !== input.config.pageIds.length)
      throw new BadRequestException('Trang video bị trùng.');
    const pending = await jobs.list();
    if (pending.filter((j) => !['completed', 'failed', 'canceled'].includes(j.status)).length >= 20)
      throw new HttpException('Hàng đợi đang đầy, hãy thử lại sau.', HttpStatus.TOO_MANY_REQUESTS);
    if (
      pending.some(
        (j) => j.albumId === id && !['completed', 'failed', 'canceled'].includes(j.status),
      )
    )
      throw new ConflictException('Album đã có một video đang xuất.');
    validateReferences(album);
    if (
      album.pages.some(
        (p) =>
          input.config.pageIds.includes(p.id) &&
          p.elements.some(
            (e) => e.type === 'image' && e.visible !== false && e.photoStyle === 'cutout',
          ),
      )
    ) {
      const workers = await repository.list<{ lastSeen: number; photoStylesVersion?: number }>(
          'worker',
        ),
        now = await repository.now();
      const live = workers.filter((w) => now - w.lastSeen < 15000);
      if (!live.length || live.some((w) => w.photoStylesVersion !== 1))
        throw new HttpException(
          'Ảnh tách nền chưa sẵn sàng xuất video. Vui lòng thử lại sau khi bộ xuất được cập nhật.',
          503,
        );
    }
    if (['warm-piano', 'little-waltz', 'evening'].includes(input.config.musicId)) {
      const workers = await repository.list<{ lastSeen: number; musicCatalogVersion?: number }>(
          'worker',
        ),
        now = await repository.now(),
        live = workers.filter((w) => now - w.lastSeen < 15000);
      if (!live.length || live.some((w) => w.musicCatalogVersion !== 1))
        throw new HttpException(
          'Bản nhạc này chưa sẵn sàng xuất. Hãy chọn Chuông gió hoặc thử lại sau khi hệ thống xuất video được cập nhật.',
          503,
        );
    }
    const audioAsset =
      input.config.musicId === 'custom'
        ? await ownedAudio(req, id, input.config.audioId!)
        : undefined;
    if (audioAsset && input.config.audioEnd! > audioAsset.duration + 0.001)
      throw new BadRequestException('Đoạn cắt vượt thời lượng file nhạc.');
    const job: ExportJob = {
      ...(audioAsset ? { audioAsset } : {}),
      id: input.idempotencyKey,
      albumId: id,
      status: 'queued',
      progress: 0,
      createdAt: new Date().toISOString(),
      snapshot: album,
      config: input.config,
      referenceDate: todayIn(album.timezone),
      assetData: {},
    };
    if (
      !(await resources.createExport(
        job,
        req.userId,
        jobs,
        Math.ceil(videoDurationFrames(job.config) / 30),
      ))
    ) {
      const duplicate = await jobs.get(job.id, req.userId);
      if (duplicate) return publicJob(duplicate);
      throw new ConflictException('Bạn đã có một video đang xuất. Hãy đợi hoặc hủy tác vụ đó.');
    }
    return publicJob((await jobs.get(job.id, req.userId))!);
  }
  @Get('exports/:id') async export(@Req() req: UserRequest, @Param('id') id: string) {
    const job = await jobs.get(id, req.userId);
    if (!job) throw new NotFoundException();
    return publicJob(job);
  }
  @Post('exports/:id/cancel') async cancel(@Req() req: UserRequest, @Param('id') id: string) {
    const job = await jobs.cancel(id, req.userId);
    if (!job) throw new NotFoundException();
    return publicJob(job);
  }
  @Get('exports/:id/download') async download(
    @Req() req: UserRequest,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const job = await jobs.get(id, req.userId);
    if (!job) throw new NotFoundException();
    if (job.status !== 'completed' || !job.outputKey)
      throw new BadRequestException('Video chưa sẵn sàng.');
    await streamObject(res, job.outputKey, 'video/mp4', 'ngay-minh-ben-nhau.mp4');
  }
  @Post('albums/:id/share') async share(@Req() req: UserRequest, @Param('id') id: string) {
    await ownedAlbum(req, id);
    const token = randomBytes(24).toString('hex');
    const record = { id: hash(token), albumId: id };
    await repository.put('share', record.id, req.userId, record);
    return { token, id: record.id };
  }
  @Delete('albums/:id/share') async revoke(@Req() req: UserRequest, @Param('id') id: string) {
    await ownedAlbum(req, id);
    for (const share of await repository.list<{ id: string; albumId: string }>('share', req.userId))
      if (share.albumId === id) await repository.remove('share', share.id);
    return { ok: true };
  }
  @Get('shared/:token') async shared(@Param('token') token: string) {
    const share = await repository.get<{ albumId: string }>('share', hash(token));
    const album = share && (await repository.get<Album>('album', share.albumId));
    if (!album) throw new NotFoundException('Link đã được thu hồi hoặc album không còn tồn tại.');
    return {
      ...album,
      assets: album.assets.map((a) => ({ ...a, url: `/api/shared/${token}/assets/${a.id}` })),
    };
  }
  @Get('shared/:token/assets/:id') async sharedAsset(
    @Param('token') token: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const album = await this.shared(token);
    if (!album.assets.some((a) => a.id === id)) throw new NotFoundException();
    res.setHeader('Cache-Control', 'no-store');
    await streamObject(res, `uploads/${id}.webp`, 'webp');
  }
}

@Module({ controllers: [AppController] })
class AppModule {}
await repository.init();
await backupLock.init();
await history.init();
await jobs.init();
await security.init();
await deletion.init();
await resources.init();
await store.ready();
await resources.reconcile();
await deletion.start();
await mkdir(dataDir, { recursive: true });
const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
app.use(observability.middleware);
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
const proxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
if (!Number.isInteger(proxyHops) || proxyHops < 0 || proxyHops > 5)
  throw new Error('TRUST_PROXY_HOPS phải từ 0 đến 5.');
app.getHttpAdapter().getInstance().set('trust proxy', proxyHops);
const authRateLimit = Number(process.env.AUTH_RATE_LIMIT_PER_MINUTE || 30);
if (!Number.isInteger(authRateLimit) || authRateLimit < 1 || authRateLimit > 1000)
  throw new Error('AUTH_RATE_LIMIT_PER_MINUTE phải từ 1 đến 1000.');
app.use('/api', async (req: UserRequest, res: Response, next: NextFunction) => {
  try {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    if (
      (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) ||
        req.path === '/session' ||
        req.path.startsWith('/auth/')) &&
      (await backupLock.paused())
    )
      return res.status(503).set('Retry-After', '15').json({
        message: 'Đang sao lưu dữ liệu. Vui lòng thử lưu lại sau ít phút.',
        code: 'BACKUP_IN_PROGRESS',
      });
    const origin = req.headers.origin;
    const allowed = new Set([
      process.env.APP_ORIGIN || 'http://127.0.0.1:5173',
      'http://localhost:5173',
      'http://127.0.0.1:3001',
      'http://localhost:3001',
    ]);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && origin && !allowed.has(origin))
      return res.status(403).json({ message: 'Nguồn yêu cầu không được phép.' });
    if (req.path.startsWith('/auth/'))
      await security.rateLimit('ip:' + req.ip, authRateLimit, 60000);
    const token = req.cookies.scrapbook_session;
    const session = token && (await repository.get<Session>('session', hash(token)));
    if (await security.validSession(session || undefined)) req.userId = session!.userId;
    const publicPath =
      req.path === '/health' ||
      req.path === '/health/ready' ||
      req.path.startsWith('/ops/') ||
      req.path === '/session' ||
      req.path.startsWith('/auth/') ||
      req.path.startsWith('/demo/') ||
      req.path.startsWith('/shared/');
    if (!publicPath && !req.userId)
      return res.status(401).json({ message: 'Phiên đã hết hạn. Hãy tải lại hoặc đăng nhập.' });
    next();
  } catch (e) {
    if (e instanceof AuthError) {
      res.status(e.status).json({ message: e.message });
      return;
    }
    next(e);
  }
});
app.useGlobalFilters({
  catch(exception: unknown, host) {
    const res = host.switchToHttp().getResponse<Response>();
    if (res.headersSent) {
      res.destroy();
      return;
    }
    if (exception instanceof Error && exception.message.includes('account_deleting'))
      return res.status(401).json({ message: 'Tài khoản đang được xóa.' });
    if (exception instanceof AuthError)
      return res.status(exception.status).json({ message: exception.message });
    if (exception instanceof ObjectNotFoundError)
      return res.status(404).json({ message: exception.message });
    if (exception instanceof ZodError)
      return res.status(400).json({
        message: exception.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      });
    if (exception instanceof HttpException)
      return res.status(exception.getStatus()).json({
        message:
          typeof exception.getResponse() === 'string'
            ? exception.getResponse()
            : (exception.getResponse() as { message: unknown }).message,
      });
    logEvent('http_error', {
      requestId: String(res.getHeader('X-Request-Id') || ''),
      category: 'unexpected',
      ...errorDiagnostics(exception),
    });
    res.status(500).json({ message: 'Có lỗi xử lý. Vui lòng thử lại.' });
  },
});
if (process.env.NODE_ENV === 'production') {
  app.use(
    '/background-removal',
    express.static(path.resolve('dist/background-removal'), { maxAge: '1y', immutable: true }),
  );
  app.use(express.static(path.resolve('dist')));
  app.use((req: Request, res: Response, next: NextFunction) =>
    req.method === 'GET' && !req.path.startsWith('/api')
      ? res.sendFile(path.resolve('dist/index.html'))
      : next(),
  );
}
const queue = new RenderQueue(repository, jobs, store, dataDir, {
  paused: () => backupLock.paused(),
  operations: deletion,
  resources,
});
if (process.env.RENDER_WORKER_MODE === 'inline' && process.env.DISABLE_RENDER_WORKER !== 'true')
  await queue.start();
maintenance.start();
await opsMonitor.init();
await app.listen(Number(process.env.PORT || 3001), process.env.HOST || '127.0.0.1');
opsMonitor.start();
console.log(`Scrapbook API: http://${process.env.HOST || '127.0.0.1'}:${process.env.PORT || 3001}`);
let shuttingDown = false;
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    void app
      .close()
      .then(() => queue.stop())
      .then(() => deletion.stop())
      .then(() => maintenance.stop())
      .then(() => opsMonitor.stop())
      .then(() => repository.close())
      .then(() => {
        store.close();
        mailer.close();
        process.exit(0);
      });
  });
