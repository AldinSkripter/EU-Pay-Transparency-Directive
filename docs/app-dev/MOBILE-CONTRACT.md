# Proposed mobile contract — not implemented

Keep the existing web session flow intact. Use an established OAuth/OIDC provider or reviewed authorization server for native apps, authorization code + PKCE S256 through the system browser. A Flutter binary is a public client: no client secret or database credentials in it.

Decisions required jointly:

| Item | Proposed direction | Current status |
|---|---|---|
| API version | `/api/v1` with explicitly supported schemas | Not implemented |
| Login | System browser, authorization code + PKCE, validated state/nonce | Provider not chosen |
| Redirects | Verified HTTPS universal/app links; allowlisted callbacks | Domains/IDs not supplied |
| Tokens | Short-lived audience-bound access tokens; rotated refresh tokens, replay detection | Not implemented |
| Device storage | OS Keychain/Keystore through reviewed Flutter integration | Mobile team |
| Logout | Revoke device refresh session, clear local data | Existing web logout only |
| Module access | Server returns Pay/Finance status, role and capabilities | No unified production mobile endpoint |
| Tenant | Server resolves authorized membership; rejects spoofed company IDs | Existing session tenant enforcement |
| Files | Authenticated binary downloads; bounded uploads; no public payroll URLs | Existing web routes |
| Retry | Request IDs and idempotency for create/issue/payment | General idempotency not implemented |
| Pagination | Bounded collections with cursor pagination | Finance currently returns whole development state |
| Push | Device token registration, provider delivery and opt-in | Not implemented |

The development OpenAPI cookie scheme describes today's web behavior only. The future bearer scheme must not be treated as available until the backend actually verifies token signature, issuer, audience, expiry, tenant membership and module permissions.

Separate rollout tasks:

1. Choose identity provider, app identifiers, domains, staging hosting and ownership.
2. Approve versioned core schemas and examples; generate typed Dart models from that reviewed contract.
3. Implement native auth and enforce permissions without weakening existing web CSRF/origin controls.
4. Add contract tests executed by both teams and documented compatibility/deprecation rules.
5. Add paging and safe retry semantics before large mobile datasets and background writes.
6. Run real-device acceptance and independent production readiness checks.
