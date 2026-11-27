# Security Specification — City Tycoon 4D

## 1. Data Invariants
1. A `UserProfile` document at `/users/{userId}` can only exist when `userId` matches `request.auth.uid`, the user has a verified email (`request.auth.token.email_verified == true`), and `data.uid == request.auth.uid`.
2. A `CitySave` document at `/cities/{cityId}` must belong to the authenticated creator (`data.ownerId == request.auth.uid`), have a valid alphanumeric/hyphen/underscore `cityId`, strict bounded field sizes, and server-verified timestamps (`createdAt == request.time` on create; immutable `ownerId` and `createdAt` on update).
3. A `CityLegacy` document at `/legacies/{legacyId}` is an append-only historical record (`allow update: if false;`) owned by `request.auth.uid`, with outcome restricted to the 5 valid enum values (`reelected`, `election_loss`, `impeached`, `resigned`, `collapsed`).
4. List queries on `/cities` and `/legacies` strictly enforce `resource.data.ownerId == request.auth.uid` at the rule level.

## 2. The "Dirty Dozen" Attack Payloads
1. **Shadow Field Injection on CitySave Create**: Including `isVerified: true` or `adminOverride: true` alongside valid fields.
2. **Identity Spoofing on CitySave Create**: Setting `ownerId: "victim_uid"` while authenticated as `"attacker_uid"`.
3. **Timestamp Forgery on CitySave Create**: Sending a backdated client timestamp `createdAt` instead of `request.time`.
4. **Unverified Email Bypass**: Attempting write with `email_verified: false`.
5. **Resource Poisoning via Oversized City Name**: Sending a 10,000-character `cityName`.
6. **Document ID Poisoning**: Creating `/cities/bad$id!with/invalid_chars` or a 500-char ID.
7. **Owner Reassignment on CitySave Update**: Changing `ownerId` or `createdAt` during an update.
8. **Shadow Update on CitySave Update**: Modifying an unlisted field or adding a ghost field in `update`.
9. **Blanket List Query Scraping**: Querying `/cities` without `where('ownerId', '==', auth.uid)`.
10. **PII / Profile Cross-User Read**: Reading `/users/other_uid` while signed in as `attacker_uid`.
11. **Invalid Outcome Enum on CityLegacy**: Creating a legacy with `outcome: "hacked_god_mode"`.
12. **Mutation of Terminal Legacy Record**: Attempting `update` on `/legacies/{legacyId}`.
