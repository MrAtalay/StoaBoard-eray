// Python karşılığı: app/routes/api.py'deki task/subtask/comment endpoint'leri
//
//   GET    /api/projects/:projectId/tasks         list project tasks
//   POST   /api/projects/:projectId/tasks         create task (+ assignees, labels, notif)
//   GET    /api/tasks/:taskId                     task detail
//   PATCH  /api/tasks/:taskId                     update task (column move, assignees, labels)
//   DELETE /api/tasks/:taskId                     delete task (cascades)
//
//   GET    /api/tasks/:taskId/subtasks            list
//   POST   /api/tasks/:taskId/subtasks            add
//   PATCH  /api/subtasks/:subtaskId               update + auto progress
//   DELETE /api/subtasks/:subtaskId               delete
//
//   GET    /api/tasks/:taskId/comments            list
//   POST   /api/tasks/:taskId/comments            add (+ assignee/mention notifs)
//   DELETE /api/comments/:commentId               delete (own only)

import { Router } from 'express';

import { prisma } from '../db.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../lib/session.js';
import { memberForWorkspace, hasPermission } from '../lib/workspace.js';
import {
  taskToDict,
  taskToDetailDict,
  subtaskToDict,
  commentToDict,
} from '../lib/serializers.js';
import {
  parseDate,
  nextTaskPosition,
  logActivity,
  recalcTaskProgress,
} from '../lib/projects.js';
import { buildNotificationText, createAndPush } from '../lib/notifications.js';
import { recordTransition } from '../lib/reporting.js';
import { reqLang } from '../lib/lang.js';
import { atananlariDenetle, atamaSluglari } from '../lib/assignees.js';
import { bahsedilenleriCoz } from '../lib/mentions.js';
import { docKontrolListesiVarMi, ilerlemeHesapla } from '../lib/checklist.js';

export const projectTasksRouter = Router({ mergeParams: true }); // /projects/:projectId/tasks
export const tasksRouter = Router();         // /tasks/:taskId
export const subtasksRouter = Router();      // /subtasks/:subtaskId
export const commentsRouter = Router();      // /comments/:commentId

// Task'ın detail için full include
const TASK_FULL_INCLUDE = {
  column: true,
  creator: true,
  assignees: { include: { user: true } },
  labelLinks: { include: { label: true } },
  subtasks: { orderBy: { position: 'asc' } },
  comments: { include: { user: true }, orderBy: { createdAt: 'asc' } },
};

// Task list için hafif include (taskToDict yeterli alır)
const TASK_LIST_INCLUDE = {
  column: true,
  creator: true,
  assignees: { include: { user: true } },
  labelLinks: { include: { label: true } },
  subtasks: true,
  comments: { select: { id: true } },
};

async function loadUser(req) {
  const uid = req.session?.userId;
  if (!uid) return null;
  return prisma.user.findUnique({ where: { id: uid } });
}

/**
 * Task'ı yükle ve workspace erişim/izin kontrolü yap.
 * `permission` verilirse manage_tasks gibi izin gerektirir; verilmezse sadece üye olmak yeter.
 */
async function loadTaskWithAccess(req, res, taskId, { permission = null, include = null } = {}) {
  const user = await loadUser(req);
  if (!user) {
    res.status(401).json({ error: 'err_auth_required' });
    return { denied: true };
  }
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: include || TASK_LIST_INCLUDE,
  });
  if (!task) {
    res.status(404).json({ error: 'err_task_not_found', message: 'Görev bulunamadı' });
    return { denied: true };
  }
  const project = await prisma.project.findUnique({
    where: { id: task.projectId },
  });
  if (!project) {
    res.status(404).json({ error: 'err_project_not_found', message: 'Proje bulunamadı' });
    return { denied: true };
  }
  const member = await memberForWorkspace(user.id, project.workspaceId);
  if (!member) {
    res.status(403).json({ error: 'err_project_forbidden', message: 'Bu projeye erişiminiz yok' });
    return { denied: true };
  }
  if (permission && !hasPermission(member, permission)) {
    res.status(403).json({ error: 'err_action_forbidden', message: 'Bu işlem için yetkiniz yok' });
    return { denied: true };
  }
  return { denied: false, user, task, project, member };
}

// ─── Atama denetimi ────────────────────────────────────────────────────────

/**
 * Atama listesini çözer ve alan üyeliğine göre denetler — atama yazan iki uç
 * (görev oluşturma, görev güncelleme) da buradan geçiyor. Kural ve iki
 * istisnası `lib/assignees.js`in başında.
 *
 * İşlem başlamadan çağrılır: reddedilen bir atanan, kartın öbür alanlarının
 * yarım yazılmasına yol açmasın. Sorgular toplu — eskiden her slug için
 * işlemin içinde ayrı bir `findUnique` atılıyordu.
 *
 * Alan bilinmiyorsa (`workspaceId` boş) üye kümesi boş kalır ve hiçbir yeni
 * atanan geçmez: kapalı başarısızlık.
 */
async function atamalariCoz(girdi, { workspaceId, mevcutIdler } = {}) {
  const istenen = atamaSluglari(girdi);
  if (!istenen.length) return { gecerli: [], reddedilen: [] };
  const kullanicilar = await prisma.user.findMany({
    where: { slug: { in: istenen } },
    select: { id: true, slug: true },
  });
  const uyeler = workspaceId == null ? [] : await prisma.workspaceMember.findMany({
    where: { workspaceId, userId: { in: kullanicilar.map((k) => k.id) } },
    select: { userId: true },
  });
  return atananlariDenetle({
    istenen,
    kullanicilar,
    uyeIdleri: new Set(uyeler.map((u) => u.userId)),
    mevcutIdler,
  });
}

/**
 * Reddedilen atananlar için yanıt. Slug'lar istemcinin kendi gönderdikleri;
 * geri vermek yeni bilgi sızdırmıyor, çünkü "yok" ile "üye değil" aynı daldan
 * geliyor (`lib/assignees.js`).
 */
function atamaReddi(res, reddedilen) {
  return res.status(400).json({
    error: 'err_assignee_not_member',
    message: 'Atanan kişi bu çalışma alanının üyesi değil',
    invalid_assignees: reddedilen,
  });
}

// ─── GET /projects/:projectId/tasks ────────────────────────────────────────

projectTasksRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const projectId = parseInt(req.params.projectId, 10);
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return res.status(404).json({ error: 'err_project_not_found', message: 'Proje bulunamadı' });
    const member = await memberForWorkspace(user.id, project.workspaceId);
    if (!member) return res.status(403).json({ error: 'err_project_forbidden', message: 'Bu projeye erişiminiz yok' });

    const tasks = await prisma.task.findMany({
      where: { projectId, deletedAt: null },
      include: TASK_LIST_INCLUDE,
      orderBy: { position: 'asc' },
    });
    res.json(tasks.map(taskToDict));
  }),
);

// ─── POST /projects/:projectId/tasks ───────────────────────────────────────

projectTasksRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const projectId = parseInt(req.params.projectId, 10);
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { columns: { orderBy: { position: 'asc' } } },
    });
    if (!project) return res.status(404).json({ error: 'err_project_not_found', message: 'Proje bulunamadı' });

    const member = await memberForWorkspace(user.id, project.workspaceId);
    if (!hasPermission(member, 'manage_tasks')) {
      return res.status(403).json({ error: 'err_create_task_forbidden', message: 'Görev oluşturma yetkiniz yok' });
    }

    const data = req.body || {};
    const title = (data.title || '').trim();
    if (!title) return res.status(400).json({ error: 'err_title_required', message: 'Başlık zorunludur' });

    // Atananlar işlem başlamadan denetleniyor; kural ve istisnaları lib/assignees.js'te.
    const atama = await atamalariCoz(data.assignees, { workspaceId: project.workspaceId });
    if (atama.reddedilen.length) return atamaReddi(res, atama.reddedilen);

    const colSlug = data.col || 'todo';
    let col = project.columns.find((c) => c.slug === colSlug);
    if (!col) col = project.columns[0] || null;

    const position = await nextTaskPosition(projectId, col?.id || null);

    const io = req.app.get('io');

    const created = await prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          columnId: col?.id || null,
          projectId,
          title,
          description: data.desc || data.description || '',
          priority: data.priority || 'mid',
          // Yeni kartın alt görevi yok; bitmiş kolona açılıyorsa 100.
          progress: ilerlemeHesapla({ altlar: [], kolonBitti: col?.isDone === true }),
          dueDate: parseDate(data.due),
          startDate: parseDate(data.start),
          assigneeDates: data.assignee_dates || null,
          createdBy: user.id,
          position,
        },
      });

      // Etiketler
      for (const slug of data.labels || []) {
        const label = await tx.label.findFirst({ where: { projectId, slug } });
        if (label) {
          await tx.taskLabel.create({
            data: { taskId: task.id, labelId: label.id },
          });
        }
      }

      // Atamalar — liste işlemden önce denetlendi (atamalariCoz); burada yalnızca yazılıyor.
      const notifsToPush = [];
      for (const assignee of atama.gecerli) {
        await tx.taskAssignee.create({
          data: { taskId: task.id, userId: assignee.id },
        });
        if (assignee.id !== user.id) {
          notifsToPush.push({
            userId: assignee.id,
            text: buildNotificationText('task_assigned', {
              task: title,
              who: user.name,
            }),
            senderSlug: user.slug,
            workspaceId: project.workspaceId,
            taskId: task.id,
          });
        }
      }

      await logActivity(
        tx,
        projectId,
        user.id,
        buildNotificationText('task_created', { title }),
      );

      // Kartın ilk yerleşimi de bir geçiştir (fromCol = null). Akış raporundaki
      // "iş nerede başladı" ve kolon bekleme süresi hesabı buna dayanıyor.
      await recordTransition(tx, {
        task: { id: task.id, title, projectId },
        project,
        user,
        fromCol: null,
        toCol: col,
      });

      return { task, notifsToPush };
    });

    // Notifs transaction dışında, çünkü createAndPush io.emit yapıyor.
    for (const n of created.notifsToPush) {
      await createAndPush(io, n);
    }

    // Tam veri (assignee + label join) yeniden çek
    const full = await prisma.task.findUnique({
      where: { id: created.task.id },
      include: TASK_LIST_INCLUDE,
    });
    res.status(201).json(taskToDict(full));
  }),
);

// ─── GET /tasks/:taskId ────────────────────────────────────────────────────

tasksRouter.get(
  '/:taskId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const taskId = parseInt(req.params.taskId, 10);
    const access = await loadTaskWithAccess(req, res, taskId, {
      include: TASK_FULL_INCLUDE,
    });
    if (access.denied) return;
    res.json(taskToDetailDict(access.task));
  }),
);

// ─── PATCH /tasks/:taskId ──────────────────────────────────────────────────

tasksRouter.patch(
  '/:taskId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const taskId = parseInt(req.params.taskId, 10);
    const access = await loadTaskWithAccess(req, res, taskId, {
      permission: 'manage_tasks',
    });
    if (access.denied) return;

    const { user, task, project } = access;
    const data = req.body || {};
    const updates = {};

    if (typeof data.title === 'string') {
      const t = data.title.trim();
      if (t) updates.title = t;
    }
    if ('desc' in data || 'description' in data) {
      updates.description = data.desc ?? data.description ?? '';
    }
    if ('priority' in data) updates.priority = data.priority;
    // `progress` gövdeden BİLEREK okunmuyor. İlerleme sunucuda türetiliyor
    // (`recalcTaskProgress`); eskiden çekmece onu `doc`taki listeden kendisi
    // hesaplayıp buraya gönderiyordu ve alt görev tablosunun hesabını eziyordu.
    // Kabul edilseydi, dağıtımdan önce açılmış bir sekme ikinci üreticiyi geri
    // getirirdi.
    if ('due' in data) updates.dueDate = parseDate(data.due);
    if ('start' in data) updates.startDate = parseDate(data.start);
    if ('assignee_dates' in data) {
      updates.assigneeDates = data.assignee_dates || null;
    }

    if ('doc' in data) {
      // Kontrol listesi taşıyan `doc` REDDEDİLİYOR, sessizce ayıklanmıyor.
      // Yapılacaklar yalnızca `subtasks` tablosunda (lib/checklist.js). Bu
      // gövdeyi bugün yalnızca dağıtımdan önce açılmış bir sekme gönderir;
      // ayıklansaydı o kullanıcının işaretledikleri hata vermeden kaybolurdu.
      if (docKontrolListesiVarMi(data.doc)) {
        return res.status(400).json({
          error: 'err_doc_checklist_retired',
          message: 'Yapılacaklar artık alt görev olarak saklanıyor; sayfayı yenileyip yeniden deneyin',
        });
      }
      if (Array.isArray(data.doc)) {
        updates.doc = data.doc;
        // description'ı doc'taki text bloklarından senkronize et
        const textParts = data.doc
          .filter((b) => ['p', 'h1', 'h2', 'h3'].includes(b?.kind) && b?.text)
          .map((b) => b.text);
        updates.description = textParts.join(' ').slice(0, 1000);
      } else {
        updates.doc = null;
      }
    }

    // Column move (+ aktivite log + geçiş kaydı + ilerlemenin yeniden türetilmesi)
    let movedActivity = null;
    let moveFromCol = null;
    let moveToCol = null;
    if ('col' in data) {
      const newCol = await prisma.boardColumn.findFirst({
        where: { projectId: task.projectId, slug: data.col },
      });
      if (newCol && newCol.id !== task.columnId) {
        const fromCol = task.column || null;

        // Kolon geçiş kuralı: kaynak kolonun allowedNext listesi doluysa yalnızca
        // oradaki slug'lara geçilebilir. null/boş ise kısıt yok — varsayılan davranış
        // korunur, yani kural tanımlamayan mevcut panolar aynen çalışmaya devam eder.
        const allowedNext = Array.isArray(fromCol?.allowedNext) ? fromCol.allowedNext : null;
        if (allowedNext && allowedNext.length && !allowedNext.includes(newCol.slug)) {
          // Mesaj kolon adlarını içerdiği için istemcide çevrilemiyor; cümle
          // burada, isteğin dilinde kuruluyor. Kolon başlıkları da iki dilde
          // saklanıyor (title / titleTr), o yüzden ad da dile göre seçiliyor.
          const lang = reqLang(req);
          const ad = (c) => (lang === 'en' ? (c.title || c.titleTr) : (c.titleTr || c.title));
          return res.status(409).json({
            error: 'err_transition_not_allowed',
            message: lang === 'en'
              ? `Cannot move from "${ad(fromCol)}" to "${ad(newCol)}".`
              : `"${ad(fromCol)}" kolonundan "${ad(newCol)}" kolonuna geçilemez.`,
            allowed_next: allowedNext,
          });
        }

        updates.columnId = newCol.id;
        moveFromCol = fromCol;
        moveToCol = newCol;
        // İlerleme burada YAZILMIYOR; kolon değiştikten sonra işlemin içinde
        // `recalcTaskProgress` türetiyor (bitmiş kolon 100, değilse alt görev
        // oranı, alt görev yoksa 0). Eskiden girişte 100 yazılıyor, çıkışta
        // yalnızca ilerleme 100 ise ve alt görev varsa hesaplanıyordu — alt
        // görevsiz kart "tamamlandı"dan çıkınca %100'de kalıyordu.
        if (newCol.isDone) {
          // İlk tamamlanma anı yazılır. İki farklı "tamamlandı" kolonu arasında
          // gezinirken ilk tamamlanma zamanı korunur, aksi halde akış raporundaki
          // tamamlanma süresi her taşımada sıfırlanırdı.
          if (!task.completedAt) updates.completedAt = new Date();
        } else if (task.completedAt) {
          // "Tamamlandı"dan çıktı: iş yeniden açıldı, tamamlanma zamanı silinir.
          updates.completedAt = null;
        }
        movedActivity = buildNotificationText('task_moved', {
          task: data.title?.trim() || task.title,
          col: newCol.titleTr || newCol.title,
        });
      }
    }

    // Atananlar işlem başlamadan denetleniyor. Kartta zaten atanmış kişi
    // korunur, alandan çıkarılmış olsa bile — ayrıntı lib/assignees.js'te.
    let atama = null;
    if (Array.isArray(data.assignees)) {
      atama = await atamalariCoz(data.assignees, {
        workspaceId: project.workspaceId,
        mevcutIdler: new Set(task.assignees.map((a) => a.userId)),
      });
      if (atama.reddedilen.length) return atamaReddi(res, atama.reddedilen);
    }

    const io = req.app.get('io');
    const notifsToPush = [];

    await prisma.$transaction(async (tx) => {
      if (Object.keys(updates).length) {
        await tx.task.update({ where: { id: taskId }, data: updates });
      }

      if (Array.isArray(data.labels)) {
        await tx.taskLabel.deleteMany({ where: { taskId } });
        for (const slug of data.labels) {
          const label = await tx.label.findFirst({
            where: { projectId: task.projectId, slug },
          });
          if (label) {
            await tx.taskLabel.create({
              data: { taskId, labelId: label.id },
            });
          }
        }
      }

      if (atama) {
        const oldIds = new Set(task.assignees.map((a) => a.userId));
        await tx.taskAssignee.deleteMany({ where: { taskId } });
        const newIds = new Set();
        for (const k of atama.gecerli) {
          await tx.taskAssignee.create({
            data: { taskId, userId: k.id },
          });
          newIds.add(k.id);
        }
        for (const newId of newIds) {
          if (!oldIds.has(newId) && newId !== user.id) {
            notifsToPush.push({
              userId: newId,
              text: buildNotificationText('task_assigned', {
                task: updates.title || task.title,
                who: user.name,
              }),
              taskId,
              senderSlug: user.slug,
              workspaceId: project.workspaceId,
            });
          }
        }
      }

      if (movedActivity) {
        await logActivity(tx, task.projectId, user.id, movedActivity);
      }
      // Geçiş kaydı: raporlamanın temel verisi. ActivityLog serbest metin ve
      // göreve bağlı değil; bu kayıt görev/kişi/kolon kırılımıyla sorgulanabilir
      // ve görev silinse bile yaşar.
      if (moveToCol) {
        await recordTransition(tx, {
          task: {
            id: taskId,
            title: updates.title || task.title,
            projectId: task.projectId,
          },
          project,
          user,
          fromCol: moveFromCol,
          toCol: moveToCol,
        });
      }
      if (moveToCol) {
        await recalcTaskProgress(tx, taskId);
      }
    });

    for (const n of notifsToPush) await createAndPush(io, n);

    const updated = await prisma.task.findUnique({
      where: { id: taskId },
      include: TASK_LIST_INCLUDE,
    });
    res.json(taskToDict(updated));
  }),
);

// ─── DELETE /tasks/:taskId — soft delete ────────────────────────────────────

tasksRouter.delete(
  '/:taskId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const taskId = parseInt(req.params.taskId, 10);
    const access = await loadTaskWithAccess(req, res, taskId, { permission: 'manage_tasks' });
    if (access.denied) return;
    await prisma.task.update({ where: { id: taskId }, data: { deletedAt: new Date() } });
    res.json({ ok: true });
  }),
);

// ─── POST /tasks/:taskId/restore ────────────────────────────────────────────

tasksRouter.post(
  '/:taskId/restore',
  requireAuth,
  asyncHandler(async (req, res) => {
    const taskId = parseInt(req.params.taskId, 10);
    const access = await loadTaskWithAccess(req, res, taskId, { permission: 'manage_tasks' });
    if (access.denied) return;
    await prisma.task.update({ where: { id: taskId }, data: { deletedAt: null } });
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        column: true, creator: true,
        assignees: { include: { user: true } },
        labelLinks: { include: { label: true } },
        subtasks: true,
        comments: { select: { id: true } },
      },
    });
    res.json(taskToDict(task));
  }),
);

// ─── DELETE /tasks/:taskId/permanent ────────────────────────────────────────

tasksRouter.delete(
  '/:taskId/permanent',
  requireAuth,
  asyncHandler(async (req, res) => {
    const taskId = parseInt(req.params.taskId, 10);
    const access = await loadTaskWithAccess(req, res, taskId, { permission: 'manage_tasks' });
    if (access.denied) return;
    await prisma.$transaction([
      prisma.taskAttachment.deleteMany({ where: { taskId } }),
      prisma.taskAssignee.deleteMany({ where: { taskId } }),
      prisma.taskLabel.deleteMany({ where: { taskId } }),
      prisma.subtask.deleteMany({ where: { taskId } }),
      prisma.comment.deleteMany({ where: { taskId } }),
      prisma.noteLinkedTask.deleteMany({ where: { taskId } }),
      prisma.notification.updateMany({ where: { taskId }, data: { taskId: null } }),
      prisma.task.delete({ where: { id: taskId } }),
    ]);
    res.json({ ok: true });
  }),
);

// ─── GET /tasks/:taskId/subtasks ───────────────────────────────────────────

tasksRouter.get(
  '/:taskId/subtasks',
  requireAuth,
  asyncHandler(async (req, res) => {
    const taskId = parseInt(req.params.taskId, 10);
    const access = await loadTaskWithAccess(req, res, taskId);
    if (access.denied) return;

    const subs = await prisma.subtask.findMany({
      where: { taskId },
      orderBy: { position: 'asc' },
    });
    res.json(subs.map(subtaskToDict));
  }),
);

// ─── POST /tasks/:taskId/subtasks ──────────────────────────────────────────

tasksRouter.post(
  '/:taskId/subtasks',
  requireAuth,
  asyncHandler(async (req, res) => {
    const taskId = parseInt(req.params.taskId, 10);
    const access = await loadTaskWithAccess(req, res, taskId, {
      permission: 'manage_tasks',
    });
    if (access.denied) return;

    const data = req.body || {};
    const title = (data.title || data.text || '').trim();
    if (!title) return res.status(400).json({ error: 'err_title_required', message: 'Başlık zorunludur' });

    const count = await prisma.subtask.count({ where: { taskId } });
    const s = await prisma.subtask.create({
      data: { taskId, title, done: false, position: count },
    });
    // Yeni alt görev toplamı değiştirdiği için ilerleme yeniden hesaplanmalı;
    // aksi halde 2/2 (%100) bir göreve üçüncü alt görev eklenince %100 kalıyordu.
    await recalcTaskProgress(prisma, taskId);
    res.status(201).json(subtaskToDict(s));
  }),
);

// ─── PATCH /subtasks/:subtaskId ────────────────────────────────────────────

subtasksRouter.patch(
  '/:subtaskId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const subtaskId = parseInt(req.params.subtaskId, 10);
    const s = await prisma.subtask.findUnique({
      where: { id: subtaskId },
      include: { task: true },
    });
    if (!s) return res.status(404).json({ error: 'err_subtask_not_found', message: 'Alt görev bulunamadı' });
    if (!s.task) return res.status(404).json({ error: 'err_task_not_found', message: 'Task bulunamadı' });

    const project = await prisma.project.findUnique({
      where: { id: s.task.projectId },
    });
    const member = await memberForWorkspace(user.id, project.workspaceId);
    if (!hasPermission(member, 'manage_tasks')) {
      return res.status(403).json({ error: 'err_edit_subtask_forbidden', message: 'Alt görev düzenleme yetkiniz yok' });
    }

    const data = req.body || {};
    const updates = {};
    if ('done' in data) updates.done = Boolean(data.done);
    if ('title' in data) updates.title = data.title;

    await prisma.subtask.update({ where: { id: subtaskId }, data: updates });

    // İlerleme tek üreticiden. Burada eskiden kendi kopyası vardı ve bitmiş
    // kolondaki kartta işaret kaldırmak, taşımanın yazdığı 100'ü eziyordu.
    await recalcTaskProgress(prisma, s.taskId);

    const updated = await prisma.subtask.findUnique({ where: { id: subtaskId } });
    res.json(subtaskToDict(updated));
  }),
);

// ─── DELETE /subtasks/:subtaskId ───────────────────────────────────────────

subtasksRouter.delete(
  '/:subtaskId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const subtaskId = parseInt(req.params.subtaskId, 10);
    const s = await prisma.subtask.findUnique({
      where: { id: subtaskId },
      include: { task: true },
    });
    if (!s) return res.status(404).json({ error: 'err_subtask_not_found', message: 'Alt görev bulunamadı' });
    const project = await prisma.project.findUnique({
      where: { id: s.task.projectId },
    });
    const member = await memberForWorkspace(user.id, project.workspaceId);
    if (!hasPermission(member, 'manage_tasks')) {
      return res.status(403).json({ error: 'err_delete_subtask_forbidden', message: 'Alt görev silme yetkiniz yok' });
    }
    await prisma.subtask.delete({ where: { id: subtaskId } });
    await recalcTaskProgress(prisma, s.taskId);
    res.json({ ok: true });
  }),
);

// ─── GET /tasks/:taskId/comments ───────────────────────────────────────────

tasksRouter.get(
  '/:taskId/comments',
  requireAuth,
  asyncHandler(async (req, res) => {
    const taskId = parseInt(req.params.taskId, 10);
    const access = await loadTaskWithAccess(req, res, taskId);
    if (access.denied) return;

    const comments = await prisma.comment.findMany({
      where: { taskId },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json(comments.map(commentToDict));
  }),
);

// ─── POST /tasks/:taskId/comments ──────────────────────────────────────────

const MENTION_RE = /@([\wçğışöüÇĞİŞÖÜ]+)/g;

tasksRouter.post(
  '/:taskId/comments',
  requireAuth,
  asyncHandler(async (req, res) => {
    const taskId = parseInt(req.params.taskId, 10);
    const access = await loadTaskWithAccess(req, res, taskId, {
      include: TASK_FULL_INCLUDE,
    });
    if (access.denied) return;
    const { user, task, project } = access;

    const data = req.body || {};
    const text = (data.text || '').trim();
    if (!text) return res.status(400).json({ error: 'err_comment_text_required', message: 'Yorum metni zorunludur' });

    const io = req.app.get('io');
    const notifsToPush = [];
    const notified = new Set();

    // Assignee bildirimleri
    for (const ta of task.assignees) {
      if (ta.userId !== user.id) {
        notifsToPush.push({
          userId: ta.userId,
          text: buildNotificationText('comment_added', {
            who: user.name,
            preview: text.slice(0, 80),
          }),
          taskId,
          senderSlug: user.slug,
          workspaceId: project.workspaceId,
        });
        notified.add(ta.userId);
      }
    }

    // @mention — yalnızca bu alanın üyeleri
    //
    // Eskiden bahsedilen kişi `user.findFirst({ name: { startsWith } })` ile
    // BÜTÜN platformda aranıyordu: "@Ali" yazmak başka bir şirketteki adı Ali
    // ile başlayan birine yorumun ilk 80 karakterini gönderebiliyordu.
    // Kapsam artık kartın alanının üyeleriyle sınırlı; karar saf ve test
    // edilebilir (`lib/mentions.js`).
    const mentions = [...text.matchAll(MENTION_RE)].map((m) => m[1]);
    if (mentions.length) {
      const uyeSatirlari = await prisma.workspaceMember.findMany({
        where: { workspaceId: project.workspaceId },
        select: { user: { select: { id: true, name: true } } },
      });
      const cozum = bahsedilenleriCoz(mentions, uyeSatirlari.map((m) => m.user));

      // Çözülemeyen bahsetme sessizce yutulmuyor: yorum kaydediliyor ama
      // bildirim gitmediği sunucu günlüğüne yazılıyor (CLAUDE.md, koşulun
      // yokluk hâli gürültü çıkarmalı). Günlüğe ad yazılıyor, yorum metni
      // değil.
      for (const b of cozum.belirsiz) {
        console.warn(`[mention] "${b.ad}" birden fazla üyeye uyuyor, bildirim gönderilmedi:`, b.adaylar.join(', '));
      }
      if (cozum.bulunamayan.length) {
        console.warn('[mention] alanda karşılığı olmayan ad, bildirim gönderilmedi:', cozum.bulunamayan.join(', '));
      }

      for (const kisi of cozum.eslesen) {
        if (kisi.id === user.id || notified.has(kisi.id)) continue;
        notifsToPush.push({
          userId: kisi.id,
          // Metin bilerek JSON değil: `renderNotification` switch'inde
          // `mention` diye bir dal yok; JSON verilirse `default`a düşer ve
          // gövdesi boş bildirim çıkar. Düz metin dalı onu "Sizden
          // bahsedildi" diye işliyor ve HTML'i temizliyor.
          text: `<strong>${user.name}</strong> seni bir görev yorumunda bahsetti: ${text.slice(0, 80)}`,
          taskId,
          senderSlug: user.slug,
          workspaceId: project.workspaceId,
        });
        notified.add(kisi.id);
      }
    }

    const comment = await prisma.comment.create({
      data: { taskId, userId: user.id, text },
      include: { user: true },
    });

    for (const n of notifsToPush) await createAndPush(io, n);

    res.status(201).json(commentToDict(comment));
  }),
);

// ─── DELETE /comments/:commentId ───────────────────────────────────────────

commentsRouter.delete(
  '/:commentId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await loadUser(req);
    const commentId = parseInt(req.params.commentId, 10);
    const comment = await prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) return res.status(404).json({ error: 'err_comment_not_found', message: 'Yorum bulunamadı' });
    if (comment.userId !== user.id) {
      return res.status(403).json({ error: 'err_unauthorized', message: 'Yetkisiz işlem' });
    }
    await prisma.comment.delete({ where: { id: commentId } });
    res.json({ ok: true });
  }),
);
