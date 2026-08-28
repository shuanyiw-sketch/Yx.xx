# Personal Creative Booking Mini Program Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a WeChat mini program where customers browse one photographer or makeup artist's portfolio, select a service and calculated free slot, submit a 24-hour hold, and receive a confirmed booking after the owner approves it.

**Architecture:** A native WeChat mini program calls two CloudBase cloud functions: `booking-api` owns authenticated reads, availability calculation, booking transactions, and owner mutations; `booking-scheduler` expires holds and emits reminder jobs. Business rules stay in small pure CommonJS modules with Vitest coverage, while CloudBase repositories adapt those modules to database transactions.

**Tech Stack:** WeChat native mini program (WXML/WXSS/JavaScript), CloudBase database/storage/cloud functions, Node.js 20 CommonJS, Vitest 2, ESLint 9.

**Spec:** `docs/superpowers/specs/2026-08-28-personal-creative-booking-mini-program-design.md`

## Global Constraints

- Version 1 serves one owner but every business record carries `storeId`; portfolio records also carry `creatorId`.
- No online payments, refunds, public creator onboarding, cross-creator search, chat, reviews, staff scheduling, or revenue sharing.
- Pending bookings hold a slot for exactly 24 hours.
- Default slot interval is 30 minutes, minimum lead time is 2 hours, maximum booking horizon is 90 days, and services cannot cross a calendar day.
- Absolute times persist as UTC timestamps; availability and UI display use the store timezone, default `Asia/Shanghai`.
- A confirmed booking cancellation request keeps the slot occupied until the owner accepts it.
- Notification refusal or delivery failure never rolls back a booking.
- Historical bookings retain a service snapshot when services change or are unpublished.

## Planned File Structure

```text
.
├── package.json                         # repository test and lint commands
├── eslint.config.js                    # JavaScript lint policy
├── project.config.json                 # WeChat developer-tool project metadata
├── miniprogram/
│   ├── app.js                           # app boot and session bootstrap
│   ├── app.json                         # pages and bottom tabs
│   ├── app.wxss                         # global visual tokens
│   ├── api/cloud-api.js                 # typed booking-api client wrapper
│   ├── utils/date.js                    # store-timezone display helpers
│   ├── components/
│   │   ├── portfolio-card/              # portfolio grid card
│   │   ├── service-card/                # service summary card
│   │   └── booking-status/              # canonical status presentation
│   └── pages/
│       ├── portfolio/                    # public portfolio feed
│       ├── portfolio-detail/             # work details and linked service CTA
│       ├── services/                     # public service catalog
│       ├── booking-create/               # slot picker and customer form
│       ├── bookings/                     # customer's booking list
│       ├── booking-detail/               # booking state and actions
│       ├── profile/                      # store profile and owner-mode entry
│       └── admin/
│           ├── dashboard/                # daily agenda and pending queue
│           ├── calendar/                 # bookings and schedule exceptions
│           ├── booking-detail/           # owner booking actions and receipts
│           ├── services/                 # service CRUD
│           ├── portfolio/                # portfolio publish and ordering
│           ├── availability/             # weekly hours and date exceptions
│           ├── customers/                # customer history and private owner notes
│           └── store/                    # public profile and booking policy settings
├── cloudfunctions/
│   ├── booking-api/
│   │   ├── index.js                      # action router entry point
│   │   ├── auth.js                       # OpenID/session and owner checks
│   │   ├── router.js                     # action allowlist and validation
│   │   ├── domain/
│   │   │   ├── availability.js           # pure free-slot calculation
│   │   │   ├── booking-state.js          # pure status transition rules
│   │   │   └── validation.js             # request schemas and normalization
│   │   ├── services/
│   │   │   ├── booking-service.js        # transactional booking lifecycle
│   │   │   ├── catalog-service.js        # public and owner portfolio/service use cases
│   │   │   └── schedule-service.js       # owner availability and exception use cases
│   │   ├── repositories/
│   │   │   ├── cloudbase-repository.js   # production database adapter
│   │   │   └── memory-repository.js      # deterministic tests
│   │   └── tests/                         # cloud-domain and service tests
│   └── booking-scheduler/
│       ├── index.js                      # timer entry point
│       ├── jobs.js                       # expiration/reminder job logic
│       └── tests/jobs.test.js            # scheduler tests
└── docs/
    ├── cloudbase-setup.md                # collections, indexes, permissions, templates
    └── acceptance-checklist.md            # real-device verification script
```

---

### Task 1: Repository and Mini Program Foundation

**Files:**
- Create: `package.json`
- Create: `eslint.config.js`
- Create: `project.config.json`
- Create: `miniprogram/app.js`
- Create: `miniprogram/app.json`
- Create: `miniprogram/app.wxss`
- Create: `miniprogram/api/cloud-api.js`
- Test: `miniprogram/api/cloud-api.test.js`

**Interfaces:**
- Produces: `callApi(action: string, payload?: object): Promise<any>` for every mini-program page.
- Produces: `{ user, store, isOwner }` in `App.globalData` after `session.get` resolves.

- [ ] **Step 1: Write the failing cloud client tests**

```js
const { createCloudApi } = require('./cloud-api.js');

describe('createCloudApi', () => {
  it('unwraps a successful action result', async () => {
    const callFunction = vi.fn().mockResolvedValue({ result: { ok: true, data: { id: 's1' } } });
    const api = createCloudApi(callFunction);
    await expect(api('catalog.listPortfolio', { storeId: 's1' })).resolves.toEqual({ id: 's1' });
  });

  it('throws the stable server error code', async () => {
    const callFunction = vi.fn().mockResolvedValue({ result: { ok: false, error: { code: 'SLOT_TAKEN', message: '档期已被占用' } } });
    const api = createCloudApi(callFunction);
    await expect(api('booking.create', {})).rejects.toMatchObject({ code: 'SLOT_TAKEN' });
  });
});
```

- [ ] **Step 2: Run the test and verify the missing module failure**

Run: `npm test -- miniprogram/api/cloud-api.test.js`

Expected: FAIL because `package.json` and `cloud-api.js` do not exist.

- [ ] **Step 3: Add the test harness, project configuration, cloud wrapper, and app bootstrap**

```js
// miniprogram/api/cloud-api.js
function createCloudApi(callFunction) {
  return async function callApi(action, payload = {}) {
    const { result } = await callFunction({ name: 'booking-api', data: { action, payload } });
    if (!result?.ok) {
      const error = new Error(result?.error?.message || '请求失败');
      error.code = result?.error?.code || 'UNKNOWN';
      throw error;
    }
    return result.data;
  };
}

const callApi = createCloudApi((options) => wx.cloud.callFunction(options));
module.exports = { callApi, createCloudApi };
```

Set `package.json` scripts to `vitest run --globals`, `vitest --globals`, and `eslint .`; set `miniprogramRoot` and `cloudfunctionRoot` in `project.config.json`; register every listed customer page and the four bottom tabs in `app.json`. Initialize `wx.cloud` in `app.js`, call `session.get`, and store the result in `globalData` without blocking public portfolio rendering.

- [ ] **Step 4: Run foundation verification**

Run: `npm install && npm test -- miniprogram/api/cloud-api.test.js && npm run lint`

Expected: 2 tests PASS and ESLint exits 0.

- [ ] **Step 5: Commit the foundation**

```bash
git add package.json package-lock.json eslint.config.js project.config.json miniprogram
git commit -m "chore: scaffold booking mini program"
```

### Task 2: Availability Domain Engine

**Files:**
- Create: `cloudfunctions/booking-api/domain/availability.js`
- Create: `cloudfunctions/booking-api/domain/validation.js`
- Test: `cloudfunctions/booking-api/tests/availability.test.js`

**Interfaces:**
- Produces: `calculateAvailableSlots(input: AvailabilityInput): Array<{ startMs: number, endMs: number }>`.
- `AvailabilityInput` is `{ dayStartMs, dayEndMs, intervalMinutes, serviceMinutes, bufferBeforeMinutes, bufferAfterMinutes, minimumStartMs, busy: Array<{startMs,endMs}> }`.
- Produces: `assertSameStoreDay(startMs: number, endMs: number, timeZone: string): void`.

- [ ] **Step 1: Write failing availability tests**

```js
const { calculateAvailableSlots } = require('../domain/availability');
const MINUTE = 60_000;

it('removes slots that overlap buffers and busy periods', () => {
  const slots = calculateAvailableSlots({
    dayStartMs: 0, dayEndMs: 480 * MINUTE, intervalMinutes: 30,
    serviceMinutes: 120, bufferBeforeMinutes: 30, bufferAfterMinutes: 30,
    minimumStartMs: 0, busy: [{ startMs: 180 * MINUTE, endMs: 240 * MINUTE }],
  });
  expect(slots).not.toContainEqual({ startMs: 120 * MINUTE, endMs: 240 * MINUTE });
  expect(slots).toContainEqual({ startMs: 270 * MINUTE, endMs: 390 * MINUTE });
});

it('excludes candidates that cannot fit before closing', () => {
  expect(calculateAvailableSlots({
    dayStartMs: 0, dayEndMs: 300 * MINUTE, intervalMinutes: 30,
    serviceMinutes: 120, bufferBeforeMinutes: 0, bufferAfterMinutes: 0,
    minimumStartMs: 240 * MINUTE, busy: [],
  })).toEqual([]);
});
```

Add cases for lunch breaks, expired pending holds excluded by the caller, exact-boundary adjacency, minimum lead time, and merged overlapping busy intervals.

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- cloudfunctions/booking-api/tests/availability.test.js`

Expected: FAIL with `Cannot find module '../domain/availability'`.

- [ ] **Step 3: Implement deterministic slot calculation**

```js
function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

function calculateAvailableSlots(input) {
  const minuteMs = 60_000;
  const intervalMs = input.intervalMinutes * minuteMs;
  const serviceMs = input.serviceMinutes * minuteMs;
  const beforeMs = input.bufferBeforeMinutes * minuteMs;
  const afterMs = input.bufferAfterMinutes * minuteMs;
  const slots = [];
  const firstStartMs = Math.ceil(Math.max(input.dayStartMs, input.minimumStartMs) / intervalMs) * intervalMs;
  for (let startMs = firstStartMs; startMs < input.dayEndMs; startMs += intervalMs) {
    const occupiedStart = startMs - beforeMs;
    const serviceEnd = startMs + serviceMs;
    const occupiedEnd = serviceEnd + afterMs;
    if (occupiedStart < input.dayStartMs || occupiedEnd > input.dayEndMs) continue;
    if (input.busy.some((period) => overlaps(occupiedStart, occupiedEnd, period.startMs, period.endMs))) continue;
    slots.push({ startMs, endMs: serviceEnd });
  }
  return slots;
}

module.exports = { calculateAvailableSlots, overlaps };
```

Use integer minute offsets internally and convert UTC timestamps at the service boundary. Reject invalid intervals, negative durations, a horizon beyond 90 days by default, and a service whose local start/end dates differ.

- [ ] **Step 4: Run domain verification**

Run: `npm test -- cloudfunctions/booking-api/tests/availability.test.js && npm run lint`

Expected: all availability tests PASS and ESLint exits 0.

- [ ] **Step 5: Commit the availability engine**

```bash
git add cloudfunctions/booking-api/domain cloudfunctions/booking-api/tests/availability.test.js
git commit -m "feat: calculate collision-free booking slots"
```

### Task 3: Cloud API, Authentication, and Data Boundaries

**Files:**
- Create: `cloudfunctions/booking-api/package.json`
- Create: `cloudfunctions/booking-api/index.js`
- Create: `cloudfunctions/booking-api/router.js`
- Create: `cloudfunctions/booking-api/auth.js`
- Create: `cloudfunctions/booking-api/repositories/cloudbase-repository.js`
- Create: `cloudfunctions/booking-api/repositories/memory-repository.js`
- Create: `cloudfunctions/booking-api/services/catalog-service.js`
- Test: `cloudfunctions/booking-api/tests/router.test.js`
- Test: `cloudfunctions/booking-api/tests/auth.test.js`
- Create: `docs/cloudbase-setup.md`

**Interfaces:**
- Produces: `route({ action, payload, openId }, dependencies): Promise<{ok,data}|{ok:false,error}>`.
- Produces: `requireOwner(session, storeId): void` and `requireSelf(session, userId): void`.
- Produces repository methods `getSession(openId)`, `listPublishedPortfolio(storeId)`, `listPublishedServices(storeId)`, `getStore(storeId)`, and `runTransaction(work)`.

- [ ] **Step 1: Write failing router and authorization tests**

```js
it('allows anonymous published portfolio reads', async () => {
  const result = await route({ action: 'catalog.listPortfolio', payload: { storeId: 's1' } }, deps);
  expect(result).toEqual({ ok: true, data: [{ id: 'p1', storeId: 's1' }] });
});

it('rejects a customer calling an owner action', async () => {
  const result = await route({ action: 'admin.service.save', payload: { storeId: 's1' }, openId: 'customer' }, deps);
  expect(result).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
});
```

- [ ] **Step 2: Run tests and verify missing router/auth failures**

Run: `npm test -- cloudfunctions/booking-api/tests/router.test.js cloudfunctions/booking-api/tests/auth.test.js`

Expected: FAIL because `route`, `requireOwner`, and repositories do not exist.

- [ ] **Step 3: Implement the allowlisted router and repository adapters**

```js
const ACTIONS = {
  'session.get': ({ services, openId }) => services.catalog.getSession(openId),
  'catalog.getStore': ({ services, payload }) => services.catalog.getStore(payload.storeId),
  'catalog.listPortfolio': ({ services, payload }) => services.catalog.listPortfolio(payload.storeId),
  'catalog.listServices': ({ services, payload }) => services.catalog.listServices(payload.storeId),
};

async function route(request, dependencies) {
  try {
    const handler = ACTIONS[request.action];
    if (!handler) return { ok: false, error: { code: 'UNKNOWN_ACTION', message: '不支持的操作' } };
    return { ok: true, data: await handler({ ...dependencies, ...request }) };
  } catch (error) {
    return { ok: false, error: { code: error.code || 'INTERNAL', message: error.publicMessage || '请求失败' } };
  }
}
```

Initialize `wx-server-sdk` once in `index.js`, obtain `OPENID` from `cloud.getWXContext()`, and never accept an OpenID or owner role from the client. Document collections, owner binding, public fields, private fields, and required composite indexes in `docs/cloudbase-setup.md`.

- [ ] **Step 4: Run API boundary tests**

Run: `npm test -- cloudfunctions/booking-api/tests/router.test.js cloudfunctions/booking-api/tests/auth.test.js && npm run lint`

Expected: public actions PASS, cross-user and cross-store owner actions return `FORBIDDEN`, and lint exits 0.

- [ ] **Step 5: Commit CloudBase boundaries**

```bash
git add cloudfunctions/booking-api docs/cloudbase-setup.md
git commit -m "feat: add authenticated CloudBase API boundary"
```

### Task 4: Transactional Booking Lifecycle

**Files:**
- Create: `cloudfunctions/booking-api/domain/booking-state.js`
- Create: `cloudfunctions/booking-api/services/booking-service.js`
- Modify: `cloudfunctions/booking-api/router.js`
- Modify: `cloudfunctions/booking-api/repositories/cloudbase-repository.js`
- Modify: `cloudfunctions/booking-api/repositories/memory-repository.js`
- Test: `cloudfunctions/booking-api/tests/booking-service.test.js`
- Test: `cloudfunctions/booking-api/tests/booking-state.test.js`

**Interfaces:**
- Produces: `createBooking({ storeId, serviceId, startMs, customer, notes, requestId, nowMs }, session): Promise<Booking>`.
- Produces: `transitionBooking({ bookingId, command, nowMs }, session): Promise<Booking>` where command is `confirm`, `reject`, `withdraw`, `requestCancel`, `acceptCancel`, or `complete`.
- Repository adds `findBookingByRequestId`, `findBlockingPeriods`, `insertBooking`, `updateBookingIfStatus`, and `insertNotificationJob`.

- [ ] **Step 1: Write failing transaction and state tests**

```js
it('returns the same booking for a repeated request id', async () => {
  const first = await service.createBooking(validRequest, customerSession);
  const second = await service.createBooking(validRequest, customerSession);
  expect(second.id).toBe(first.id);
  expect(repository.bookings).toHaveLength(1);
});

it('keeps a confirmed slot blocked after a cancel request', async () => {
  const booking = seedBooking({ status: 'confirmed' });
  await service.transitionBooking({ bookingId: booking.id, command: 'requestCancel', nowMs: 10 }, customerSession);
  expect(repository.bookings[0].status).toBe('cancel_requested');
  expect(repository.findBlockingPeriods('s1', 0, 100)).toHaveLength(1);
});
```

Add tests for concurrent overlap returning `SLOT_TAKEN`, 24-hour `lockedUntil`, service snapshot stability, owner-only confirmation, customer withdrawal, invalid transitions, and idempotent repeated commands.

- [ ] **Step 2: Run lifecycle tests and verify failure**

Run: `npm test -- cloudfunctions/booking-api/tests/booking-service.test.js cloudfunctions/booking-api/tests/booking-state.test.js`

Expected: FAIL because booking lifecycle modules are missing.

- [ ] **Step 3: Implement state rules and transactional creation**

```js
const TRANSITIONS = {
  pending: { confirm: 'confirmed', reject: 'rejected', withdraw: 'cancelled' },
  confirmed: { requestCancel: 'cancel_requested', complete: 'completed' },
  cancel_requested: { acceptCancel: 'cancelled', complete: 'completed' },
};

function nextStatus(status, command) {
  const next = TRANSITIONS[status]?.[command];
  if (!next) {
    const error = new Error('INVALID_TRANSITION');
    error.code = 'INVALID_TRANSITION';
    throw error;
  }
  return next;
}
```

Inside `createBooking`, run this order in one repository transaction: find existing `requestId`; load published service; validate lead time and horizon; find effective busy periods; calculate candidate validity; insert a `pending` booking with `lockedUntil = nowMs + 86_400_000`; copy the service snapshot; insert the owner notification job. In CloudBase, use a deterministic request document or transactional lookup so two identical requests cannot both insert.

- [ ] **Step 4: Run lifecycle verification**

Run: `npm test -- cloudfunctions/booking-api/tests/booking-service.test.js cloudfunctions/booking-api/tests/booking-state.test.js && npm run lint`

Expected: all booking and transition tests PASS; lint exits 0.

- [ ] **Step 5: Commit booking lifecycle**

```bash
git add cloudfunctions/booking-api
git commit -m "feat: add transactional booking lifecycle"
```

### Task 5: Expiration and Subscription Notification Jobs

**Files:**
- Create: `cloudfunctions/booking-scheduler/package.json`
- Create: `cloudfunctions/booking-scheduler/index.js`
- Create: `cloudfunctions/booking-scheduler/jobs.js`
- Test: `cloudfunctions/booking-scheduler/tests/jobs.test.js`
- Modify: `docs/cloudbase-setup.md`

**Interfaces:**
- Produces: `expirePendingBookings(repository, nowMs): Promise<number>`.
- Produces: `enqueueUpcomingReminders(repository, windowStartMs, windowEndMs): Promise<number>`.
- Produces: `deliverNotificationJobs(repository, sender, nowMs): Promise<{sent:number,failed:number}>`.

- [ ] **Step 1: Write failing scheduler tests**

```js
it('expires only pending bookings whose lock passed', async () => {
  const count = await expirePendingBookings(repository, 1000);
  expect(count).toBe(1);
  expect(repository.getBooking('expired-one').status).toBe('expired');
  expect(repository.getBooking('future-one').status).toBe('pending');
});

it('records a failed message without changing its booking', async () => {
  const sender = vi.fn().mockRejectedValue(Object.assign(new Error('refused'), { code: 43101 }));
  const result = await deliverNotificationJobs(repository, sender, 1000);
  expect(result).toEqual({ sent: 0, failed: 1 });
  expect(repository.getBooking('b1').status).toBe('confirmed');
});
```

- [ ] **Step 2: Run scheduler tests and verify failure**

Run: `npm test -- cloudfunctions/booking-scheduler/tests/jobs.test.js`

Expected: FAIL because `jobs.js` does not exist.

- [ ] **Step 3: Implement timer-safe, idempotent jobs**

```js
async function expirePendingBookings(repository, nowMs) {
  const expired = await repository.listExpiredPending(nowMs);
  let count = 0;
  for (const booking of expired) {
    if (await repository.updateBookingIfStatus(booking.id, 'pending', { status: 'expired', expiredAt: nowMs })) count += 1;
  }
  return count;
}
```

Use an idempotency key of `bookingId:type:scheduledAt` for each reminder. Retry transient message errors at most three times with `nextAttemptAt`; mark refusal and invalid-template codes terminal immediately. Configure a timer trigger every five minutes and document template IDs as environment variables rather than repository secrets.

- [ ] **Step 4: Run scheduler verification**

Run: `npm test -- cloudfunctions/booking-scheduler/tests/jobs.test.js && npm run lint`

Expected: expiration, duplicate-reminder, retry, refusal, and booking-decoupling tests PASS.

- [ ] **Step 5: Commit scheduler**

```bash
git add cloudfunctions/booking-scheduler docs/cloudbase-setup.md
git commit -m "feat: expire booking holds and send reminders"
```

### Task 6: Portfolio and Service Discovery Experience

**Files:**
- Create: `miniprogram/components/portfolio-card/*`
- Create: `miniprogram/components/service-card/*`
- Create: `miniprogram/pages/portfolio/*`
- Create: `miniprogram/pages/portfolio-detail/*`
- Create: `miniprogram/pages/services/*`
- Create: `miniprogram/pages/profile/*`
- Modify: `cloudfunctions/booking-api/services/catalog-service.js`
- Modify: `cloudfunctions/booking-api/router.js`
- Test: `cloudfunctions/booking-api/tests/catalog-service.test.js`
- Test: `miniprogram/pages/portfolio/portfolio.test.js`

**Interfaces:**
- Cloud actions: `catalog.listPortfolio`, `catalog.getPortfolioItem`, `catalog.listServices`, `catalog.getService`, `catalog.getStore`, `favorite.toggle`, and `favorite.listMine`.
- Page method: `openLinkedService(serviceId: string): void` navigates to booking creation with the service preselected.

- [ ] **Step 1: Write failing catalog and page-controller tests**

```js
it('never returns drafts in the public portfolio', async () => {
  repository.portfolio = [{ id: 'live', status: 'published' }, { id: 'draft', status: 'draft' }];
  await expect(service.listPortfolio('s1')).resolves.toEqual([{ id: 'live', status: 'published' }]);
});

it('uses the linked service in the booking CTA', () => {
  const navigateTo = vi.fn();
  openLinkedService('svc1', navigateTo);
  expect(navigateTo).toHaveBeenCalledWith({ url: '/pages/booking-create/index?serviceId=svc1' });
});
```

- [ ] **Step 2: Run discovery tests and verify failure**

Run: `npm test -- cloudfunctions/booking-api/tests/catalog-service.test.js miniprogram/pages/portfolio/portfolio.test.js`

Expected: FAIL because catalog filtering and page modules are missing.

- [ ] **Step 3: Build the public discovery vertical slice**

Implement a two-column image grid with aspect-ratio placeholders, published-only pagination, work detail image swiping, visible style/type/location tags, linked service cards, favorite state, and the copy “预约类似服务”. The service page shows reference price and duration; the profile page shows store introduction, representative works, contact information, and booking policy. Hide the owner-mode entry unless `App.globalData.isOwner === true`.

```js
function openLinkedService(serviceId, navigateTo = wx.navigateTo) {
  navigateTo({ url: `/pages/booking-create/index?serviceId=${encodeURIComponent(serviceId)}` });
}
module.exports = { openLinkedService };
```

- [ ] **Step 4: Run discovery verification**

Run: `npm test -- cloudfunctions/booking-api/tests/catalog-service.test.js miniprogram/pages/portfolio/portfolio.test.js && npm run lint`

Expected: draft filtering, favorite ownership, linked CTA, and owner-entry visibility tests PASS.

- [ ] **Step 5: Commit discovery experience**

```bash
git add miniprogram/components miniprogram/pages/portfolio miniprogram/pages/portfolio-detail miniprogram/pages/services miniprogram/pages/profile cloudfunctions/booking-api
git commit -m "feat: add portfolio-led service discovery"
```

### Task 7: Customer Booking and Account Experience

**Files:**
- Create: `miniprogram/utils/date.js`
- Create: `miniprogram/components/booking-status/*`
- Create: `miniprogram/pages/booking-create/*`
- Create: `miniprogram/pages/bookings/*`
- Create: `miniprogram/pages/booking-detail/*`
- Modify: `cloudfunctions/booking-api/router.js`
- Test: `miniprogram/pages/booking-create/booking-create.test.js`
- Test: `miniprogram/pages/booking-detail/booking-detail.test.js`

**Interfaces:**
- Cloud actions: `availability.listSlots`, `booking.create`, `booking.listMine`, `booking.getMine`, and `booking.command`.
- Produces: `buildBookingRequest(form, selectedSlot, requestId): BookingRequest`.
- Produces: `allowedCustomerActions(status): string[]`.

- [ ] **Step 1: Write failing customer-flow tests**

```js
it('builds a request without trusting client price or duration', () => {
  expect(buildBookingRequest({ name: '林', phone: '13800000000', location: '西湖', peopleCount: 2, notes: '自然风格' }, { startMs: 100 }, 'r1'))
    .toEqual({ customer: { name: '林', phone: '13800000000' }, location: '西湖', peopleCount: 2, notes: '自然风格', startMs: 100, requestId: 'r1' });
});

it.each([
  ['pending', ['withdraw']],
  ['confirmed', ['requestCancel']],
  ['cancel_requested', []],
  ['completed', []],
])('maps %s to customer actions', (status, expected) => {
  expect(allowedCustomerActions(status)).toEqual(expected);
});
```

- [ ] **Step 2: Run customer-flow tests and verify failure**

Run: `npm test -- miniprogram/pages/booking-create/booking-create.test.js miniprogram/pages/booking-detail/booking-detail.test.js`

Expected: FAIL because request builders and action mapping do not exist.

- [ ] **Step 3: Implement slot selection, submission, and booking history**

Load dates lazily, request server slots per date, collect contact/location/people/notes, generate one request ID before the first submit attempt, and reuse it for retries. Trigger `wx.requestSubscribeMessage` only inside the explicit submit tap handler; continue submission after rejection. On `SLOT_TAKEN`, clear the selected slot, refresh the date, and show “该时段刚刚被预约，请重新选择”. The booking detail reads server state after every command and never performs an optimistic state transition.

```js
function allowedCustomerActions(status) {
  if (status === 'pending') return ['withdraw'];
  if (status === 'confirmed') return ['requestCancel'];
  return [];
}
```

- [ ] **Step 4: Run customer experience verification**

Run: `npm test -- miniprogram/pages/booking-create/booking-create.test.js miniprogram/pages/booking-detail/booking-detail.test.js && npm run lint`

Expected: form validation, request-id reuse, slot conflict refresh, notification refusal, and action visibility tests PASS.

- [ ] **Step 5: Commit customer booking flow**

```bash
git add miniprogram/utils miniprogram/components/booking-status miniprogram/pages/booking-create miniprogram/pages/bookings miniprogram/pages/booking-detail cloudfunctions/booking-api/router.js
git commit -m "feat: add customer booking experience"
```

### Task 8: Owner Workbench and Content Management

**Files:**
- Create: `cloudfunctions/booking-api/services/schedule-service.js`
- Modify: `cloudfunctions/booking-api/services/catalog-service.js`
- Modify: `cloudfunctions/booking-api/router.js`
- Create: `miniprogram/pages/admin/dashboard/*`
- Create: `miniprogram/pages/admin/calendar/*`
- Create: `miniprogram/pages/admin/booking-detail/*`
- Create: `miniprogram/pages/admin/services/*`
- Create: `miniprogram/pages/admin/portfolio/*`
- Create: `miniprogram/pages/admin/availability/*`
- Create: `miniprogram/pages/admin/customers/*`
- Create: `miniprogram/pages/admin/store/*`
- Test: `cloudfunctions/booking-api/tests/admin-services.test.js`
- Test: `miniprogram/pages/admin/dashboard/dashboard.test.js`

**Interfaces:**
- Cloud actions: `admin.dashboard.get`, `admin.booking.command`, `admin.booking.recordReceipt`, `admin.schedule.saveRule`, `admin.schedule.saveException`, `admin.service.save`, `admin.service.unpublish`, `admin.portfolio.save`, `admin.portfolio.publish`, `admin.portfolio.reorder`, `admin.customer.list`, `admin.customer.get`, and `admin.store.save`.
- Produces: `groupDashboard(bookings, clock): { today: Booking[], pending: Booking[], expiringSoon: Booking[] }` where `clock` is `{ nowMs, dayStartMs, dayEndMs }` in the store timezone.

- [ ] **Step 1: Write failing owner-service tests**

```js
it('rejects every mutation for a different store', async () => {
  await expect(admin.saveService({ storeId: 's2', name: '写真', durationMinutes: 120 }, ownerOfS1))
    .rejects.toMatchObject({ code: 'FORBIDDEN' });
});

it('unpublishes a service without changing booking snapshots', async () => {
  await admin.unpublishService('svc1', ownerOfS1);
  expect(repository.getBooking('b1').serviceSnapshot.name).toBe('写真');
  expect(repository.getService('svc1').status).toBe('unpublished');
});
```

Add tests for portfolio draft/publish/reorder, valid weekly intervals, overlapping exception rejection, receipt totals, confirm/reject idempotency, dashboard grouping, customer-history ownership, private owner-note filtering, and store-profile updates.

- [ ] **Step 2: Run owner tests and verify failure**

Run: `npm test -- cloudfunctions/booking-api/tests/admin-services.test.js miniprogram/pages/admin/dashboard/dashboard.test.js`

Expected: FAIL because owner services and pages are missing.

- [ ] **Step 3: Implement the mobile owner workflow**

Require owner authorization inside every service method, even though the router also checks it. Dashboard cards navigate to filtered queues. Calendar distinguishes pending, confirmed, exception, and offline-booking records. Booking detail exposes only server-allowed commands and records deposit/final-payment entries as `{ amountFen, type, receivedAtMs, note }`. Service forms validate duration and buffers as integer minutes. Portfolio uploads retain a draft after partial failure and delete a cloud file only after verifying that no published record references it.

```js
function groupDashboard(bookings, { nowMs, dayStartMs, dayEndMs }) {
  return {
    today: bookings.filter((b) => b.startMs >= dayStartMs && b.startMs < dayEndMs && ['confirmed', 'cancel_requested'].includes(b.status)),
    pending: bookings.filter((b) => b.status === 'pending'),
    expiringSoon: bookings.filter((b) => b.status === 'pending' && b.lockedUntil <= nowMs + 3_600_000),
  };
}
```

- [ ] **Step 4: Run owner workflow verification**

Run: `npm test -- cloudfunctions/booking-api/tests/admin-services.test.js miniprogram/pages/admin/dashboard/dashboard.test.js && npm run lint`

Expected: authorization, schedule validation, content state, receipt, upload recovery, and dashboard tests PASS.

- [ ] **Step 5: Commit owner workbench**

```bash
git add cloudfunctions/booking-api miniprogram/pages/admin
git commit -m "feat: add owner booking workbench"
```

### Task 9: Security, Deployment, and Acceptance Verification

**Files:**
- Modify: `docs/cloudbase-setup.md`
- Create: `docs/acceptance-checklist.md`
- Create: `cloudfunctions/booking-api/tests/security-matrix.test.js`
- Create: `cloudfunctions/booking-api/tests/acceptance-flow.test.js`
- Modify: `README.md`

**Interfaces:**
- Consumes all cloud actions and page routes created in Tasks 1–8.
- Produces a reproducible CloudBase deployment checklist and a scripted end-to-end domain acceptance flow.

- [ ] **Step 1: Write the failing security matrix and acceptance flow**

```js
it('completes portfolio-to-confirmed-booking without leaking private data', async () => {
  const works = await customerApi('catalog.listPortfolio', { storeId: 's1' });
  const slots = await customerApi('availability.listSlots', { storeId: 's1', serviceId: works[0].serviceIds[0], date: '2026-09-01' });
  const pending = await customerApi('booking.create', validPayload(slots[0]));
  expect(publicFields(pending)).not.toHaveProperty('ownerNote');
  const confirmed = await ownerApi('admin.booking.command', { bookingId: pending.id, command: 'confirm' });
  expect(confirmed.status).toBe('confirmed');
  await expect(secondCustomerApi('booking.getMine', { bookingId: pending.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
});
```

The matrix must cover anonymous, customer, owner-of-same-store, and owner-of-other-store for every action in the router allowlist.

- [ ] **Step 2: Run the full suite and capture any gaps**

Run: `npm test`

Expected before final fixes: the new matrix fails on every action whose ownership or output filtering is incomplete.

- [ ] **Step 3: Close each concrete matrix failure and document deployment**

For every failing action, add the missing `requireSelf` or `requireOwner` call and reduce response objects to explicit public/customer/owner field lists. Document exact collection names, composite indexes, storage rules, owner-binding record, timezone setting, environment variables, timer trigger, subscription template IDs, test-data seeding, developer-tool upload, and rollback steps. The acceptance checklist must contain numbered real-device flows for notification accepted/rejected, simultaneous slot submissions, expiration, cancellation request, image upload retry, and cross-account isolation.

- [ ] **Step 4: Run final automated and manual verification**

Run: `npm test && npm run lint`

Expected: all tests PASS and lint exits 0.

Then complete every item in `docs/acceptance-checklist.md` using two customer WeChat accounts and the bound owner account in the WeChat developer-tool trial build. Record the trial version identifier and test date at the end of the checklist.

- [ ] **Step 5: Commit release-ready documentation and safeguards**

```bash
git add README.md docs cloudfunctions/booking-api/tests
git commit -m "test: verify booking mini program acceptance flows"
```

## Execution Order and Review Gates

Execute Tasks 1–9 in order. Each task gets an independent spec-compliance review followed by a code-quality review before the next task starts. Do not deploy production CloudBase rules or bind a real owner OpenID until Task 9's security matrix passes locally. Use the WeChat trial build for real-device acceptance; production release remains a separate user-approved action.
