# Skyline Messenger Security Specification

## Data Invariants
- A user can only read their own profile or other users' basic profiles.
- A user can only see chats they are a participant of.
- A user can only read/write messages in a chat they belong to.
- `senderId` in a message must always match the authenticated user's ID.
- `participants` in a chat must be a list of valid user IDs and must includes the creator.

## The Dirty Dozen (Test Cases)
1. **Identity Theft**: User A tries to update user B's profile. (Expected: DENIED)
2. **Ghost Message**: User A tries to send a message as User B. (Expected: DENIED)
3. **Eavesdropping**: User A tries to read messages from a chat between User B and User C. (Expected: DENIED)
4. **Illegal Participant**: User A tries to create a chat where they are not a participant. (Expected: DENIED)
5. **Unauthorized Last Message**: User A tries to update the `lastMessage` of a chat they aren't in. (Expected: DENIED)
6. **Shadow Field Injection**: User A tries to add a `role: 'admin'` field to their profile. (Expected: DENIED)
7. **Malformed ID**: User A tries to use a 1MB string as a chatId. (Expected: DENIED)
8. **Invalid Media URL**: User A tries to send a message with a non-string `mediaUrl`. (Expected: DENIED)
9. **Terminal State Break**: User tries to change `createdAt` of a message after creation. (Expected: DENIED)
10. **Query Scraping**: User A tries to list all users' phone numbers. (Expected: DENIED)
11. **Excessive Participants**: User tries to create a group with 10,000 members in one array. (Expected: DENIED)
12. **Future Timestamp**: User tries to set a `timestamp` in the future relative to server time. (Expected: DENIED)

## Implementation Plan
- Use `isValidId` for all path variables.
- Use `isValidUser`, `isValidChat`, `isValidMessage` helpers.
- Use `isParticipant` helper for chat access.
- Restrict `phoneNumber` read to owner only.
