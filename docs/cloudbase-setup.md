# CloudBase Setup

## Environment

Create one CloudBase environment and select it in WeChat Developer Tools. The mini program uses the currently selected environment; no environment ID is committed to the repository.

After creating the first `stores` document, copy its document ID into `miniprogram/config.js` as `STORE_ID`. This is the public homepage the customer opens by default.

After WeChat approves the customer booking-status subscription template, put its template ID in `miniprogram/config.js` as `BOOKING_STATUS_TEMPLATE_ID`. Leaving it empty disables the permission prompt but does not block booking submission.

## Collections

Create these collections with client permissions set to no direct write access:

- `stores`
- `users`
- `portfolioItems`
- `services`
- `availabilityWindows`
- `availabilityRules`
- `scheduleExceptions`
- `bookings`
- `favorites`
- `notificationJobs`
- `scheduleGuards`

Public catalog reads, customer-private reads, and every write pass through `booking-api`. The client must never receive `openId`, owner notes, receipt details, or another customer's contact details from a public catalog response.

For every collection above, choose the preset **No permission** for client database access. Cloud functions and the console retain server-side access, while mini-program reads and writes go through the allowlisted router.

## Cloud function and storage permissions

Require a logged-in CloudBase identity for the API and deny direct client invocation of the timer function:

```json
{
  "*": { "invoke": false },
  "booking-api": { "invoke": "auth != null" },
  "booking-scheduler": { "invoke": false }
}
```

The scheduler still runs from its timer trigger. Owner/customer authorization remains inside `booking-api`, because function rules cannot express application store roles.

Portfolio images need public read access. The first release uploads from the signed-in owner client and publishes references only through an owner-authorized cloud action. Use creator-write storage rules:

```json
{
  "read": true,
  "write": "resource.openid == auth.openid || resource.openid == auth.uid"
}
```

The app exposes no cloud-file deletion action. If stricter upload-cost protection is required, move binary upload behind a dedicated server upload service before production launch.

## Initial owner binding

Create the first `users` record from the CloudBase console after the owner's first login has produced an OpenID:

```json
{
  "openId": "OWNER_OPENID_FROM_CONSOLE",
  "role": "owner",
  "storeId": "STORE_DOCUMENT_ID"
}
```

Do not expose an owner-registration action in the mini program.

## Initial indexes

- `portfolioItems`: `storeId + status + sortOrder`
- `services`: `storeId + status + sortOrder`
- `availabilityWindows`: `storeId + dayStartMs + dayEndMs`
- `bookings`: `storeId + status + startMs`
- `bookings`: `customerUserId + createdAtMs`
- `bookings`: `requestId` unique
- `notificationJobs`: `status + nextAttemptAtMs`
- `favorites`: `userId + portfolioItemId` unique
- `scheduleGuards`: document ID (serializes concurrent bookings for one store/day)

## Scheduler and subscription messages

Deploy `booking-scheduler` as a CloudBase cloud function. Its checked-in timer trigger runs every five minutes. Set these environment variables in the CloudBase console; do not commit their values:

- `BOOKING_REMINDER_TEMPLATE_ID`: the approved WeChat subscription-message template ID.
- `BOOKING_CREATED_TEMPLATE_ID`: the approved new-booking template sent to the owner.
- `BOOKING_CONFIRMED_TEMPLATE_ID`: the approved confirmation template sent to the customer.
- `BOOKING_REJECTED_TEMPLATE_ID`: the approved rejection template sent to the customer. It may use the same approved template ID as confirmation when the template fields are compatible.
- `MINIPROGRAM_STATE`: `developer`, `trial`, or `formal` (defaults to `formal`).

The scheduler releases expired `pending` bookings, creates separate customer and owner reminder jobs per confirmed booking, and retries temporary delivery failures at most three times. User refusal and invalid-template errors are terminal. A message failure only updates `notificationJobs`; it never changes the booking status.

Add these scheduler indexes:

- `bookings`: `status + lockedUntil`
- `bookings`: `status + startMs`
- `notificationJobs`: unique `idempotencyKey`

## Initial test data

Create the first `stores` document:

```json
{
  "name": "一瞬摄影",
  "introduction": "记录自然、松弛而真实的片刻",
  "contactText": "微信：your_wechat",
  "bookingPolicy": "提交后 24 小时内确认，费用在线下沟通",
  "timezone": "Asia/Shanghai"
}
```

Use its document ID for `STORE_ID` and owner binding. Create services and works from the owner workbench. Save at least one weekly rule in “可预约设置”; the API converts weekly intervals into slots in the store timezone and excludes special-date records.

## Deployment and rollback

1. Run `pnpm test` and `pnpm lint`.
2. Select the test CloudBase environment in WeChat Developer Tools.
3. Deploy `booking-api` with cloud dependency installation.
4. Deploy `booking-scheduler` and verify its five-minute trigger in the console.
5. Configure scheduler environment variables and mini-program template IDs.
6. Apply indexes and security rules, then upload an experience build.
7. Complete `acceptance-checklist.md` with three real WeChat accounts.

Keep the previous cloud-function version in the console. If the experience build fails, restore both functions, disable the scheduler trigger if involved, and roll back to the previous experience version. Do not delete bookings or collections; this release's schema changes are additive.
