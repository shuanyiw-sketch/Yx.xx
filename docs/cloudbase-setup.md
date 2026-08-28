# CloudBase Setup

## Environment

Create one CloudBase environment and select it in WeChat Developer Tools. The mini program uses the currently selected environment; no environment ID is committed to the repository.

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

Public catalog reads, customer-private reads, and every write pass through `booking-api`. The client must never receive `openId`, owner notes, receipt details, or another customer's contact details from a public catalog response.

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

## Scheduler and subscription messages

Deploy `booking-scheduler` as a CloudBase cloud function. Its checked-in timer trigger runs every five minutes. Set these environment variables in the CloudBase console; do not commit their values:

- `BOOKING_REMINDER_TEMPLATE_ID`: the approved WeChat subscription-message template ID.
- `BOOKING_CREATED_TEMPLATE_ID`: the approved new-booking template sent to the owner.
- `MINIPROGRAM_STATE`: `developer`, `trial`, or `formal` (defaults to `formal`).

The scheduler releases expired `pending` bookings, creates one reminder job per confirmed booking, and retries temporary delivery failures at most three times. User refusal and invalid-template errors are terminal. A message failure only updates `notificationJobs`; it never changes the booking status.

Add these scheduler indexes:

- `bookings`: `status + lockedUntil`
- `bookings`: `status + startMs`
- `notificationJobs`: unique `idempotencyKey`
