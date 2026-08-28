# CloudBase Setup

## Environment

Create one CloudBase environment and select it in WeChat Developer Tools. The mini program uses the currently selected environment; no environment ID is committed to the repository.

## Collections

Create these collections with client permissions set to no direct write access:

- `stores`
- `users`
- `portfolioItems`
- `services`
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
- `bookings`: `storeId + status + startMs`
- `bookings`: `customerUserId + createdAtMs`
- `bookings`: `requestId` unique
- `notificationJobs`: `status + nextAttemptAtMs`
- `favorites`: `userId + portfolioItemId` unique

Further booking transaction and scheduler settings are added with their implementation tasks.
